import { describe, expect, it } from 'vitest';

import {
  ORDER_GAP,
  orderBetween,
  orderForMove,
  orderForNewItem,
  renormalise,
} from './ordering';

describe('orderForNewItem', () => {
  it('starts at zero for an empty list', () => {
    expect(orderForNewItem(null)).toBe(0);
  });

  it('places a new todo one gap above the current top', () => {
    expect(orderForNewItem(0)).toBe(-ORDER_GAP);
    expect(orderForNewItem(-ORDER_GAP)).toBe(-2 * ORDER_GAP);
  });
});

describe('orderBetween', () => {
  it('returns zero when the list is empty', () => {
    expect(orderBetween(null, null)).toBe(0);
  });

  it('moves above the first item', () => {
    expect(orderBetween(null, 0)).toBe(-ORDER_GAP);
  });

  it('moves below the last item', () => {
    expect(orderBetween(0, null)).toBe(ORDER_GAP);
  });

  it('returns the midpoint between two neighbours', () => {
    expect(orderBetween(0, ORDER_GAP)).toBe(ORDER_GAP / 2);
    expect(orderBetween(100, 200)).toBe(150);
  });

  it('handles an odd-width gap without landing on a neighbour', () => {
    const result = orderBetween(10, 13);
    expect(result).toBe(11);
    expect(result).toBeGreaterThan(10);
    expect(result).toBeLessThan(13);
  });

  it('returns null when neighbours are adjacent integers', () => {
    expect(orderBetween(10, 11)).toBeNull();
  });

  it('returns null when neighbours are equal or inverted', () => {
    expect(orderBetween(10, 10)).toBeNull();
    expect(orderBetween(20, 10)).toBeNull();
  });

  /**
   * The exhaustion path. Repeatedly inserting at the same position halves the
   * gap each time; with ORDER_GAP = 65536 that is 16 insertions before there is
   * no integer left. This pins both that it survives that many AND that it
   * fails cleanly rather than silently colliding.
   */
  it('survives repeated insertion at the same position, then reports exhaustion', () => {
    const lower = 0;
    let upper = ORDER_GAP;
    let insertions = 0;

    for (;;) {
      const next = orderBetween(lower, upper);
      if (next === null) break;

      expect(next).toBeGreaterThan(lower);
      expect(next).toBeLessThan(upper);

      upper = next;
      insertions += 1;

      // Guards against an infinite loop if the implementation ever stops
      // converging — the test must fail, not hang.
      expect(insertions).toBeLessThan(100);
    }

    expect(insertions).toBe(16);
  });

  it('stays exact with large values', () => {
    const a = Number.MAX_SAFE_INTEGER - 1000;
    const b = Number.MAX_SAFE_INTEGER - 100;
    const mid = orderBetween(a, b);

    expect(mid).not.toBeNull();
    expect(Number.isSafeInteger(mid)).toBe(true);
    expect(mid as number).toBeGreaterThan(a);
    expect(mid as number).toBeLessThan(b);
  });
});

describe('renormalise', () => {
  it('re-spaces items at gap intervals from zero', () => {
    expect(renormalise([{ id: 'a' }, { id: 'b' }, { id: 'c' }])).toEqual([
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: ORDER_GAP },
      { id: 'c', sortOrder: 2 * ORDER_GAP },
    ]);
  });

  it('preserves the given order', () => {
    const result = renormalise([{ id: 'c' }, { id: 'a' }, { id: 'b' }]);
    expect(result.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  it('handles an empty list', () => {
    expect(renormalise([])).toEqual([]);
  });
});

describe('orderForMove', () => {
  const list = [
    { id: 'a', sortOrder: 0 },
    { id: 'b', sortOrder: 100 },
    { id: 'c', sortOrder: 200 },
    { id: 'd', sortOrder: 300 },
  ];

  it('reports a no-op when nothing moves', () => {
    expect(orderForMove(list, 1, 1)).toBeUndefined();
  });

  it('reports a no-op for an out-of-range index', () => {
    expect(orderForMove(list, -1, 2)).toBeUndefined();
    expect(orderForMove(list, 0, 99)).toBeUndefined();
  });

  it('moves an item to the top', () => {
    // Target neighbours after removal: none before, 'a' (0) after.
    expect(orderForMove(list, 2, 0)).toBe(-ORDER_GAP);
  });

  it('moves an item to the bottom', () => {
    // After removing 'a', landing at the last index sits after 'd' (300).
    expect(orderForMove(list, 0, 3)).toBe(300 + ORDER_GAP);
  });

  /**
   * Neighbours must be computed from the list with the moving item REMOVED.
   * Using the original indices would take the item's own position as a
   * neighbour and produce an order that leaves it exactly where it was.
   */
  it('computes neighbours after removing the moving item', () => {
    // Move 'a' (index 0) to index 1: it should land between 'b' (100) and
    // 'c' (200), i.e. 150 — not between 'a' and 'b'.
    expect(orderForMove(list, 0, 1)).toBe(150);
  });

  it('moves an item upward by one', () => {
    // Move 'c' (index 2) to index 1: between 'a' (0) and 'b' (100).
    expect(orderForMove(list, 2, 1)).toBe(50);
  });

  it('returns null when the destination gap is exhausted', () => {
    const tight = [
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
    ];
    // Landing between 0 and 1 leaves no integer.
    expect(orderForMove(tight, 2, 1)).toBeNull();
  });

  it('produces an order that actually yields the intended sequence', () => {
    // Move 'd' to index 1, then verify sorting by the new orders gives the
    // sequence the user asked for.
    const target = orderForMove(list, 3, 1);
    expect(target).not.toBeNull();

    const applied = list
      .map((item) =>
        item.id === 'd' ? { ...item, sortOrder: target as number } : item,
      )
      .sort((x, y) => x.sortOrder - y.sortOrder);

    expect(applied.map((item) => item.id)).toEqual(['a', 'd', 'b', 'c']);
  });
});
