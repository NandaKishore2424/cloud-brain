import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import type { TransactionType } from '@/db/schema';
import type { Paise } from '@/lib/money';

import { frequentAmounts } from '../api';

export type FrequentAmount = { amount: Paise; uses: number };

/**
 * The amounts this category is usually used with.
 *
 * Reactive, so a newly entered amount is already in the list the next time the
 * category is picked. That feedback loop is what makes the suggestions get
 * better with use rather than staying a fixed guess.
 *
 * Returns nothing until a category is selected — there is no sensible
 * "suggested amount" without one, and querying across all categories would
 * surface a rent figure while the user is buying coffee.
 */
export function useFrequentAmounts(
  categoryId: string | null,
  type: TransactionType,
): FrequentAmount[] {
  const query = useMemo(
    () => (categoryId === null ? null : frequentAmounts(categoryId, type)),
    [categoryId, type],
  );

  // `useLiveQuery` needs a query every render, so an impossible-but-valid one
  // stands in while no category is selected. The result is discarded below.
  const fallback = useMemo(() => frequentAmounts('', type, 1), [type]);
  const { data } = useLiveQuery(query ?? fallback);

  return useMemo(() => {
    if (categoryId === null) return [];
    return (data ?? []).map((row) => ({ amount: row.amount, uses: row.uses }));
  }, [data, categoryId]);
}
