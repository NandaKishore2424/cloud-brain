# 0004 — Local-first: SQLite is the read path

**Status:** Accepted · 2026-09-20

## Context

The conventional mobile architecture is a thin client calling a REST API, with
the server owning all state. The alternative is local-first: an on-device
database as the source of truth, with the server as a replication target.

## Decision

SQLite on the device is the source of truth for all reads. Supabase (Phase 4) is
a sync target and backup. **No UI render ever waits on the network.**

## Why

1. **Latency.** A free-tier server round-trip is ~300ms at best. Logging an
   expense happens several times a day; 300ms of spinner each time is precisely
   what causes people to abandon finance apps. Local reads are sub-millisecond.
2. **Offline.** The metro, a basement restaurant, a flight — the exact moments an
   expense actually gets recorded.
3. **Cost.** Free-tier backends sleep after inactivity. A local database does not.
4. **Failure mode.** With a server-first design, a backend outage bricks the app.
   Here it delays a background sync and the user notices nothing.

## The cost, stated honestly

This trades an easy problem for a hard one. Server-first sync is trivial —
there is one copy of the data. Local-first means **two replicas that can both
accept writes**, which is a distributed systems problem: conflict detection,
tombstones, clock skew, partial sync failure.

That cost is accepted because the latency and offline benefits are exactly what
determines whether this app gets used daily, and an unused tracker has no value
at all.

## What Phase 0 pre-paid toward it

Retrofitting these later is painful, so they are in the schema from the start:

- **UUIDv7 primary keys** — the device mints ids offline; a row keeps one
  identity from creation through to Postgres.
- **`updated_at` on every row** — the input to last-write-wins resolution.
- **Soft deletes (`deleted_at`)** — a hard delete is indistinguishable from
  "never seen it", so the server would resurrect the row on next sync.

## Consequences

- Every query must filter `WHERE deleted_at IS NULL`. Indexes lead with
  `deleted_at` accordingly.
- Phase 4 ships last-write-wins, which is adequate for one user on one or two
  devices and honestly inadequate beyond that. CRDTs are the real answer and are
  out of scope.
- Deleted rows accumulate. A compaction job is needed once sync can confirm a
  tombstone has been seen by all replicas.
