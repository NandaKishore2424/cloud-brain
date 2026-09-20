import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { accounts, categories, transactions, type TransactionType } from '@/db/schema';
import { attempt, err, ok, type Result } from '@/lib/result';

/**
 * Categories, ordered by recency of use.
 *
 * This is the single highest-leverage detail in the entry flow. A static
 * alphabetical list means the user hunts for "Food & Dining" every single time.
 * Ordering by last use means that after a week of real usage, the three or four
 * categories a person actually spends on sit at the front, and picking one
 * becomes a single tap with no scrolling.
 *
 * `MAX(t.created_at)` per category gives last-used. Categories never used yield
 * NULL, and SQLite sorts NULLs last under `DESC` — so unused categories fall to
 * the back automatically, ordered by their seeded `sort_order`.
 *
 * The `deleted_at IS NULL` check sits in the JOIN condition, not the WHERE
 * clause. In the WHERE clause it would filter out categories whose only
 * transactions are deleted — turning the LEFT JOIN into an INNER JOIN and
 * silently removing those categories from the picker.
 */
export function categoriesByRecency(kind: TransactionType) {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      kind: categories.kind,
      icon: categories.icon,
      colorToken: categories.colorToken,
      sortOrder: categories.sortOrder,
      lastUsedAt: sql<number | null>`max(${transactions.createdAt})`.as('last_used_at'),
      useCount: sql<number>`count(${transactions.id})`.as('use_count'),
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(
        eq(transactions.categoryId, categories.id),
        isNull(transactions.deletedAt),
      ),
    )
    .where(and(isNull(categories.deletedAt), eq(categories.kind, kind)))
    .groupBy(categories.id)
    .orderBy(desc(sql`last_used_at`), asc(categories.sortOrder));
}

/** All live categories of one kind, in seeded order. For settings screens. */
export function categoriesByKind(kind: TransactionType) {
  return db
    .select()
    .from(categories)
    .where(and(isNull(categories.deletedAt), eq(categories.kind, kind)))
    .orderBy(asc(categories.sortOrder));
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

export function liveAccounts() {
  return db
    .select()
    .from(accounts)
    .where(and(isNull(accounts.deletedAt), isNull(accounts.archivedAt)))
    .orderBy(asc(accounts.createdAt));
}

/**
 * The account a new transaction defaults to.
 *
 * Phase 1 has no account picker — every transaction lands on the oldest live
 * account, which is the seeded "Cash" row. Asking a user to choose an account
 * before they have more than one is pure friction, and the entry flow has a
 * five-second budget.
 *
 * Resolved from the database rather than hardcoded to the seed UUID so that a
 * user who renames or replaces the starter account does not break entry.
 */
export async function getDefaultAccountId(): Promise<Result<string>> {
  const result = await attempt('DB_READ', 'Could not find an account to use', () =>
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(isNull(accounts.deletedAt), isNull(accounts.archivedAt)))
      .orderBy(asc(accounts.createdAt))
      .limit(1),
  );

  if (!result.ok) return result;

  const row = result.value[0];
  if (!row) {
    return err(
      'NOT_FOUND',
      'No account available. Reinstalling the app will restore the default.',
    );
  }

  return ok(row.id);
}
