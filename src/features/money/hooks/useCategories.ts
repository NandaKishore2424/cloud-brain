import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import type { TransactionType } from '@/db/schema';

import { categoriesByRecency } from '../api';

export type PickerCategory = {
  id: string;
  name: string;
  kind: TransactionType;
  icon: string;
  colorToken: string;
  sortOrder: number;
  lastUsedAt: number | null;
  useCount: number;
};

/**
 * Categories for the picker, most-recently-used first.
 *
 * Reactive, so the ordering re-sorts immediately after a save: the category you
 * just used moves to the front and is a single tap away next time. That
 * feedback loop is what makes the picker get faster with use instead of staying
 * a fixed list you have to scan.
 */
export function useCategoriesByRecency(kind: TransactionType): PickerCategory[] {
  const query = useMemo(() => categoriesByRecency(kind), [kind]);
  const { data } = useLiveQuery(query, [query]);
  return data ?? [];
}
