import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { todayDate } from '@/lib/date';

import { allApplications, type ApplicationListItem } from '../api';
import { groupByStatus, isActive, type PipelineRow } from '../pipeline';

export type ApplicationsData = {
  rows: PipelineRow<ApplicationListItem>[];
  stickyIndices: number[];
  activeCount: number;
  followUpCount: number;
  total: number;
  isEmpty: boolean;
  isLoading: boolean;
  error: Error | undefined;
};

/**
 * Reactive application pipeline, grouped by stage.
 *
 * `showClosed` filters client-side over the already-loaded list, same reasoning
 * as the todo project filter: the set is small, and keeping one query means
 * toggling the filter does not tear down the `useLiveQuery` subscription.
 */
export function useApplications(showClosed: boolean): ApplicationsData {
  const query = useMemo(() => allApplications(), []);
  const { data, error, updatedAt } = useLiveQuery(query);

  const today = todayDate();

  const filtered = useMemo(() => {
    const all = data ?? [];
    return showClosed ? all : all.filter((item) => isActive(item.status));
  }, [data, showClosed]);

  const grouped = useMemo(() => groupByStatus(filtered, today), [filtered, today]);

  // Counted across the UNFILTERED set — a follow-up hidden by the closed filter
  // is still a follow-up.
  const unfiltered = useMemo(
    () => groupByStatus(data ?? [], today),
    [data, today],
  );

  return {
    rows: grouped.rows,
    stickyIndices: grouped.stickyIndices,
    activeCount: unfiltered.activeCount,
    followUpCount: unfiltered.followUpCount,
    total: (data ?? []).length,
    isEmpty: grouped.rows.length === 0,
    isLoading: updatedAt === undefined && error === undefined,
    error,
  };
}
