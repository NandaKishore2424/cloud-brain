# 0009 — Sparse ordering, and discrete moves instead of drag

**Status:** Accepted · 2026-09-20
**Supersedes:** the "drag to reorder" item in Phase 2's original scope

## Context

Todos need manual ordering. Phase 2's plan, written at the end of Phase 1, said
"drag to reorder". Building the list made that look wrong, for a reason that was
not visible when the plan was written.

## Decision, part one: sparse integer ordering

`sortOrder` values are spaced `ORDER_GAP` (65536) apart rather than being a
dense 0,1,2,3… sequence.

**Why.** With dense ordering, inserting at position 1 renumbers every row below
it — O(n) writes for one user gesture. On a local-first app that also marks O(n)
rows dirty for the next sync, which is the part that actually hurts: a
five-item reorder becomes a five-row sync payload.

With gaps, inserting between two neighbours is their midpoint and touches
**exactly one row**.

```
existing:   0        65536        131072
insert between the first two -> 32768, one UPDATE
```

Same idea as fractional indexing, using integers rather than rationals or
strings because SQLite compares and indexes them natively.

**The failure mode, handled.** Gaps are finite. Repeatedly inserting at the same
position halves the gap each time, and after 16 halvings of 65536 no integer
remains between the neighbours. `orderBetween` returns `null` at that point
rather than silently returning a colliding value, and `moveTodo` falls back to
re-spacing that bucket. O(n) writes, but only for one bucket and only after
repeated insertion at one spot.

An ordering scheme that corrupts itself under repeated use is not an ordering
scheme, so the exhaustion path is unit-tested explicitly: the test asserts both
that 16 insertions succeed and that the 17th reports exhaustion cleanly.

`src/lib/ordering.ts` is pure and knows nothing about todos. It lives in `lib`
rather than in the feature because Notes (Phase 3) will want the same scheme,
and `db/seed.ts` needs `ORDER_GAP` — infrastructure importing from a feature
would invert the dependency direction.

## Decision, part two: no drag-and-drop

Reordering is exposed as **Move up / Move down** in the task detail sheet, not
as a drag gesture.

**Why the plan was wrong.** The list is grouped by due date — Overdue, Today,
Tomorrow, Upcoming, Someday. Manual order only has meaning *within* a bucket.
Dragging a task from Today into Tomorrow would have to silently rewrite its due
date, which is not what the gesture means anywhere else, and dragging within a
bucket while the buckets themselves are the dominant visual structure invites
exactly that mistake.

This only became clear once the grouped list existed. Drag reorder and
date-bucketed grouping are two different organising principles competing for
the same gesture.

**Secondary reasons:**

- Drag-and-drop on a virtualised list needs `react-native-draggable-flatlist`,
  which is FlatList-based and conflicts with the FlashList convention in
  CLAUDE.md. Building it by hand means measuring rows, autoscroll at the edges,
  and cancelling against the scroll gesture — a large surface area for a
  personal todo app.
- Priority and due date already do most of the ordering work. Manual order is
  the tiebreak, not the primary mechanism.

**What it costs.** Reordering is slower per move and lives behind a sheet rather
than being direct manipulation. For moving one task up a couple of places —
the realistic case — that is acceptable. If reordering turns out to be frequent
in real use, the sparse-ordering layer is already built and a drag
implementation would only need to call `moveTodo` with different indices.

## Decision, part three: priority does not sort

Within a bucket, `sortOrder` is the **only** sort key. Priority is a visual
marker.

Sorting by priority and then by manual order means a move only shuffles an item
within its priority band, so a task dragged to the top of a bucket visibly does
not go to the top. Explicit user intent should beat an inferred attribute.

## Consequences

- Ties on `sortOrder` are broken by id, so the comparator is a total order.
  Without that, two rows sharing an order — possible once Phase 4 sync merges
  concurrent inserts from two devices — could swap between renders and read as
  the list jittering.
- `orderForMove` computes neighbours from the list with the moving item
  **removed**. Using the original indices would treat the item's own position as
  a neighbour and produce an order that leaves it where it started. This is
  tested directly.
