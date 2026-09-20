import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { categories, transactions, type TransactionType } from '@/db/schema';
import { nowTimestamp, todayDate, type CalendarDate, type DateRange } from '@/lib/date';
import { newId } from '@/lib/id';
import { attempt, err, ok, type Result } from '@/lib/result';
import type { Paise } from '@/lib/money';

/**
 * Transaction data access.
 *
 * Two distinct export shapes, and the distinction matters:
 *
 *  • **Query builders** (`transactionsInRange`) return an *unexecuted* Drizzle
 *    query. They exist for `useLiveQuery`, which needs the query object itself
 *    so it can re-run it whenever SQLite reports a write. Awaiting one executes
 *    it; passing one to `useLiveQuery` subscribes to it.
 *
 *  • **Mutations** (`createTransaction`, ...) execute immediately and return
 *    `Result<T>`. They never throw.
 *
 * This is the only module where transaction SQL is written. Components import
 * hooks; hooks import this.
 */

/** A transaction joined with its category's display fields. */
export type TransactionListItem = {
  id: string;
  amount: Paise;
  type: TransactionType;
  note: string | null;
  occurredOn: CalendarDate;
  createdAt: number;
  accountId: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColorToken: string | null;
};

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Transactions within an inclusive date range, newest first.
 *
 * The category join is a LEFT join on purpose: a transaction whose category was
 * deleted must still appear in the ledger. Losing a category should never lose
 * money from the list.
 *
 * Secondary sort on `createdAt` so several entries on the same day appear in
 * the order they were recorded rather than in whatever order SQLite returns
 * them, which would make the list shuffle unpredictably between renders.
 */
export function transactionsInRange(range: DateRange) {
  return db
    .select({
      id: transactions.id,
      amount: transactions.amount,
      type: transactions.type,
      note: transactions.note,
      occurredOn: transactions.occurredOn,
      createdAt: transactions.createdAt,
      accountId: transactions.accountId,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColorToken: categories.colorToken,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        isNull(transactions.deletedAt),
        gte(transactions.occurredOn, range.start),
        lte(transactions.occurredOn, range.end),
      ),
    )
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));
}

export async function getTransaction(
  id: string,
): Promise<Result<TransactionListItem>> {
  const result = await attempt('DB_READ', 'Could not load that transaction', () =>
    db
      .select({
        id: transactions.id,
        amount: transactions.amount,
        type: transactions.type,
        note: transactions.note,
        occurredOn: transactions.occurredOn,
        createdAt: transactions.createdAt,
        accountId: transactions.accountId,
        categoryId: transactions.categoryId,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        categoryColorToken: categories.colorToken,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
      .limit(1),
  );

  if (!result.ok) return result;

  const row = result.value[0];
  if (!row) return err('NOT_FOUND', 'That transaction no longer exists');
  return ok(row);
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type CreateTransactionInput = {
  amount: Paise;
  type: TransactionType;
  accountId: string;
  categoryId: string | null;
  occurredOn: CalendarDate;
  note?: string | null;
};

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<Result<string>> {
  // Defence in depth. The UI cannot produce these, and SQLite's CHECK
  // constraints would reject them anyway — but a constraint violation surfaces
  // as an opaque SQLite error, while this produces a message worth showing.
  if (input.amount <= 0) {
    return err('VALIDATION', 'Amount must be more than zero');
  }

  const id = newId();
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not save that transaction', () =>
    db.insert(transactions).values({
      id,
      accountId: input.accountId,
      categoryId: input.categoryId,
      amount: input.amount,
      type: input.type,
      note: normaliseNote(input.note),
      occurredOn: input.occurredOn,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return result.ok ? ok(id) : result;
}

export type UpdateTransactionPatch = Partial<
  Pick<CreateTransactionInput, 'amount' | 'type' | 'categoryId' | 'occurredOn' | 'note'>
>;

export async function updateTransaction(
  id: string,
  patch: UpdateTransactionPatch,
): Promise<Result<void>> {
  if (patch.amount !== undefined && patch.amount <= 0) {
    return err('VALIDATION', 'Amount must be more than zero');
  }

  const result = await attempt('DB_WRITE', 'Could not update that transaction', () =>
    db
      .update(transactions)
      .set({
        ...(patch.amount !== undefined ? { amount: patch.amount } : null),
        ...(patch.type !== undefined ? { type: patch.type } : null),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : null),
        ...(patch.occurredOn !== undefined ? { occurredOn: patch.occurredOn } : null),
        ...(patch.note !== undefined ? { note: normaliseNote(patch.note) } : null),
        // Always bumped. Phase 4 sync resolves conflicts on this column, so an
        // edit that does not move it is an edit the other replica will discard.
        updatedAt: nowTimestamp(),
      })
      .where(eq(transactions.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

/**
 * Soft delete — sets a tombstone rather than removing the row.
 *
 * See ADR 0004: a hard delete is indistinguishable from "this device never had
 * the row", so the server would send it straight back on the next sync.
 */
export async function softDeleteTransaction(id: string): Promise<Result<void>> {
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not delete that transaction', () =>
    db
      .update(transactions)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(transactions.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

/** Undo support — clears the tombstone. */
export async function restoreTransaction(id: string): Promise<Result<void>> {
  const result = await attempt('DB_WRITE', 'Could not restore that transaction', () =>
    db
      .update(transactions)
      .set({ deletedAt: null, updatedAt: nowTimestamp() })
      .where(eq(transactions.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

/* ------------------------------------------------------------------ */
/* Recall                                                              */
/* ------------------------------------------------------------------ */

/**
 * The amounts most often entered against a category.
 *
 * Spending is repetitive in a way that is easy to exploit: the same metro fare,
 * the same lunch, the same monthly rent. Surfacing the three or four amounts a
 * category is actually used with turns the common case from "type four digits"
 * into one tap.
 *
 * Ordered by frequency first, then recency — a fare paid forty times should
 * outrank a one-off paid yesterday. `GROUP BY amount` is what makes this a
 * frequency table rather than a list of recent rows.
 *
 * Reads the whole history rather than a date window on purpose: a rent figure
 * entered monthly is exactly the kind of amount worth recalling, and it would
 * fall out of a 30-day window most of the time.
 */
export function frequentAmounts(
  categoryId: string,
  type: TransactionType,
  limit = 4,
) {
  return db
    .select({
      amount: transactions.amount,
      uses: sql<number>`count(*)`.as('uses'),
      lastUsedAt: sql<number>`max(${transactions.createdAt})`.as('last_used_at'),
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.categoryId, categoryId),
        eq(transactions.type, type),
      ),
    )
    .groupBy(transactions.amount)
    .orderBy(desc(sql`uses`), desc(sql`last_used_at`))
    .limit(limit);
}

/**
 * Copy an existing transaction onto today.
 *
 * The other half of the repetition shortcut: rather than re-entering a recurring
 * expense field by field, repeat the one already recorded. Amount, type,
 * category, account and note carry over; the date does not, because the whole
 * point is that this is a new occurrence.
 *
 * Reads the source inside the same transaction as the insert so a concurrent
 * delete cannot produce a copy of a row that no longer exists.
 */
export async function repeatTransaction(id: string): Promise<Result<string>> {
  const newTransactionId = newId();
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not repeat that transaction', () =>
    db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
        .limit(1);

      if (!source) throw new Error('source transaction is gone');

      await tx.insert(transactions).values({
        id: newTransactionId,
        accountId: source.accountId,
        categoryId: source.categoryId,
        amount: source.amount,
        type: source.type,
        note: source.note,
        occurredOn: todayDate(),
        createdAt: now,
        updatedAt: now,
      });

      return newTransactionId;
    }),
  );

  return result.ok ? ok(result.value) : result;
}

/** Empty and whitespace-only notes are stored as NULL, never as ''. */
function normaliseNote(note: string | null | undefined): string | null {
  if (note === null || note === undefined) return null;
  const trimmed = note.trim();
  return trimmed.length === 0 ? null : trimmed;
}
