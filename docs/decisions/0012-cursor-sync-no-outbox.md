# 0012 — Cursor-based state sync, with last-write-wins enforced in SQL on both ends

**Status:** Accepted · 2026-09-20
**Relates to:** [0004](0004-local-first-sqlite.md) (local-first), [0008](0008-verification-strategy.md) (verification)

## Context

Phase 4 replicates seven tables between SQLite on the device and Postgres on
Supabase. The app is local-first: SQLite is the read path and the UI never waits
on the network, so sync is a background activity that must be correct without
ever being in front of the user.

Three decisions had to be made: what to send, how to decide a winner when both
sides changed the same row, and where that decision executes.

## Decision 1 — Cursors, not an outbox

The pending set is `updated_at > lastPushedAt`. No queue table, no per-row
dirty flag.

This is available for free because of an invariant that predates Phase 4: every
table carries `createdAt` / `updatedAt` / `deletedAt`, and deletes are
tombstones rather than row removals (CLAUDE.md §2). A deleted row is therefore
still a row with a fresh `updated_at`, and "everything that changed since the
cursor" already includes deletions.

**Rejected: an outbox table.** An outbox earns its place when you need ordered,
exactly-once delivery of *operations* — "user moved item A above item B" — where
replaying in the wrong order produces a different result. This syncs *state*
under last-write-wins, where only the final value of each row matters. In that
model the outbox is a second source of truth that must be kept consistent with
the first, and the two can disagree after a crash between the data write and the
queue write. Cursors cannot drift from the data, because they are derived from
it.

**Cost:** the pending set is recomputed per sync rather than maintained
incrementally — seven indexed range scans. Irrelevant at this scale.

## Decision 2 — The cursor comes from the data, never the clock

`lastPulledAt` is the highest `updated_at` actually observed in the rows the
server returned. Not `Date.now()`.

The device clock and the server clock disagree by an unknown amount. A cursor
set from local time can land *ahead* of rows the server is about to hand out,
and those rows are then skipped on every subsequent sync — permanently, with no
error. Taking the maximum observed timestamp makes the cursor a claim about
data seen rather than about time, and the two clocks stop mattering.

Cursors also never move backwards (`highestTimestamp` folds in the previous
value), so an empty or out-of-order batch cannot rewind them.

## Decision 3 — Conflict resolution executes in SQL, on both ends

```sql
insert into <table> ...
on conflict (id) do update set ...
  where excluded.updated_at > <table>.updated_at
```

This runs on the server (`supabase/migrations/0003_lww_upsert.sql`, one
generated function per table) **and** locally
(`src/features/sync/localUpsert.ts`).

**Why the server needs it.** PostgREST's upsert
(`Prefer: resolution=merge-duplicates`) overwrites unconditionally. That is not
last-write-wins, it is last-*push*-wins: a device that was offline for an hour
comes back and clobbers an hour of newer edits made elsewhere. Pulling before
pushing narrows the window but cannot close it, because another device can
write between this device's pull and its push. The `where` clause closes it,
atomically, per row.

**Why the client needs it too.** The mirror failure: a pull overwrites a local
edit made seconds ago and not yet pushed. A client that always yields to the
server is implementing server-wins, which silently eats offline work — the one
thing a local-first app must not do.

**Why both are generated rather than hand-written.** The `do update set` clause
must list every column; across seven tables that is ~80 assignments. A column
omitted by hand does not error — it just stops replicating that one field,
silently, and only on the other device. Both sides derive the clause from
catalogue metadata (`information_schema` on Postgres, Drizzle's column metadata
locally), so it cannot drift from the schema.

**Consequence:** every push and every pull is idempotent. Re-sending a row that
already arrived is a no-op rather than a write. That is what makes the retry
strategy below affordable.

## Decision 4 — Cursors advance only after a fully clean run

Both cursors are global rather than per-table. A partial failure therefore
cannot be recorded precisely: advancing after table 3 of 7 would risk skipping
rows in tables 4–7 that sort below the new cursor. So nothing advances unless
everything succeeded, and a failed sync simply repeats from the last known-good
point.

This is only affordable because of Decision 3. Under an unconditional upsert,
replaying a sync rewrites rows; under a conditional one it is free.

**When to revisit:** per-table cursors cut the wasted traffic and are the
obvious change once the data is large enough for a full replay to be noticeable.

## Decision 5 — A local database belongs to one account

The account id is recorded in `meta` on first sync and checked on every sync
after. A mismatch stops sync entirely; it does not resolve it.

Without this, signing in as a second account pushes the first account's rows
into it — stamped with the new `user_id`, so RLS accepts every one of them. Row
level security protects one account from another **over the network**; it cannot
protect against a client that has already mixed two people's data together
locally before sending it.

Both possible resolutions destroy something — pushing merges the two databases,
wiping the local one discards unsynced work — so the engine refuses and surfaces
it. The account claim deliberately survives sign-out, or signing out and back in
as someone else would read as a fresh device and defeat the check.

## Verification

Consistent with ADR 0008: the layers that can be executed, are.

| Layer | How | Assertions |
|-------|-----|-----------|
| Planning arithmetic — cursors, chunking, keyset paging, the account guard | pure functions, Vitest | 23 |
| Server conflict resolution | real Postgres (PGlite), `npm run verify:rls` | 30 |
| Local conflict resolution | real SQLite (sql.js), Vitest | 9 |
| The live project matches the migrations | HTTPS with the shipped anon key, `npm run check:remote` | 16 |

The local upsert is deliberately a separate module from `api/pull.ts`, which
imports `expo-sqlite` and is therefore unreachable from Node. Taking the
database as an argument is what makes the same code runnable against sql.js in
a test — the alternative being to verify it by installing the app and hoping.

Removing the `where excluded.updated_at > ...` clause was checked to fail
exactly two of the nine local assertions and no others.

## Known limits

- **Last-write-wins discards concurrent edits.** Two devices editing the same
  note in the same window: one wins whole, the other is lost whole. Acceptable
  for one person with one phone; listed as a hard gate before the Play Store.
- **It trusts `updated_at`, which is a device clock.** A phone with a badly
  wrong clock writes rows that win or lose incorrectly. A server-assigned
  timestamp would fix the ordering but break offline writes.
- **No network-reachability trigger.** Sync runs on app foreground, on sign-in
  and on demand. A reachability listener needs a native module that the Expo Go
  build does not have (ADR 0002).
