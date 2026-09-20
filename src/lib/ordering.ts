/**
 * Sparse ordering for manually-positioned lists.
 *
 * Lives in `lib` rather than inside the todos feature because nothing here
 * knows what a todo is — it orders anything carrying an id. Notes (Phase 3)
 * will want the same scheme, and `db/seed.ts` needs ORDER_GAP without
 * reaching into a feature, which would invert the dependency direction:
 * infrastructure must not depend on the features built on top of it.
 *
 * The problem: users want to put a todo above another one. The obvious model —
 * `sortOrder` as a dense 0,1,2,3… sequence — makes every reorder an O(n) write,
 * because inserting at position 1 renumbers everything below it. On a
 * local-first app that also means O(n) rows marked dirty for the next sync,
 * which is the part that actually hurts.
 *
 * The fix is to leave gaps. Orders are spaced `ORDER_GAP` apart, so inserting
 * between two neighbours is the midpoint of their existing values and touches
 * exactly **one row**. Same idea as fractional indexing, using integers rather
 * than rationals or strings because SQLite compares and indexes them natively.
 *
 *   existing:  0        65536        131072
 *   insert between the first two -> 32768, one UPDATE
 *
 * The catch is that gaps are finite. Repeatedly inserting in the same place
 * halves the gap each time, and after ~16 halvings of a 65536 gap there is no
 * integer left between the neighbours. `orderBetween` returns `null` at that
 * point rather than silently returning a colliding value, and the caller
 * renormalises that bucket. In practice this is rare enough that a user is
 * unlikely to ever trigger it — but "unlikely" is not "impossible", and an
 * ordering scheme that corrupts itself under repeated use is not an ordering
 * scheme.
 *
 * Every function here is pure and unit-tested.
 */

/**
 * Spacing between adjacent orders.
 *
 * A power of two so repeated midpointing halves cleanly and yields the maximum
 * number of insertions before exhaustion — 65536 allows 16 before any bucket
 * needs renormalising.
 */
export const ORDER_GAP = 65536;

/**
 * Order for an item being added to the top of its list.
 *
 * New items go to the top rather than the bottom: a just-added one is what
 * the user is thinking about, and appending it below a screenful of existing
 * items means it is created off-screen.
 *
 * Values are free to go negative. There is no floor to run into — a signed
 * 64-bit column allows ~281 billion further insertions at the top before
 * approaching the limit, which is not a real constraint.
 */
export function orderForNewItem(currentMinimum: number | null): number {
  if (currentMinimum === null) return 0;
  return currentMinimum - ORDER_GAP;
}

/**
 * Order that positions a todo between two neighbours.
 *
 * `null` for `before` means "moving to the very top"; `null` for `after` means
 * "moving to the very bottom". Returns `null` when the neighbours are adjacent
 * integers and no value fits between them — the signal to renormalise.
 */
export function orderBetween(
  before: number | null,
  after: number | null,
): number | null {
  if (before === null && after === null) return 0;
  if (before === null) return (after as number) - ORDER_GAP;
  if (after === null) return before + ORDER_GAP;

  // Guard against a caller passing neighbours in the wrong order, which would
  // otherwise produce a midpoint outside the intended range.
  if (before >= after) return null;

  // Averaging this way rather than `(before + after) / 2` keeps the arithmetic
  // away from the safe-integer ceiling when both values are large.
  const midpoint = before + Math.floor((after - before) / 2);

  // No integer strictly between them. The gap is exhausted.
  return midpoint === before ? null : midpoint;
}

export type Reorderable = { readonly id: string };

export type OrderAssignment = { readonly id: string; readonly sortOrder: number };

/**
 * Re-space an entire bucket at `ORDER_GAP` intervals from zero.
 *
 * The recovery path when `orderBetween` returns `null`. O(n) writes, but only
 * for the affected bucket and only after ~16 insertions at the same position.
 * Paying it rarely is the trade that keeps the common case at one write.
 */
export function renormalise(items: readonly Reorderable[]): OrderAssignment[] {
  return items.map((item, index) => ({
    id: item.id,
    sortOrder: index * ORDER_GAP,
  }));
}

/**
 * Work out the target order for moving `fromIndex` to `toIndex` within an
 * already-ordered list.
 *
 * Returns the new order, or `null` if the bucket needs renormalising first.
 * Returns `undefined` when the move is a no-op, so the caller can skip the
 * write entirely rather than dirtying a row for nothing.
 */
export function orderForMove(
  ordered: readonly { id: string; sortOrder: number }[],
  fromIndex: number,
  toIndex: number,
): number | null | undefined {
  if (fromIndex === toIndex) return undefined;
  if (fromIndex < 0 || fromIndex >= ordered.length) return undefined;
  if (toIndex < 0 || toIndex >= ordered.length) return undefined;

  // Neighbours are taken from the list with the moving item removed, so the
  // indices refer to where it will actually land rather than to its old position.
  const without = ordered.filter((_, index) => index !== fromIndex);

  const before = toIndex > 0 ? (without[toIndex - 1]?.sortOrder ?? null) : null;
  const after = without[toIndex]?.sortOrder ?? null;

  return orderBetween(before, after);
}
