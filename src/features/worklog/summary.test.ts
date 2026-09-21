import { describe, expect, it } from 'vitest';

import { asCalendarDate } from '@/lib/date';

import {
  buildAssistantPrompt,
  formatWeekForSharing,
  groupByDay,
  normaliseBody,
  toRows,
  type LogEntry,
} from './summary';

const WEEK = { start: asCalendarDate('2026-09-14'), end: asCalendarDate('2026-09-20') };

function entry(id: string, loggedOn: string, body: string, createdAt: number): LogEntry {
  return { id, loggedOn: asCalendarDate(loggedOn), body, createdAt };
}

describe('groupByDay', () => {
  const entries = [
    entry('b', '2026-09-15', 'second on tue', 20),
    entry('a', '2026-09-14', 'monday', 5),
    entry('c', '2026-09-15', 'first on tue', 10),
  ];

  it('puts the newest day first for the screen', () => {
    expect(groupByDay(entries, 'newest').map((g) => g.date)).toEqual(['2026-09-15', '2026-09-14']);
  });

  it('puts the oldest day first for shared text', () => {
    expect(groupByDay(entries, 'oldest').map((g) => g.date)).toEqual(['2026-09-14', '2026-09-15']);
  });

  // Within a day the order is always chronological, whichever way the days
  // run — the day happened in one direction.
  it('keeps entries within a day in the order they were written', () => {
    const tuesday = groupByDay(entries, 'newest')[0];
    expect(tuesday?.entries.map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('returns nothing for an empty week', () => {
    expect(groupByDay([], 'newest')).toEqual([]);
  });
});

describe('toRows', () => {
  it('emits a header before each day, with its count', () => {
    const rows = toRows([
      entry('a', '2026-09-14', 'x', 1),
      entry('b', '2026-09-14', 'y', 2),
      entry('c', '2026-09-16', 'z', 3),
    ]);

    expect(rows.map((r) => (r.kind === 'header' ? `H${r.count}` : r.entry.id))).toEqual([
      'H1',
      'c',
      'H2',
      'a',
      'b',
    ]);
  });
});

describe('normaliseBody', () => {
  it('trims the ends', () => {
    expect(normaliseBody('  fixed the build  \n')).toBe('fixed the build');
  });

  // Dictation leaves runs of blank lines where the speaker paused.
  it('collapses runs of blank lines to one', () => {
    expect(normaliseBody('one\n\n\n\ntwo')).toBe('one\n\ntwo');
  });

  it('strips trailing spaces on every line', () => {
    expect(normaliseBody('one   \ntwo  ')).toBe('one\ntwo');
  });

  it('reduces whitespace-only input to empty, which the save path refuses', () => {
    expect(normaliseBody('   \n\n  ')).toBe('');
  });
});

describe('formatWeekForSharing', () => {
  it('is empty for an empty week, so the share action can be disabled', () => {
    expect(formatWeekForSharing([], WEEK)).toBe('');
  });

  it('reads Monday first, with absolute dates and bullets', () => {
    const text = formatWeekForSharing(
      [
        entry('b', '2026-09-16', 'Reviewed the payments PR', 2),
        entry('a', '2026-09-14', 'Fixed login redirect', 1),
      ],
      WEEK,
    );

    expect(text).toBe(
      [
        'Work log — 14 – 20 Sep 2026',
        '',
        'Mon, 14 Sep',
        '• Fixed login redirect',
        '',
        'Wed, 16 Sep',
        '• Reviewed the payments PR',
      ].join('\n'),
    );
  });

  it('keeps a multi-line entry under one bullet', () => {
    const text = formatWeekForSharing(
      [entry('a', '2026-09-14', 'Debugged the flaky test\nRoot cause was a shared fixture', 1)],
      WEEK,
    );

    expect(text).toContain('• Debugged the flaky test\n  Root cause was a shared fixture');
  });
});

describe('buildAssistantPrompt', () => {
  it('is empty for an empty week', () => {
    expect(buildAssistantPrompt([], WEEK)).toBe('');
  });

  const prompt = buildAssistantPrompt([entry('a', '2026-09-14', 'Fixed login redirect', 1)], WEEK);

  it('carries the log itself', () => {
    expect(prompt).toContain('• Fixed login redirect');
  });

  // The instruction that matters most: an appraisal is exactly where an
  // invented number does damage.
  it('forbids invented outcomes and asks for a visible placeholder instead', () => {
    expect(prompt).toContain('ONLY what is in the log');
    expect(prompt).toContain('[add result]');
  });

  it('asks for all three uses the log exists for', () => {
    expect(prompt).toContain('Sprint update');
    expect(prompt).toContain('STAR');
    expect(prompt).toContain('CV bullets');
  });
});
