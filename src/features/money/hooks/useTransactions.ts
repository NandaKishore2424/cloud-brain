import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { formatDayHeading, type CalendarDate, type DateRange } from '@/lib/date';

import { transactionsInRange, type TransactionListItem } from '../api';

/**
 * One entry in the flattened list fed to FlashList.
 *
 * FlashList wants a flat array, not nested sections. Flattening headers and
 * rows into one list — rather than nesting a list per day — keeps recycling
 * working across the whole scroll and lets a single `stickyHeaderIndices`
 * array drive sticky date headers.
 */
export type LedgerRow =
  | {
      kind: 'header';
      /** Stable key. Also the group's calendar date. */
      date: CalendarDate;
      label: string;
      /** Net for the day, in paise. Income positive, expense negative. */
      dayNet: number;
    }
  | {
      kind: 'item';
      item: TransactionListItem;
    };

export type LedgerData = {
  rows: LedgerRow[];
  /** Indices of header rows — handed to FlashList for sticky behaviour. */
  stickyIndices: number[];
  isEmpty: boolean;
  isLoading: boolean;
  error: Error | undefined;
};

/**
 * Reactive ledger for a date range, grouped by day.
 *
 * `useLiveQuery` re-runs the query whenever SQLite commits a write anywhere in
 * the app, so saving a transaction updates this list with no refetch, no cache
 * invalidation and no query key.
 *
 * The query object is memoised on the range bounds. Without that, a new query
 * object would be constructed on every render and `useLiveQuery` would tear
 * down and re-establish its subscription each time.
 */
export function useTransactions(range: DateRange): LedgerData {
  const query = useMemo(
    () => transactionsInRange(range),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bounds identify the query
    [range.start, range.end],
  );

  const { data, error, updatedAt } = useLiveQuery(query, [query]);

  const { rows, stickyIndices } = useMemo(
    () => groupByDay(data ?? []),
    [data],
  );

  return {
    rows,
    stickyIndices,
    isEmpty: rows.length === 0,
    // `updatedAt` is undefined until the first result arrives. Distinguishing
    // "not loaded yet" from "loaded and genuinely empty" is what stops the
    // empty state flashing on every mount.
    isLoading: updatedAt === undefined && error === undefined,
    error,
  };
}

/**
 * Turn a date-sorted transaction array into header/item rows.
 *
 * Single pass, O(n). Relies on the query's `ORDER BY occurred_on DESC` — rows
 * for a given day arrive contiguously, so a day boundary is just "this row's
 * date differs from the previous row's".
 */
function groupByDay(items: readonly TransactionListItem[]): {
  rows: LedgerRow[];
  stickyIndices: number[];
} {
  const rows: LedgerRow[] = [];
  const stickyIndices: number[] = [];

  let currentDate: CalendarDate | null = null;
  let headerIndex = -1;
  let dayNet = 0;

  const flushDayNet = () => {
    if (headerIndex < 0) return;
    const header = rows[headerIndex];
    if (header && header.kind === 'header') header.dayNet = dayNet;
  };

  for (const item of items) {
    if (item.occurredOn !== currentDate) {
      flushDayNet();

      currentDate = item.occurredOn;
      dayNet = 0;
      headerIndex = rows.length;

      stickyIndices.push(headerIndex);
      rows.push({
        kind: 'header',
        date: item.occurredOn,
        label: formatDayHeading(item.occurredOn),
        dayNet: 0,
      });
    }

    dayNet += item.type === 'income' ? item.amount : -item.amount;
    rows.push({ kind: 'item', item });
  }

  flushDayNet();

  return { rows, stickyIndices };
}
