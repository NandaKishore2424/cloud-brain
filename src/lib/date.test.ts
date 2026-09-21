import { describe, expect, it } from 'vitest';

import {
  addDays,
  asCalendarDate,
  formatDayHeading,
  formatWeekLabel,
  formatWeekday,
  monthBounds,
  monthKey,
  parseCalendarDate,
  shiftMonth,
  shiftWeek,
  toCalendarDate,
  todayDate,
  weekBounds,
  type CalendarDate,
} from './date';

/**
 * These tests run with TZ=Asia/Kolkata (UTC+05:30) — set in the npm script.
 *
 * The timezone is not incidental. India is ahead of UTC, so between 00:00 and
 * 05:30 local time the UTC date is still *yesterday*. That window is exactly
 * where `toISOString().slice(0, 10)` silently produces the wrong day, and it is
 * what these tests exist to pin down.
 */

const cd = (s: string) => s as CalendarDate;

describe('toCalendarDate', () => {
  it('uses local calendar components', () => {
    expect(toCalendarDate(new Date(2026, 8, 20))).toBe('2026-09-20');
  });

  it('zero-pads month and day', () => {
    expect(toCalendarDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('keeps the local day late at night', () => {
    // 23:30 IST on the 20th is already the 21st in some zones east of here,
    // and 18:00 UTC on the 20th. The calendar day must stay the 20th.
    expect(toCalendarDate(new Date(2026, 8, 20, 23, 30))).toBe('2026-09-20');
  });

  /**
   * The bug this whole representation exists to prevent.
   *
   * At 04:00 IST the UTC instant is 22:30 the previous day, so
   * `toISOString().slice(0, 10)` returns yesterday. An expense logged early in
   * the morning would land on the wrong date.
   */
  it('diverges from toISOString in the early-morning window', () => {
    const earlyMorning = new Date(2026, 8, 20, 4, 0);

    expect(toCalendarDate(earlyMorning)).toBe('2026-09-20');
    expect(earlyMorning.toISOString().slice(0, 10)).toBe('2026-09-19');
  });
});

describe('parseCalendarDate', () => {
  it('parses to LOCAL midnight, not UTC midnight', () => {
    const parsed = parseCalendarDate(cd('2026-09-20'));

    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(20);
    expect(parsed.getHours()).toBe(0);
  });

  it('round-trips with toCalendarDate', () => {
    // 2024 is a leap year; 2026 is not, so '2026-02-29' is not a real date.
    const original = cd('2024-02-29');
    expect(toCalendarDate(parseCalendarDate(original))).toBe(original);
  });

  /**
   * `new Date('2026-09-20')` is specified to parse as UTC midnight, which in
   * IST is 05:30 on the 20th — same day here, but the previous day anywhere
   * west of Greenwich. The explicit component constructor avoids the class of
   * bug entirely.
   */
  it('does not inherit the UTC parsing of the Date string constructor', () => {
    const viaComponents = parseCalendarDate(cd('2026-09-20'));
    const viaStringParse = new Date('2026-09-20');

    expect(viaComponents.getTime()).not.toBe(viaStringParse.getTime());
    expect(viaStringParse.getTime() - viaComponents.getTime()).toBe(5.5 * 60 * 60 * 1000);
  });
});

describe('asCalendarDate', () => {
  it('accepts a well-formed date', () => {
    expect(asCalendarDate('2026-09-20')).toBe('2026-09-20');
  });

  it('rejects a well-formed date that does not exist', () => {
    // Matches the pattern, but 2026 is not a leap year. Without the
    // existence check this would silently become 1 March.
    expect(() => asCalendarDate('2026-02-29')).toThrow(/no such day/);
    expect(() => asCalendarDate('2026-13-01')).toThrow();
    expect(() => asCalendarDate('2026-04-31')).toThrow();
  });

  it('accepts a real leap day', () => {
    expect(asCalendarDate('2024-02-29')).toBe('2024-02-29');
  });

  it('rejects malformed input', () => {
    expect(() => asCalendarDate('2026-9-20')).toThrow();
    expect(() => asCalendarDate('20-09-2026')).toThrow();
    expect(() => asCalendarDate('')).toThrow();
  });
});

describe('lexicographic ordering', () => {
  /**
   * The property that lets SQLite answer date-range queries off a plain TEXT
   * index with no date functions: zero-padded 'YYYY-MM-DD' sorts
   * lexicographically in the same order it sorts chronologically.
   */
  it('matches chronological ordering', () => {
    const dates = ['2026-09-20', '2025-12-31', '2026-01-01', '2026-09-09'];
    const lexical = [...dates].sort();
    const chronological = [...dates].sort(
      (a, b) =>
        parseCalendarDate(cd(a)).getTime() - parseCalendarDate(cd(b)).getTime(),
    );

    expect(lexical).toEqual(chronological);
  });
});

describe('monthBounds', () => {
  it('spans a 30-day month', () => {
    expect(monthBounds(cd('2026-09-14'))).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });

  it('spans a 31-day month', () => {
    expect(monthBounds(cd('2026-01-01'))).toEqual({
      start: '2026-01-01',
      end: '2026-01-31',
    });
  });

  it('handles February in a non-leap year', () => {
    expect(monthBounds(cd('2026-02-10')).end).toBe('2026-02-28');
  });

  it('handles February in a leap year', () => {
    expect(monthBounds(cd('2024-02-10')).end).toBe('2024-02-29');
  });
});

describe('shiftMonth', () => {
  it('moves backwards across a year boundary', () => {
    expect(shiftMonth(cd('2026-01-15'), -1)).toBe('2025-12-01');
  });

  it('moves forwards across a year boundary', () => {
    expect(shiftMonth(cd('2026-12-15'), 1)).toBe('2027-01-01');
  });

  /**
   * Shifting from the 31st must not spill into the following month. Naive
   * date arithmetic turns 31 Jan + 1 month into 3 March.
   */
  it('does not overflow when the source day exceeds the target month length', () => {
    expect(shiftMonth(cd('2026-01-31'), 1)).toBe('2026-02-01');
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays(cd('2026-09-30'), 1)).toBe('2026-10-01');
  });

  it('crosses a year boundary backwards', () => {
    expect(addDays(cd('2026-01-01'), -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays(cd('2024-02-28'), 1)).toBe('2024-02-29');
  });
});

describe('monthKey', () => {
  it('returns a YYYY-MM grouping key', () => {
    expect(monthKey(cd('2026-09-20'))).toBe('2026-09');
  });
});

describe('formatDayHeading', () => {
  it('labels today and its neighbours relatively', () => {
    const today = todayDate();

    expect(formatDayHeading(today)).toBe('Today');
    expect(formatDayHeading(addDays(today, -1))).toBe('Yesterday');
    expect(formatDayHeading(addDays(today, 1))).toBe('Tomorrow');
  });

  it('falls back to an absolute label further out', () => {
    const today = todayDate();
    const heading = formatDayHeading(addDays(today, -10));

    expect(heading).not.toBe('Today');
    expect(heading).toMatch(/\w{3}, \d{1,2} \w{3}/);
  });
});

describe('weekBounds', () => {
  const d = (value: string) => asCalendarDate(value);

  it('runs Monday to Sunday', () => {
    // 2026-09-14 is a Monday, 2026-09-20 a Sunday.
    expect(weekBounds(d('2026-09-16'))).toEqual({ start: '2026-09-14', end: '2026-09-20' });
  });

  it('keeps a Monday in its own week', () => {
    expect(weekBounds(d('2026-09-14')).start).toBe('2026-09-14');
  });

  // The edge Date.getDay() gets wrong by default: Sunday is 0, so a naive
  // "subtract getDay()" puts Sunday at the START of the following week.
  it('keeps a Sunday at the end of its week, not the start of the next', () => {
    expect(weekBounds(d('2026-09-20'))).toEqual({ start: '2026-09-14', end: '2026-09-20' });
  });

  it('spans a month boundary', () => {
    expect(weekBounds(d('2026-10-01'))).toEqual({ start: '2026-09-28', end: '2026-10-04' });
  });

  it('spans a year boundary', () => {
    expect(weekBounds(d('2027-01-01'))).toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });
});

describe('shiftWeek', () => {
  const d = (value: string) => asCalendarDate(value);

  it('moves to the Monday of an adjacent week', () => {
    expect(shiftWeek(d('2026-09-17'), -1)).toBe('2026-09-07');
    expect(shiftWeek(d('2026-09-17'), 1)).toBe('2026-09-21');
  });

  it('is a no-op on the Monday for zero', () => {
    expect(shiftWeek(d('2026-09-20'), 0)).toBe('2026-09-14');
  });
});

describe('formatWeekLabel', () => {
  const range = (start: string, end: string) => ({
    start: asCalendarDate(start),
    end: asCalendarDate(end),
  });

  it('names the month once when the week sits inside it', () => {
    expect(formatWeekLabel(range('2026-09-14', '2026-09-20'))).toBe('14 – 20 Sep 2026');
  });

  it('names both months across a month boundary', () => {
    expect(formatWeekLabel(range('2026-09-28', '2026-10-04'))).toBe('28 Sep – 4 Oct 2026');
  });

  it('names both years across a year boundary', () => {
    expect(formatWeekLabel(range('2026-12-28', '2027-01-03'))).toBe('28 Dec 2026 – 3 Jan 2027');
  });
});

describe('formatWeekday', () => {
  it('is absolute, never relative', () => {
    expect(formatWeekday(todayDate())).not.toBe('Today');
    expect(formatWeekday(asCalendarDate('2026-09-14'))).toBe('Mon, 14 Sep');
  });
});
