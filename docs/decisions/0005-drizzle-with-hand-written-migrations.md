# 0005 — Drizzle for queries, hand-written migrations

**Status:** Accepted · 2026-09-20

## Context

Options for the local data layer: raw `expo-sqlite` with SQL strings; Drizzle
ORM; or a sync-engine product like WatermelonDB or PowerSync.

Orthogonally, Drizzle ships `drizzle-kit`, which generates migration files from
schema diffs and bundles them via a Babel `inline-import` plugin.

## Decision

Drizzle for schema definition and queries. Migrations hand-written as explicit
SQL in `src/db/migrations.ts`, run by a custom migrator using
`PRAGMA user_version`. `drizzle-kit`'s migration generation is **not** used.

## Why Drizzle for queries

- Query results are typed from the schema with no codegen step.
- `.$type<Paise>()` carries branded domain types through the database, so the
  integer-paise invariant is compiler-enforced all the way into the insert.
- `useLiveQuery` subscribes to SQLite's native change events, which is what makes
  the UI reactive without any state-management library.
- It is a query builder, not an object graph. The generated SQL is predictable.

**WatermelonDB / PowerSync were rejected** because they solve sync by owning the
schema and the sync protocol. That is a real shortcut, but it makes the most
interesting part of the system a black box — and for a portfolio project, the
sync design is the part worth being able to explain.

## Why not drizzle-kit migrations

1. **Babel coupling.** Bundling generated SQL requires the `inline-import` plugin
   — build magic that breaks in non-obvious ways and is hard to debug on device.
2. **Generated diffs are not reviewable as intent.** A hand-written migration
   states what is happening and why. A diff-generated one states what changed.
3. **Seed data.** Reference data (default categories with fixed UUIDs) belongs in
   a migration. Diff generators have no concept of it.
4. **It is genuinely simple.** The migrator is ~60 lines. Importing a build-time
   toolchain to avoid writing `CREATE TABLE` is a poor trade.

## Why `PRAGMA user_version`

SQLite's own 32-bit header field. No bookkeeping table to fall out of sync with
reality, and it is written **inside the same transaction as the DDL** — so a
crash mid-migration rolls back both the schema change and the version bump,
leaving the database cleanly at the previous version.

## The rule this creates

**A shipped migration is frozen.** A device that has run migration 3 will never
run it again. Editing it produces two devices both claiming version 3 with
different schemas — among the worst bugs to diagnose. To change something,
append a new migration.

## Consequences

- `schema.ts` and `migrations.ts` must be kept in agreement by hand. They are
  separate files precisely so the distinction between "freely editable" and
  "frozen forever" is impossible to forget.
- A schema drift check (compare `PRAGMA table_info` against the Drizzle schema in
  dev) would be a worthwhile addition.
