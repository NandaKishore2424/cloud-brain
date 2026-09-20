import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import type { DateRange } from '@/lib/date';

import {
  categoryTotals,
  foldMonthTotals,
  monthTotals,
  type CategoryTotalRow,
  type MonthSummary,
} from '../api';

/**
 * Income / expense / net for a range.
 *
 * Re-runs on every committed write, so the header updates the instant a
 * transaction is saved — same subscription mechanism as the list, which is why
 * the two can never disagree. A cached summary would be a second source of
 * truth that drifts.
 */
export function useMonthSummary(range: DateRange): MonthSummary {
  const query = useMemo(
    () => monthTotals(range),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bounds identify the query
    [range.start, range.end],
  );

  const { data } = useLiveQuery(query);

  return useMemo(() => foldMonthTotals(data), [data]);
}

export type CategoryBreakdown = {
  rows: CategoryTotalRow[];
  /** Largest single category total, for scaling the proportion bars. */
  max: number;
  /** Sum across all rows — the denominator for percentage labels. */
  total: number;
};

/** Expense-only spend per category, largest first. */
export function useCategoryBreakdown(range: DateRange): CategoryBreakdown {
  const query = useMemo(
    () => categoryTotals(range),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bounds identify the query
    [range.start, range.end],
  );

  const { data } = useLiveQuery(query);

  return useMemo(() => {
    const rows = data ?? [];
    let max = 0;
    let total = 0;

    for (const row of rows) {
      if (row.total > max) max = row.total;
      total += row.total;
    }

    return { rows, max, total };
  }, [data]);
}
