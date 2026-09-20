import { useCallback, useMemo, useState } from 'react';

import {
  currentMonthBounds,
  formatMonthLabel,
  monthBounds,
  shiftMonth,
  todayDate,
  type CalendarDate,
  type DateRange,
} from '@/lib/date';

export type MonthNavigation = {
  /** Inclusive bounds of the visible month. */
  range: DateRange;
  label: string;
  isCurrentMonth: boolean;
  goToPrevious: () => void;
  goToNext: () => void;
  goToCurrent: () => void;
};

/**
 * Which month the Money tab is showing.
 *
 * Holds a single anchor CalendarDate and derives the range from it, rather than
 * storing `{ start, end }` in state. Two pieces of state that must agree is two
 * pieces of state that can disagree — deriving guarantees the bounds always
 * describe the same month.
 */
export function useMonthNavigation(): MonthNavigation {
  const [anchor, setAnchor] = useState<CalendarDate>(() => todayDate());

  const range = useMemo(() => monthBounds(anchor), [anchor]);
  const label = useMemo(() => formatMonthLabel(anchor), [anchor]);

  const isCurrentMonth = useMemo(
    () => range.start === currentMonthBounds().start,
    [range.start],
  );

  const goToPrevious = useCallback(
    () => setAnchor((current) => shiftMonth(current, -1)),
    [],
  );
  const goToNext = useCallback(
    () => setAnchor((current) => shiftMonth(current, 1)),
    [],
  );
  const goToCurrent = useCallback(() => setAnchor(todayDate()), []);

  return { range, label, isCurrentMonth, goToPrevious, goToNext, goToCurrent };
}
