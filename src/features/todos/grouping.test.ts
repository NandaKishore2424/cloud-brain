import { describe, expect, it } from 'vitest';

import { addDays, type CalendarDate } from '@/lib/date';

import { bucketFor, groupTodos, type Groupable } from './grouping';

const TODAY = '2026-09-20' as CalendarDate;
const cd = (s: string) => s as CalendarDate;

const todo = (
  id: string,
  dueOn: string | null,
  sortOrder = 0,
): Groupable => ({ id, dueOn: dueOn === null ? null : cd(dueOn), sortOrder });

describe('bucketFor', () => {
  it('buckets an undated todo as someday', () => {
    expect(bucketFor(null, TODAY)).toBe('someday');
  });

  it('buckets a past date as overdue', () => {
    expect(bucketFor(cd('2026-09-19'), TODAY)).toBe('overdue');
    expect(bucketFor(cd('2025-01-01'), TODAY)).toBe('overdue');
  });

  it('buckets today and tomorrow distinctly', () => {
    expect(bucketFor(TODAY, TODAY)).toBe('today');
    expect(bucketFor(addDays(TODAY, 1), TODAY)).toBe('tomorrow');
  });

  it('buckets anything further ahead as upcoming', () => {
    expect(bucketFor(addDays(TODAY, 2), TODAY)).toBe('upcoming');
    expect(bucketFor(cd('2030-01-01'), TODAY)).toBe('upcoming');
  });

  it('buckets correctly across a month boundary', () => {
    const monthEnd = cd('2026-09-30');
    expect(bucketFor(cd('2026-10-01'), monthEnd)).toBe('tomorrow');
    expect(bucketFor(cd('2026-09-29'), monthEnd)).toBe('overdue');
  });

  it('buckets correctly across a year boundary', () => {
    const yearEnd = cd('2026-12-31');
    expect(bucketFor(cd('2027-01-01'), yearEnd)).toBe('tomorrow');
    expect(bucketFor(cd('2026-12-30'), yearEnd)).toBe('overdue');
  });
});

describe('groupTodos', () => {
  it('returns nothing for an empty list', () => {
    const result = groupTodos([], TODAY);
    expect(result.rows).toEqual([]);
    expect(result.stickyIndices).toEqual([]);
    expect(result.overdueCount).toBe(0);
  });

  it('emits buckets in urgency order', () => {
    const result = groupTodos(
      [
        todo('someday', null),
        todo('upcoming', '2026-09-25'),
        todo('overdue', '2026-09-01'),
        todo('today', '2026-09-20'),
        todo('tomorrow', '2026-09-21'),
      ],
      TODAY,
    );

    const headers = result.rows.flatMap((row) =>
      row.kind === 'header' ? [row.bucket] : [],
    );

    expect(headers).toEqual(['overdue', 'today', 'tomorrow', 'upcoming', 'someday']);
  });

  it('omits empty buckets entirely', () => {
    const result = groupTodos([todo('a', null)], TODAY);

    const headers = result.rows.flatMap((row) =>
      row.kind === 'header' ? [row.bucket] : [],
    );

    expect(headers).toEqual(['someday']);
  });

  it('places a header immediately before its items', () => {
    const result = groupTodos(
      [todo('a', '2026-09-20'), todo('b', '2026-09-20')],
      TODAY,
    );

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]?.kind).toBe('header');
    expect(result.rows[1]?.kind).toBe('item');
    expect(result.rows[2]?.kind).toBe('item');
  });

  it('reports a count on each header', () => {
    const result = groupTodos(
      [todo('a', '2026-09-20'), todo('b', '2026-09-20'), todo('c', null)],
      TODAY,
    );

    const header = result.rows.find(
      (row) => row.kind === 'header' && row.bucket === 'today',
    );
    expect(header?.kind === 'header' && header.count).toBe(2);
  });

  it('points stickyIndices at exactly the header rows', () => {
    const result = groupTodos(
      [todo('a', '2026-09-01'), todo('b', '2026-09-20'), todo('c', null)],
      TODAY,
    );

    expect(result.stickyIndices).toHaveLength(3);
    for (const index of result.stickyIndices) {
      expect(result.rows[index]?.kind).toBe('header');
    }
  });

  it('sorts within a bucket by sortOrder, not by input order', () => {
    const result = groupTodos(
      [
        todo('third', '2026-09-20', 300),
        todo('first', '2026-09-20', 100),
        todo('second', '2026-09-20', 200),
      ],
      TODAY,
    );

    const ids = result.rows.flatMap((row) =>
      row.kind === 'item' ? [row.item.id] : [],
    );

    expect(ids).toEqual(['first', 'second', 'third']);
  });

  /**
   * Two todos can share a sortOrder after a Phase 4 sync merges concurrent
   * inserts from two devices. Without a tiebreak the comparator is not a total
   * order and rows can swap between renders, which reads as the list jittering.
   */
  it('breaks sortOrder ties deterministically', () => {
    const build = () =>
      groupTodos(
        [
          todo('zebra', '2026-09-20', 100),
          todo('alpha', '2026-09-20', 100),
        ],
        TODAY,
      );

    const ids = (result: ReturnType<typeof build>) =>
      result.rows.flatMap((row) => (row.kind === 'item' ? [row.item.id] : []));

    expect(ids(build())).toEqual(['alpha', 'zebra']);
    // Stable across repeated calls.
    expect(ids(build())).toEqual(ids(build()));
  });

  it('counts overdue items', () => {
    const result = groupTodos(
      [
        todo('a', '2026-09-01'),
        todo('b', '2026-09-19'),
        todo('c', '2026-09-20'),
      ],
      TODAY,
    );

    expect(result.overdueCount).toBe(2);
  });

  it('does not mutate the input array order', () => {
    const input = [
      todo('c', '2026-09-20', 300),
      todo('a', '2026-09-20', 100),
    ];
    const snapshot = input.map((t) => t.id);

    groupTodos(input, TODAY);

    expect(input.map((t) => t.id)).toEqual(snapshot);
  });
});
