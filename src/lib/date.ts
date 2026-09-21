import { differenceInCalendarDays, format } from 'date-fns';

/**
 * Dates and times.
 *
 * Two distinct concepts, stored differently on purpose:
 *
 *  • CalendarDate — "the day this expense happened": 2026-09-20. A wall-calendar
 *    fact with no time and no timezone. Stored as TEXT 'YYYY-MM-DD'.
 *
 *  • Timestamp — "the instant this row was written": 1758300000000. A point on
 *    the global timeline. Stored as INTEGER epoch milliseconds (UTC).
 *
 * Conflating the two is the single most common source of off-by-one-day bugs.
 * If you buy coffee at 11pm IST and the app stores an instant, then renders it
 * in UTC, the expense lands on yesterday. Storing the *day* as text makes that
 * class of bug structurally impossible: there is no timezone to get wrong.
 *
 * Corollary, and it matters: NEVER use `new Date().toISOString().slice(0, 10)`
 * to get today's date. `toISOString` converts to UTC first. At 04:00 IST that
 * returns yesterday. Use `todayDate()`.
 */

declare const calendarDateBrand: unique symbol;

/** 'YYYY-MM-DD'. Branded so a stray string cannot be passed in. */
export type CalendarDate = string & { readonly [calendarDateBrand]: true };

/** Epoch milliseconds, UTC. */
export type Timestamp = number;

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Build a CalendarDate from a Date using its LOCAL components. */
export function toCalendarDate(date: Date): CalendarDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as CalendarDate;
}

export function todayDate(): CalendarDate {
  return toCalendarDate(new Date());
}

/**
 * Validate and brand a string read from the database or from user input.
 *
 * Checks the shape *and* that the day actually exists. `'2026-02-29'` matches
 * the pattern perfectly but 2026 is not a leap year, and `new Date(2026, 1, 29)`
 * silently rolls over to 1 March rather than failing — so a shape-only check
 * would admit a date that quietly becomes a different one.
 *
 * The existence check is the round-trip itself: parse it, format it back, and
 * see whether it survived unchanged. Any rollover shows up as a mismatch.
 */
export function asCalendarDate(value: string): CalendarDate {
  if (!CALENDAR_DATE_RE.test(value)) {
    throw new Error(`Invalid CalendarDate: ${value}`);
  }

  const branded = value as CalendarDate;
  if (toCalendarDate(parseCalendarDate(branded)) !== value) {
    throw new Error(`Invalid CalendarDate (no such day): ${value}`);
  }

  return branded;
}

/**
 * Convert to a Date at LOCAL midnight.
 *
 * Note the explicit component constructor. `new Date('2026-09-20')` is parsed
 * as UTC midnight by spec, which is the previous evening in any timezone west
 * of Greenwich and a different day east of it.
 */
export function parseCalendarDate(value: CalendarDate): Date {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return new Date(year, month - 1, day);
}

export function nowTimestamp(): Timestamp {
  return Date.now();
}

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

/**
 * Heading for a day group in a transaction list.
 * 'Today' · 'Yesterday' · 'Sat, 20 Sep' · 'Sat, 20 Sep 2025' (other years)
 */
export function formatDayHeading(value: CalendarDate): string {
  const date = parseCalendarDate(value);
  const delta = differenceInCalendarDays(new Date(), date);

  if (delta === 0) return 'Today';
  if (delta === 1) return 'Yesterday';
  if (delta === -1) return 'Tomorrow';

  const sameYear = date.getFullYear() === new Date().getFullYear();
  return format(date, sameYear ? 'EEE, d MMM' : 'EEE, d MMM yyyy');
}

/** Short form for dense rows: '20 Sep'. */
export function formatShortDate(value: CalendarDate): string {
  return format(parseCalendarDate(value), 'd MMM');
}

/** 'September 2026' — month view headers. */
export function formatMonthLabel(value: CalendarDate): string {
  return format(parseCalendarDate(value), 'MMMM yyyy');
}

/**
 * Absolute day label: 'Mon, 15 Sep'.
 *
 * Deliberately never 'Today' — this is for text that leaves the app (a shared
 * weekly summary), where a relative word is wrong the moment it is read on a
 * different day.
 */
export function formatWeekday(value: CalendarDate): string {
  return format(parseCalendarDate(value), 'EEE, d MMM');
}

/**
 * A week range, as compact as it can be without ambiguity:
 * '14 – 20 Sep 2026' · '28 Sep – 4 Oct 2026' · '28 Dec 2026 – 3 Jan 2027'.
 */
export function formatWeekLabel(range: DateRange): string {
  const start = parseCalendarDate(range.start);
  const end = parseCalendarDate(range.end);

  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
  }
  return `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`;
}

/** Clock time from a Timestamp: '9:42 pm'. */
export function formatTime(ts: Timestamp): string {
  return format(new Date(ts), 'h:mm a').toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Ranges                                                              */
/* ------------------------------------------------------------------ */

export type DateRange = {
  /** Inclusive. */
  readonly start: CalendarDate;
  /** Inclusive. */
  readonly end: CalendarDate;
};

/**
 * First and last day of the month containing `value`, both inclusive.
 *
 * Inclusive bounds pair with SQL `BETWEEN`, and because CalendarDate is
 * zero-padded 'YYYY-MM-DD', lexicographic string comparison is identical to
 * chronological comparison — so SQLite can answer the range query straight off
 * a plain TEXT index with no date functions involved.
 */
export function monthBounds(value: CalendarDate): DateRange {
  const date = parseCalendarDate(value);
  const year = date.getFullYear();
  const month = date.getMonth();

  return {
    start: toCalendarDate(new Date(year, month, 1)),
    // Day 0 of the next month is the last day of this one — handles leap years.
    end: toCalendarDate(new Date(year, month + 1, 0)),
  };
}

export function currentMonthBounds(): DateRange {
  return monthBounds(todayDate());
}

/**
 * Monday-to-Sunday week containing `value`, both ends inclusive.
 *
 * Monday-first is ISO 8601 and how Indian workplaces count a working week;
 * `Date.getDay()` is Sunday-first, hence the `+ 6) % 7` that turns
 * Sun..Sat = 0..6 into Mon..Sun = 0..6.
 *
 * Built from `addDays` on CalendarDates rather than from epoch arithmetic
 * (`- n * 86_400_000`), which is off by an hour — and so potentially by a day —
 * anywhere that observes daylight saving.
 */
export function weekBounds(value: CalendarDate): DateRange {
  const offsetFromMonday = (parseCalendarDate(value).getDay() + 6) % 7;
  const start = addDays(value, -offsetFromMonday);
  return { start, end: addDays(start, 6) };
}

/** The Monday `weeks` weeks away from the week containing `value`. */
export function shiftWeek(value: CalendarDate, weeks: number): CalendarDate {
  return addDays(weekBounds(value).start, weeks * 7);
}

/** Shift a month window forwards or backwards. */
export function shiftMonth(value: CalendarDate, months: number): CalendarDate {
  const date = parseCalendarDate(value);
  return toCalendarDate(new Date(date.getFullYear(), date.getMonth() + months, 1));
}

/** 'YYYY-MM' — a stable key for grouping and caching by month. */
export function monthKey(value: CalendarDate): string {
  return value.slice(0, 7);
}

export function addDays(value: CalendarDate, days: number): CalendarDate {
  const date = parseCalendarDate(value);
  date.setDate(date.getDate() + days);
  return toCalendarDate(date);
}

/** Positive when `value` is in the past. */
export function daysAgo(value: CalendarDate): number {
  return differenceInCalendarDays(new Date(), parseCalendarDate(value));
}
