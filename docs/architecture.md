# Architecture

Cloud Brain is an Android-first, **local-first** personal operations app. Five
features — money, todos, notes, job applications and a dashboard — over one
on-device SQLite database.

---

## 1. The central bet

**Every read is served from SQLite on the device. The network is never on the
path between a user action and the pixels that acknowledge it.**

```
     ┌──────────────────────────────────────────────────────┐
     │  app/                expo-router routes              │
     │                      thin: params + one render       │
     └────────────────────────┬─────────────────────────────┘
                              │
     ┌────────────────────────▼─────────────────────────────┐
     │  src/features/<feature>/                             │
     │    components/   feature UI                          │
     │    hooks/        reactive reads (useLiveQuery)       │
     │    api/          the ONLY place SQL is built         │
     │    <pure>.ts     domain rules, no React, no SQLite   │
     └────────────────────────┬─────────────────────────────┘
                              │ Drizzle (typed)
     ┌────────────────────────▼─────────────────────────────┐
     │  src/db/     schema · migrations · client (WAL)      │
     │  src/lib/    money · date · ordering · id · Result   │
     │  src/design/ tokens · theme · primitives             │
     └────────────────────────┬─────────────────────────────┘
                              │
     ┌────────────────────────▼─────────────────────────────┐
     │  SQLite on device  ← source of truth                 │
     └────────────────────────┬─────────────────────────────┘
                              │ Phase 4 — background, non-blocking
     ┌────────────────────────▼─────────────────────────────┐
     │  Supabase Postgres ← backup + multi-device           │
     └──────────────────────────────────────────────────────┘
```

**Supabase is not a read path.** It is a replication target. With no network the
app is fully functional and nothing about the UI changes.

### Why not the conventional client/server split

| Reason | Detail |
|---|---|
| Latency | A free-tier round trip is ~300ms. Logging an expense happens several times a day; 300ms of spinner each time is what makes people abandon finance apps. |
| Offline | The metro, a basement restaurant, a flight — exactly where expenses get recorded. |
| Cost | Free-tier backends sleep. A local database has no cold start. |
| Failure mode | Server-first: backend down = app bricked. Local-first: a background job retries and the user never finds out. |

**The cost, stated plainly:** this trades an easy problem for a hard one.
Server-first sync is trivial because there is one copy of the data. Local-first
means two replicas that both accept writes — conflict resolution, tombstones,
clock skew, partial failure. See §8.

---

## 2. Layer rules

Four rules, two of them machine-enforced.

**`app/` is routing only.** A route file reads params, renders one feature
component, and stops. Over ~40 lines means logic belongs in `src/features`.

**`src/features/<f>/api/` is the only place SQL is written.** Components never
import `db`. One place to optimise a query, one place to enforce
`deleted_at IS NULL`, one boundary where SQLite's exceptions become `Result`.

**Dependencies point one way.** No feature imports another; `src/db` and
`src/lib` never import from `src/features`. Enforced by
`npm run check:layering`.

**Pure domain logic sits outside `api/`.** Anything worth unit-testing must not
live behind an import that cannot load in a test — `api/` pulls in
`expo-sqlite`, which Vitest's node environment cannot load. So money maths,
date handling, sparse ordering, todo bucketing, pipeline stages and tag
normalisation live in `src/lib` or in a plain feature-level module.

This rule was learned twice: `ordering.ts` started inside the todos feature and
moved to `src/lib` when the dev seeder needed it (infrastructure would have
depended on a feature); `tags.ts` was split out of `notes/api/` so it could be
tested at all.

---

## 3. Feature anatomy

Every feature is the same five pieces. Consistency here is worth more than
local cleverness — by the fifth feature the structure was a given rather than a
decision.

```
features/money/
├── api/          query builders (unexecuted) + mutations (Result<T>)
├── hooks/        useLiveQuery wrappers, memoised on their inputs
├── components/   presentational + one composition-root screen
└── amountInput.ts   pure, unit-tested
```

**The two API shapes matter.** Reactive reads need an *unexecuted* Drizzle
query so `useLiveQuery` can re-run it; writes execute immediately and return
`Result<T>`. Both live in `api/` because the rule is about where SQL lives, not
about what the consumer does with it.

---

## 4. Reactivity — why there is no state library

There is no Redux, Zustand or TanStack Query. Those manage a *copy* of data that
lives elsewhere: caching, invalidation, staleness.

Here the data does not live elsewhere.

```
write  →  SQLite commits  →  native change event
       →  useLiveQuery re-runs  →  component re-renders
```

`expo-sqlite` is opened with `enableChangeListener: true`. Saving a transaction
updates the ledger, the month summary, the category breakdown and the dashboard
— four independent queries on the same event, which is why they **cannot
disagree**. There is no cached summary to drift from the list it summarises.

A state library would add a second copy of data SQLite already holds
authoritatively, plus every bug that comes from the two disagreeing.

Genuinely ephemeral UI state — a sheet's open flag, a form's in-progress input —
stays in `useState`.

**Corollary for writes:** no optimistic UI. A local write *is* the source of
truth, so there is no guess to roll back. Server-first apps need optimistic
updates to feel this fast, and optimistic updates are a whole category of bugs.

---

## 5. Correctness invariants

Enforced by the type system and the database, not by discipline.

| Invariant | Mechanism |
|---|---|
| Money is integer paise | Branded `Paise` type, carried into columns via `.$type<Paise>()` |
| Amounts are positive; direction is a column | `CHECK (amount > 0)` + `CHECK (type IN ('income','expense'))` |
| Calendar days carry no timezone | Stored `TEXT 'YYYY-MM-DD'`; `toISOString()` is never used to derive a day |
| Every row is soft-deletable | `deleted_at` on every table; hard deletes only for never-written rows |
| Ids are offline-generatable and sortable | UUIDv7 — 48-bit timestamp prefix |
| Colour meets WCAG | `npm run check:contrast` over every rendered pair |

Branded types are the load-bearing one. `Paise` is structurally a `number` — no
runtime cost — but TypeScript refuses a raw `number` where it is expected, so a
rupee value cannot reach a paise column by accident.

---

## 6. Verification — four layers, no device required

See ADR 0008. `npm run verify` runs all four on a Linux laptop with no Android
SDK.

| Layer | Catches |
|---|---|
| `typecheck` | Branded-type violations, unchecked indices, missing null cases |
| `check:layering` | Cross-feature imports, infrastructure depending on features |
| `check:contrast` | Rendered colour pairs below their WCAG target |
| `test` (Vitest, 148) | Domain rules: currency, dates, ordering, bucketing, tags |
| `verify:schema` | Migrations *executed* against real SQLite (sql.js) |

**Why the last one exists:** `tsc` proves a migration is a valid *string*; the
bundler proves it *compiles*. Neither runs it. Phase 0's migrations passed both
and the first run of this script failed immediately — a `const` read during
module initialisation while still in its temporal dead zone. The app would have
crashed on first launch with both other checks green.

It also asserts things that are easy to regress silently:

- **Query plans.** Each list query must use its index and must *not* contain
  `USE TEMP B-TREE`. That string appearing means SQLite fell back to a sort
  pass — exactly what the index column ordering exists to prevent.
- **Constraints.** Every `CHECK` and `FOREIGN KEY` is proven to reject a bad row,
  not merely to exist. (SQLite ships with foreign keys *off* by default.)
- **Forward migrations.** For each version, build a database partway, apply the
  rest, and compare `sqlite_master` against a one-pass build. Applying every
  migration to an empty database only proves the chain works for a *new install*.

**Deliberately not covered:** component rendering (low value per unit effort
here; visual correctness is checked by running the app) and navigation flows
(needs a device).

---

## 7. Performance posture

| Concern | Approach |
|---|---|
| List scrolling | `FlashList` with `getItemType` per row shape, so headers and rows recycle in separate pools |
| Virtualisation | Summary cards are `ListHeaderComponent`, never a ScrollView wrapping a list — that gives the inner list unbounded height and renders every row |
| Aggregates | SQL `SUM`/`GROUP BY`, not JS reductions — `useLiveQuery` re-runs them on every write |
| Press feedback | Reanimated worklets on the UI thread, unaffected by a busy JS thread |
| Theme switching | Styles built once per theme, cached in a `WeakMap` keyed by the factory |
| Reordering | Sparse integer ordering — one row written per move, not O(n) |
| Concurrency | WAL journal mode; readers never block on the writer |
| Bundle | Per-weight font imports; verified via `expo export` (12MB → 7.1MB) |
| Search | Measured, not assumed: 2.79ms at 2,000 notes against a 16.7ms frame budget (ADR 0010) |

---

## 8. Sync design — Phase 4, designed and not built

Blocked on credentials, not on design. The schema has paid for it since Phase 0.

**Already in place:** UUIDv7 keys (the device mints ids offline and a row keeps
one identity through to Postgres), `updated_at` on every row (the input to
conflict resolution), and soft deletes (a hard delete is indistinguishable from
"never seen it", so the server would resurrect the row).

**Planned shape:**

1. Supabase Auth, email OTP.
2. Postgres schema mirroring the local one, Row Level Security on every table
   keyed to `auth.uid()`.
3. An **outbox** table: local writes enqueue a job rather than calling the
   network inline, so a write is never blocked on connectivity.
4. Push on app foreground and on network return; pull by `updated_at > cursor`.
5. **Last-write-wins on `updated_at`**, with the losing version logged rather
   than discarded.

**Where this is honestly inadequate:** last-write-wins silently discards a
concurrent edit, and relies on device clocks that disagree. It is adequate for
one person on one or two devices and would not survive real multi-device use.
The correct answer is CRDTs or operational transforms; that is out of scope for
a personal app, and saying so is more useful than pretending otherwise.

**Also unsolved:** tombstones accumulate. Compaction needs sync to confirm a
tombstone reached every replica before a row can be hard-deleted.

---

## 9. Known gaps

Stated rather than hidden — these are the answers to "what would you do next".

| Gap | Why it matters |
|---|---|
| Local database is unencrypted | It holds salary and spending data. SQLCipher needs a custom dev build (blocked by ADR 0002 until Phase 6). |
| No crash reporting | `ErrorBoundary` logs to the dev console only. A production build fails silently. |
| No component or flow tests | Deliberate (ADR 0008), but it is a deliberate gap, not an absent one. |
| Last-write-wins conflict resolution | §8. |
| No account deletion / export path | Required before this could be distributed to anyone else. |
| Five tabs, and Phase 6 wants a sixth | Android tolerates five. The voice log should be a Home action, not another tab. |
