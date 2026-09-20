# 0008 — Three-layer verification, no device required

**Status:** Accepted · 2026-09-20

## Context

This project has no CI, no device farm and no QA. It is built on evenings. The
verification that exists has to be cheap enough to run on every change and
targeted at the failure modes that actually occur.

Standard React Native testing advice starts with React Testing Library and
component tests. That was rejected as the primary layer: component tests here
would mostly assert that a `View` renders a `Text`, need a heavy transform to
run at all, and break on every layout change while catching very little.

## Decision

Three layers, each checking something the others structurally cannot, all
runnable on a Linux laptop with no Android SDK. `npm run verify` runs all three.

### 1. `npm run typecheck` — does it compile

`tsc --noEmit` with `strict` and `noUncheckedIndexedAccess`. Catches the class
of error that branded types are designed to surface: a raw `number` reaching a
`Paise` column, an unchecked array index, a missing null case.

### 2. `npm run test` — is the domain logic correct

Vitest over `src/lib` and other pure modules. **No React Native transform**, so
the suite starts in milliseconds and stays worth running constantly.

This is aimed squarely at the rules that are expensive to get wrong and cheap to
test: currency arithmetic, timezone handling, keypad input transitions. Pinned
to `TZ=Asia/Kolkata` so the timezone-sensitive assertions are deterministic
instead of passing or failing depending on the machine.

### 3. `npm run verify:schema` — does the database actually work

Executes the real migrations against a real SQLite engine (sql.js, a WASM
build). Asserts migrations apply, seed data lands, every `CHECK` and
`FOREIGN KEY` genuinely rejects bad rows, the main ledger query uses its index
with no temp B-tree sort, and re-running the migrator is a no-op.

## Why layer 3 exists at all

Because layers 1 and 2 cannot see SQL. `tsc` proves a migration is a valid
*string*; the bundler proves the module *compiles*. Neither runs it.

This is not hypothetical — it is why the layer was written. Phase 0's migrations
passed typecheck and bundled cleanly, and the first run of this script failed
immediately with *"Cannot access 'SEED_CATEGORIES' before initialization"*: the
seed array was declared below the `migrations` array whose initialiser reads it,
so the `const` was still in its temporal dead zone. The app would have crashed
on first launch on a real device, with both other checks green.

Asserting the **query plan** is the same principle applied to performance. The
index column ordering in `transactions_ledger_idx` was chosen so SQLite can
answer the ledger read with a seek plus an ordered scan. Asserting that
`USE TEMP B-TREE` does not appear means a future schema change that quietly
breaks that plan fails the build, rather than just getting slower.

## What is deliberately not covered

- **Component rendering.** Low value per unit of effort here; visual correctness
  is checked by running the app.
- **Navigation flows.** Would need Detox or Maestro and a device.
- **Sync.** Does not exist yet. Phase 4 will need its own layer, and
  conflict resolution is the part that will genuinely deserve tests.

## Consequences

- A migration must never be edited after shipping; the schema check verifies the
  current chain applies cleanly to an empty database, not that an existing
  device can upgrade. A forward-migration test from each historical version
  would be the natural next addition.
- `sql.js` is a dev dependency only and never ships in the app bundle.
