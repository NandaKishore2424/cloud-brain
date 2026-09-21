import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { todayDate } from '@/lib/date';

import { openTodos, type TodoListItem } from '../api';
import { groupTodos, type TodoRow } from '../grouping';

export type TodosData = {
  rows: TodoRow<TodoListItem>[];
  stickyIndices: number[];
  overdueCount: number;
  openCount: number;
  isEmpty: boolean;
  isLoading: boolean;
  error: Error | undefined;
};

/**
 * Reactive open-todo list, bucketed by due date.
 *
 * `project` filters client-side rather than in SQL. Two reasons: the open-todo
 * set for one person is small enough that filtering an in-memory array is
 * faster than a second round trip, and keeping one query means switching filter
 * chips does not tear down and re-establish the `useLiveQuery` subscription —
 * so the list re-filters instantly instead of blanking and refilling.
 *
 * `today` participates in the memo as a plain string, so grouping recomputes
 * when the calendar day actually rolls over rather than on every render.
 */
export function useTodos(project: string | null): TodosData {
  const query = useMemo(() => openTodos(), []);
  const { data, error, updatedAt } = useLiveQuery(query, [query]);

  const today = todayDate();

  const filtered = useMemo(() => {
    const all = data ?? [];
    return project === null ? all : all.filter((todo) => todo.project === project);
  }, [data, project]);

  const grouped = useMemo(() => groupTodos(filtered, today), [filtered, today]);

  // Counted across the UNFILTERED set: an overdue task hidden by the active
  // project filter is still overdue, and the badge should say so.
  const overdueCount = useMemo(
    () => groupTodos(data ?? [], today).overdueCount,
    [data, today],
  );

  return {
    rows: grouped.rows,
    stickyIndices: grouped.stickyIndices,
    overdueCount,
    openCount: filtered.length,
    isEmpty: grouped.rows.length === 0,
    isLoading: updatedAt === undefined && error === undefined,
    error,
  };
}
