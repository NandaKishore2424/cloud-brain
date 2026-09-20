import { describe, expect, it } from 'vitest';

import {
  accountGuard,
  chunk,
  formatSyncedAt,
  highestTimestamp,
  isLastPage,
  pageQuery,
  PULL_PAGE_SIZE,
} from './plan';

describe('chunk', () => {
  it('returns nothing for an empty list', () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it('leaves a short list in one batch', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it('splits an exact multiple without a trailing empty batch', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it('keeps the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('loses nothing, whatever the size', () => {
    const items = Array.from({ length: 97 }, (_, i) => i);
    for (const size of [1, 2, 7, 96, 97, 98]) {
      expect(chunk(items, size).flat()).toEqual(items);
    }
  });

  it('rejects a size that would not terminate', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('highestTimestamp', () => {
  it('keeps the previous cursor when nothing arrived', () => {
    expect(highestTimestamp(500, [])).toBe(500);
  });

  it('takes the highest value seen', () => {
    expect(highestTimestamp(100, [300, 200, 250])).toBe(300);
  });

  // The important one: an out-of-order or stale row must never rewind the
  // cursor, or every row between the two values is pulled again forever.
  it('never moves backwards', () => {
    expect(highestTimestamp(500, [100, 200])).toBe(500);
  });

  it('ignores non-finite values rather than poisoning the cursor', () => {
    expect(highestTimestamp(500, [Number.NaN, 600])).toBe(600);
    expect(highestTimestamp(500, [Number.NaN])).toBe(500);
  });
});

describe('pageQuery', () => {
  const ID = '0199aa11-bb22-7c33-8d44-ee55ff667788';

  it('asks for everything after the stored cursor on the first page', () => {
    expect(pageQuery(1000, null)).toEqual({ kind: 'since', updatedAt: 1000 });
  });

  it('continues strictly after the last row of the previous page', () => {
    const query = pageQuery(1000, { updatedAt: 1500, id: ID });

    expect(query.kind).toBe('after');
    if (query.kind !== 'after') throw new Error('unreachable');

    // Two disjuncts: a later millisecond, or the same millisecond and a
    // higher id. Together they are "strictly after this row" under the
    // (updated_at, id) sort order.
    expect(query.expression).toBe(
      `updated_at.gt.1500,and(updated_at.eq.1500,id.gt.${ID})`,
    );
  });

  it('refuses an id that is not a uuid instead of interpolating it', () => {
    expect(() => pageQuery(0, { updatedAt: 1, id: 'x,or=(1.eq.1)' })).toThrow(/non-uuid/);
  });

  it('refuses a non-integer timestamp', () => {
    expect(() => pageQuery(0, { updatedAt: 1.5, id: ID })).toThrow(/non-integer/);
  });
});

describe('isLastPage', () => {
  it('stops when the server returns a short page', () => {
    expect(isLastPage(499, PULL_PAGE_SIZE)).toBe(true);
    expect(isLastPage(0, PULL_PAGE_SIZE)).toBe(true);
  });

  it('continues on a full page', () => {
    expect(isLastPage(PULL_PAGE_SIZE, PULL_PAGE_SIZE)).toBe(false);
  });
});

describe('accountGuard', () => {
  const ALICE = 'alice-uuid';
  const BOB = 'bob-uuid';

  it('claims an unclaimed database on first sync', () => {
    expect(accountGuard(null, ALICE)).toEqual({ kind: 'claim' });
    expect(accountGuard('', ALICE)).toEqual({ kind: 'claim' });
  });

  it('allows the account that owns the database', () => {
    expect(accountGuard(ALICE, ALICE)).toEqual({ kind: 'ok' });
  });

  // Without this, signing in as a second account would push the first
  // account's rows into it — stamped with the new user_id, so RLS accepts
  // every one of them.
  it('refuses a different account rather than merging two databases', () => {
    expect(accountGuard(ALICE, BOB)).toEqual({ kind: 'mismatch', storedUserId: ALICE });
  });
});

describe('formatSyncedAt', () => {
  const NOW = 1_700_000_000_000;

  it('says so when sync has never run', () => {
    expect(formatSyncedAt(null, NOW)).toBe('Never synced');
  });

  it('collapses the last minute to "just now"', () => {
    expect(formatSyncedAt(NOW, NOW)).toBe('Synced just now');
    expect(formatSyncedAt(NOW - 44_000, NOW)).toBe('Synced just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(formatSyncedAt(NOW - 5 * 60_000, NOW)).toBe('Synced 5 min ago');
    expect(formatSyncedAt(NOW - 3 * 3_600_000, NOW)).toBe('Synced 3 hours ago');
    expect(formatSyncedAt(NOW - 3_600_000, NOW)).toBe('Synced 1 hour ago');
    expect(formatSyncedAt(NOW - 2 * 86_400_000, NOW)).toBe('Synced 2 days ago');
  });

  // Clock adjustments and server timestamps can both land slightly ahead of
  // the device's idea of now. "Synced -3 min ago" is a bug report waiting to
  // happen.
  it('does not go negative when the timestamp is in the future', () => {
    expect(formatSyncedAt(NOW + 60_000, NOW)).toBe('Synced just now');
  });
});
