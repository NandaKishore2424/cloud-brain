import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { categories, transactions } from '@/db/schema';
import type { DateRange } from '@/lib/date';

/**
 * Monthly aggregates.
 *
 * These are SQL `SUM`/`GROUP BY` queries, not JavaScript reductions over a
 * fetched array. That matters for more than tidiness:
 *
 *  • SQLite aggregates over the index without materialising rows into JS. A
 *    `reduce` would deserialise every column of every transaction, allocate an
 *    object per row, then throw all of it away to produce two numbers.
 *  • The cost stays flat as history grows. A year of data is thousands of rows;
 *    the aggregate still returns two.
 *  • `useLiveQuery` re-runs this on every write. Doing it in JS would mean
 *    re-reading and re-allocating the entire month on every keystroke-fast save.
 *
 * All sums stay in integer paise — SQLite's SUM over INTEGER returns an
 * INTEGER, so no float ever enters the pipeline.
 */

export type MonthTotalsRow = {
  type: 'income' | 'expense';
  total: number;
  count: number;
};

/**
 * Income and expense totals for a range, as at most two rows.
 *
 * Returns only the types that actually occur — a month with no income yields a
 * single row. Callers must not index positionally; use `foldMonthTotals`.
 */
export function monthTotals(range: DateRange) {
  return db
    .select({
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.as('total'),
      count: sql<number>`count(*)`.as('count'),
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        gte(transactions.occurredOn, range.start),
        lte(transactions.occurredOn, range.end),
      ),
    )
    .groupBy(transactions.type);
}

export type MonthSummary = {
  income: number;
  expense: number;
  /** income − expense. Negative means the month ran at a loss. */
  net: number;
  transactionCount: number;
};

/** Collapse the (0, 1 or 2) rows from `monthTotals` into a total summary. */
export function foldMonthTotals(
  rows: readonly MonthTotalsRow[] | undefined,
): MonthSummary {
  let income = 0;
  let expense = 0;
  let transactionCount = 0;

  for (const row of rows ?? []) {
    if (row.type === 'income') income += row.total;
    else expense += row.total;
    transactionCount += row.count;
  }

  return { income, expense, net: income - expense, transactionCount };
}

export type CategoryTotalRow = {
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColorToken: string | null;
  total: number;
  count: number;
};

/**
 * Spend per category for a range, largest first.
 *
 * Expense-only. Mixing income into a "where did the money go" breakdown makes
 * the proportions meaningless — salary would dominate every chart and bury the
 * categories the user is actually trying to examine.
 */
export function categoryTotals(range: DateRange) {
  return db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColorToken: categories.colorToken,
      total: sql<number>`sum(${transactions.amount})`.as('total'),
      count: sql<number>`count(*)`.as('count'),
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.type, 'expense'),
        gte(transactions.occurredOn, range.start),
        lte(transactions.occurredOn, range.end),
      ),
    )
    .groupBy(transactions.categoryId)
    .orderBy(desc(sql`total`));
}
