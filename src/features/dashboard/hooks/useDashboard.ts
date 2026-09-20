import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { currentMonthBounds, todayDate, type CalendarDate } from '@/lib/date';

import {
  activeApplicationCount,
  followUpsDueBy,
  monthTotals,
  openTodoCount,
  recentNotes,
  spentOn,
  todosDueBy,
} from '../api';

export type DashboardTodo = {
  id: string;
  title: string;
  dueOn: CalendarDate | null;
  priority: 'low' | 'normal' | 'high';
};

export type DashboardFollowUp = {
  id: string;
  company: string;
  role: string;
  nextAction: string | null;
  nextActionOn: CalendarDate | null;
};

export type DashboardNote = {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  pinnedAt: number | null;
};

export type DashboardData = {
  today: CalendarDate;
  /** Paise. */
  monthIncome: number;
  monthExpense: number;
  monthNet: number;
  spentToday: number;
  dueToday: DashboardTodo[];
  overdueTodos: DashboardTodo[];
  openTodos: number;
  followUps: DashboardFollowUp[];
  activeApplications: number;
  notes: DashboardNote[];
  /** True when there is genuinely nothing to show yet. */
  isEmpty: boolean;
};

/**
 * Everything the dashboard renders, in one reactive hook.
 *
 * Seven live queries rather than one join. They are independent read models
 * over different tables, and `useLiveQuery` re-runs each on any committed write
 * — so a join would recompute all seven whenever any one of them changed, and
 * would need outer joins across four unrelated tables to express at all.
 *
 * Each query is indexed and capped, so the total cost is a handful of index
 * seeks on a database that lives on the device.
 */
export function useDashboard(): DashboardData {
  const today = todayDate();
  const range = useMemo(() => currentMonthBounds(), []);

  const totals = useLiveQuery(useMemo(() => monthTotals(range), [range]));
  const todaySpend = useLiveQuery(useMemo(() => spentOn(today), [today]));
  const due = useLiveQuery(useMemo(() => todosDueBy(today), [today]));
  const openTodos = useLiveQuery(useMemo(() => openTodoCount(), []));
  const follow = useLiveQuery(useMemo(() => followUpsDueBy(today), [today]));
  const activeApps = useLiveQuery(useMemo(() => activeApplicationCount(), []));
  const notes = useLiveQuery(useMemo(() => recentNotes(3), []));

  return useMemo(() => {
    let monthIncome = 0;
    let monthExpense = 0;
    for (const row of totals.data ?? []) {
      if (row.type === 'income') monthIncome += row.total;
      else monthExpense += row.total;
    }

    const dueRows = due.data ?? [];
    // One pass, split on the date rather than two filtered queries.
    const overdueTodos: DashboardTodo[] = [];
    const dueToday: DashboardTodo[] = [];
    for (const row of dueRows) {
      if (row.dueOn !== null && row.dueOn < today) overdueTodos.push(row);
      else dueToday.push(row);
    }

    const openTodoTotal = openTodos.data?.[0]?.count ?? 0;
    const activeApplications = activeApps.data?.[0]?.count ?? 0;
    const noteRows = notes.data ?? [];

    return {
      today,
      monthIncome,
      monthExpense,
      monthNet: monthIncome - monthExpense,
      spentToday: todaySpend.data?.[0]?.total ?? 0,
      dueToday,
      overdueTodos,
      openTodos: openTodoTotal,
      followUps: follow.data ?? [],
      activeApplications,
      notes: noteRows,
      isEmpty:
        monthIncome === 0 &&
        monthExpense === 0 &&
        openTodoTotal === 0 &&
        activeApplications === 0 &&
        noteRows.length === 0,
    };
  }, [
    totals.data,
    todaySpend.data,
    due.data,
    openTodos.data,
    follow.data,
    activeApps.data,
    notes.data,
    today,
  ]);
}
