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

/** Validate and brand a string read from the database or user input. */
export function asCalendarDate(value: string): CalendarDate {
  if (!CALENDAR_DATE_RE.test(value)) {
    throw new Error(`Invalid CalendarDate: ${value}`);
  }
  return value as CalendarDate;
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
