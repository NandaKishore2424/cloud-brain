# 0010 — LIKE search now, FTS5 when the data justifies it

**Status:** Accepted · 2026-09-20
**Supersedes:** the "FTS5 full-text search" item in Phase 3's original scope

## Context

Phase 3's plan called for SQLite FTS5 full-text search, added via migration 3
with a virtual table and triggers to keep it in sync with `notes`.

Two things surfaced before writing it.

**1. FTS5 is not available in the verification harness.** `sql.js`, the WASM
SQLite used by `npm run verify:schema`, is compiled with FTS3 only:

```
ENABLE_FTS3
ENABLE_FTS3_PARENTHESIS
ENABLE_NORMALIZE
```

`CREATE VIRTUAL TABLE ... USING fts5` fails with *"no such module: fts5"*. So an
FTS5 migration could not be executed by the layer that exists specifically to
catch migrations that compile but do not run (ADR 0008). That layer was written
because exactly that class of bug shipped past typecheck and bundling in Phase 0.

**2. The problem it solves may not exist at this scale.** Measured rather than
assumed.

## The measurement

Worst case: a search term matching **zero** rows, so `LIMIT` cannot
short-circuit and SQLite scans every row. Notes averaging 200 words. Median of
50 runs, on a development laptop.

| Notes | DB size | Median | p95 |
|-------|---------|--------|-----|
| 100 | 0.2 MB | 0.16 ms | 0.33 ms |
| 500 | 1.0 MB | 0.65 ms | 1.07 ms |
| 2,000 | 4.0 MB | 2.79 ms | 3.59 ms |
| 10,000 | 19.8 MB | 13.52 ms | 14.44 ms |
| 50,000 | 99.3 MB | 68.42 ms | 72.18 ms |

One frame at 60fps is 16.7 ms.

A first run of this benchmark used a *common* search term and reported a flat
0.1–0.2 ms at every size — because `LIMIT 50` was satisfied within the first
handful of rows. That measured nothing. The numbers above are the corrected
worst case, and the correction changed the shape of the result from "flat" to
"linear", which is the whole point.

A mid-range Android device is roughly 2–4× slower than this laptop, so the
practical ceiling is **around 2,000–3,000 notes** before search stops fitting in
a frame.

## Decision

Search with `LIKE '%term%'` over `title` and `body`, debounced, with a capped
`LIMIT`. No FTS, no migration 3, no schema change in Phase 3 at all.

## Why this is the right trade at this scale

- A personal notes app accumulates hundreds to low thousands of notes over
  years, not tens of thousands.
- At 2,000 notes the worst case is under 3 ms on a laptop, roughly 10 ms on a
  phone — inside one frame.
- Search input is debounced, so a full scan does not run per keystroke.
- FTS5 would add a virtual table, three triggers, a migration the verification
  layer cannot execute, and a Phase 4 complication (the triggers must fire on
  sync writes too, and the FTS table must not itself be synced).

Adding all of that for a measured gain of zero at the current scale is the
definition of premature optimisation.

## The trigger for revisiting

This is not "never". Revisit when **either**:

- note count exceeds ~2,000, or
- search feels slow on the device in real use.

At that point the options, in order of preference:

1. **FTS5**, if `expo-sqlite`'s build supports it — verify on-device first, and
   accept that `verify:schema` will have to skip that migration (or move the
   harness to a WASM build compiled with FTS5).
2. **FTS4**, which `sql.js` does support, so the verification layer stays whole.
   Older and slower than FTS5 but adequate.
3. A **prefix-index table** maintained in application code — fully testable, no
   virtual tables, but the most work.

## Consequences

- Phase 3 adds **no migration**, so the schema stays at version 2.
- `LIKE` cannot use an index for a leading-wildcard pattern. The full scan is
  accepted deliberately, with the measurement above as justification.
- Search is case-insensitive for ASCII only, which is SQLite's default `LIKE`
  behaviour. Adequate for English notes; would need `lower()` or ICU for
  anything else.
- The benchmark script is kept at `scripts/bench-search.js` so the threshold can
  be re-measured rather than re-argued.
