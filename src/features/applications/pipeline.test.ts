import { describe, expect, it } from 'vitest';

import type { ApplicationStatus } from '@/db/schema';
import type { CalendarDate } from '@/lib/date';

import {
  STATUS_ORDER,
  advanceStatus,
  groupByStatus,
  isActive,
  needsFollowUp,
  type Pipelineable,
} from './pipeline';

const TODAY = '2026-09-20' as CalendarDate;
const cd = (s: string) => s as CalendarDate;

const app = (
  id: string,
  status: ApplicationStatus,
  appliedOn = '2026-09-01',
  nextActionOn: string | null = null,
): Pipelineable => ({
  id,
  status,
  appliedOn: cd(appliedOn),
  nextActionOn: nextActionOn === null ? null : cd(nextActionOn),
});

describe('isActive', () => {
  it('treats in-progress stages as active', () => {
    for (const status of ['applied', 'screen', 'tech', 'onsite', 'offer'] as const) {
      expect(isActive(status)).toBe(true);
    }
  });

  it('treats terminal outcomes as inactive', () => {
    expect(isActive('rejected')).toBe(false);
    expect(isActive('ghosted')).toBe(false);
  });
});

describe('advanceStatus', () => {
  it('walks forward through the funnel', () => {
    expect(advanceStatus('applied')).toBe('screen');
    expect(advanceStatus('screen')).toBe('tech');
    expect(advanceStatus('tech')).toBe('onsite');
    expect(advanceStatus('onsite')).toBe('offer');
  });

  it('has nowhere to go from a terminal stage', () => {
    expect(advanceStatus('offer')).toBeNull();
    expect(advanceStatus('rejected')).toBeNull();
    expect(advanceStatus('ghosted')).toBeNull();
  });
});

describe('needsFollowUp', () => {
  it('flags an overdue next action', () => {
    expect(needsFollowUp(app('a', 'applied', '2026-09-01', '2026-09-15'), TODAY)).toBe(true);
  });

  it('flags one due today', () => {
    expect(needsFollowUp(app('a', 'screen', '2026-09-01', '2026-09-20'), TODAY)).toBe(true);
  });

  it('does not flag one due in the future', () => {
    expect(needsFollowUp(app('a', 'screen', '2026-09-01', '2026-09-25'), TODAY)).toBe(false);
  });

  it('does not flag an application with no next action', () => {
    expect(needsFollowUp(app('a', 'applied'), TODAY)).toBe(false);
  });

  /**
   * The case worth pinning: chasing a company that already rejected you is not
   * a follow-up, however overdue the date is.
   */
  it('never flags a terminal stage, however overdue', () => {
    expect(needsFollowUp(app('a', 'rejected', '2026-01-01', '2026-01-02'), TODAY)).toBe(false);
    expect(needsFollowUp(app('a', 'ghosted', '2026-01-01', '2026-01-02'), TODAY)).toBe(false);
  });
});

describe('groupByStatus', () => {
  it('returns nothing for an empty list', () => {
    const result = groupByStatus([], TODAY);
    expect(result.rows).toEqual([]);
    expect(result.activeCount).toBe(0);
    expect(result.followUpCount).toBe(0);
  });

  /**
   * Furthest-along first, NOT funnel order. Opening the screen should show the
   * offer, not thirty applications that went nowhere.
   */
  it('orders stages furthest-along first', () => {
    const result = groupByStatus(
      [
        app('a', 'applied'),
        app('b', 'offer'),
        app('c', 'rejected'),
        app('d', 'tech'),
      ],
      TODAY,
    );

    const headers = result.rows.flatMap((row) =>
      row.kind === 'header' ? [row.status] : [],
    );

    expect(headers).toEqual(['offer', 'tech', 'applied', 'rejected']);
  });

  it('follows the declared STATUS_ORDER exactly', () => {
    const everyStatus = STATUS_ORDER.map((status, index) => app(`id${index}`, status));
    const result = groupByStatus(everyStatus, TODAY);

    const headers = result.rows.flatMap((row) =>
      row.kind === 'header' ? [row.status] : [],
    );

    expect(headers).toEqual([...STATUS_ORDER]);
  });

  it('omits empty stages', () => {
    const result = groupByStatus([app('a', 'offer')], TODAY);
    const headers = result.rows.flatMap((row) =>
      row.kind === 'header' ? [row.status] : [],
    );
    expect(headers).toEqual(['offer']);
  });

  it('sorts most recently applied first within a stage', () => {
    const result = groupByStatus(
      [
        app('old', 'applied', '2026-01-01'),
        app('new', 'applied', '2026-09-01'),
        app('mid', 'applied', '2026-05-01'),
      ],
      TODAY,
    );

    const ids = result.rows.flatMap((row) => (row.kind === 'item' ? [row.item.id] : []));
    expect(ids).toEqual(['new', 'mid', 'old']);
  });

  it('breaks ties on id so the order is total', () => {
    const build = () =>
      groupByStatus(
        [app('zebra', 'applied', '2026-09-01'), app('alpha', 'applied', '2026-09-01')],
        TODAY,
      );

    const ids = (r: ReturnType<typeof build>) =>
      r.rows.flatMap((row) => (row.kind === 'item' ? [row.item.id] : []));

    expect(ids(build())).toEqual(['alpha', 'zebra']);
    expect(ids(build())).toEqual(ids(build()));
  });

  it('points stickyIndices at exactly the header rows', () => {
    const result = groupByStatus(
      [app('a', 'offer'), app('b', 'applied'), app('c', 'rejected')],
      TODAY,
    );

    expect(result.stickyIndices).toHaveLength(3);
    for (const index of result.stickyIndices) {
      expect(result.rows[index]?.kind).toBe('header');
    }
  });

  it('counts active applications and follow-ups', () => {
    const result = groupByStatus(
      [
        app('a', 'applied', '2026-09-01', '2026-09-10'),
        app('b', 'screen', '2026-09-01', '2026-09-30'),
        app('c', 'rejected', '2026-09-01', '2026-01-01'),
        app('d', 'offer'),
      ],
      TODAY,
    );

    expect(result.activeCount).toBe(3);
    // Only 'a' — 'b' is due in the future and 'c' is terminal.
    expect(result.followUpCount).toBe(1);
  });

  it('does not mutate the input order', () => {
    const input = [app('a', 'applied', '2026-01-01'), app('b', 'applied', '2026-09-01')];
    const snapshot = input.map((item) => item.id);

    groupByStatus(input, TODAY);

    expect(input.map((item) => item.id)).toEqual(snapshot);
  });
});
