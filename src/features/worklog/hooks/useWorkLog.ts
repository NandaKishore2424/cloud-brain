import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback, useMemo, useState } from 'react';

import type { WorkLog } from '@/db/schema';
import { shiftWeek, todayDate, weekBounds, type CalendarDate, type DateRange } from '@/lib/date';

import { workLogForWeek } from '../api';
import { toRows, type WorkLogRow } from '../summary';

export type WorkLogData = {
  readonly range: DateRange;
  readonly entries: readonly WorkLog[];
  readonly rows: readonly WorkLogRow<WorkLog>[];
  readonly isLoading: boolean;
  readonly isCurrentWeek: boolean;
  readonly previousWeek: () => void;
  readonly nextWeek: () => void;
  readonly thisWeek: () => void;
  /** Bring the week containing `day` into view. */
  readonly showDay: (day: CalendarDate) => void;
};

const NO_ENTRIES: readonly WorkLog[] = [];

/**
 * One week of the log, reactive, with navigation.
 *
 * The week is held as an *anchor day* rather than a range, and the range is
 * derived. Storing the range would allow a state where start and end are not
 * a Monday and the Sunday after it; deriving it from one day cannot.
 *
 * The query is memoised on the range and passed as `useLiveQuery`'s dependency
 * — without that, navigating weeks would keep showing the first one. See
 * CLAUDE.md §3, "Live queries".
 */
export function useWorkLog(): WorkLogData {
  const [anchor, setAnchor] = useState<CalendarDate>(() => todayDate());
  const range = useMemo(() => weekBounds(anchor), [anchor]);

  const query = useMemo(() => workLogForWeek(range), [range]);
  const { data, updatedAt } = useLiveQuery(query, [query]);

  const entries = data ?? NO_ENTRIES;
  const rows = useMemo(() => toRows(entries), [entries]);

  const previousWeek = useCallback(() => setAnchor((day) => shiftWeek(day, -1)), []);
  const nextWeek = useCallback(() => setAnchor((day) => shiftWeek(day, 1)), []);
  const thisWeek = useCallback(() => setAnchor(todayDate()), []);
  const showDay = useCallback((day: CalendarDate) => setAnchor(day), []);

  return {
    range,
    entries,
    rows,
    // `updatedAt` is set on the first result, so it distinguishes "still
    // loading" from "loaded, and the week is empty" — two states that need
    // different screens.
    isLoading: updatedAt === undefined,
    isCurrentWeek: range.start === weekBounds(todayDate()).start,
    previousWeek,
    nextWeek,
    thisWeek,
    showDay,
  };
}
