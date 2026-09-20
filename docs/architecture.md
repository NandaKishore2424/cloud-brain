# Architecture

## The central bet: local-first

Every read is served from SQLite on the device. The network is never on the path
between a user action and the pixels that acknowledge it.

```
     ┌──────────────────────────────────────────────┐
     │  app/            expo-router routes          │
     │                  thin — params + one render  │
     └────────────────────┬─────────────────────────┘
                          │
     ┌────────────────────▼─────────────────────────┐
     │  src/features/<feature>/                     │
     │    components/   feature UI                  │
     │    hooks/        reactive reads              │
     │    api/          the ONLY place SQL is built │
     └────────────────────┬─────────────────────────┘
                          │ Drizzle (typed)
     ┌────────────────────▼─────────────────────────┐
     │  src/db/                                     │
     │    schema.ts     table definitions           │
     │    migrations.ts versioned DDL               │
     │    client.ts     one connection, WAL         │
     └────────────────────┬─────────────────────────┘
                          │
     ┌────────────────────▼─────────────────────────┐
     │  SQLite on device  ← source of truth         │
     └────────────────────┬─────────────────────────┘
                          │ Phase 4 — background, non-blocking
     ┌────────────────────▼─────────────────────────┐
     │  Supabase Postgres  ← backup + multi-device  │
     └──────────────────────────────────────────────┘
```

The consequence worth stating plainly: **Supabase is not a read path.** It is a
replication target. If the server is down, or the phone is in a lift, the app is
fully functional and nothing about the UI changes. Sync catches up later.

## Why not the usual client/server split

The obvious architecture is a React Native client calling a REST API. It was
rejected for this app for three reasons:

1. **Latency.** A round-trip to a free-tier server in another region is 300ms on
   a good day. Recording an expense is a several-times-a-day action; 300ms of
   spinner on each one is what makes people stop using finance apps.
2. **Offline.** The metro, a basement restaurant, a flight. These are exactly
   the moments an expense gets recorded.
3. **Cost.** Free-tier backends sleep. A local database does not.

The cost of this choice is that sync becomes the hard problem instead of the
easy one. That trade is made knowingly, and Phase 4 is scoped around it.

## Layer rules

**`app/`** — expo-router file tree. A route file reads params, renders one
feature component, and nothing else. No business logic, no queries. If a route
file exceeds ~40 lines it is doing something that belongs in `src/features`.

**`src/features/<feature>/`** — one folder per feature, containing everything
that feature needs. The rule that keeps this honest: **no feature may import
from another feature.** If money and todos both need something, it moves to
`src/lib` or `src/design`. This is what makes a feature deletable in one
`rm -rf` and testable in isolation.

**`src/features/<feature>/api/`** — the only place Drizzle queries are written.
Components never import `db`. Everything here returns `Result<T>` and never
throws, so a caller cannot forget that storage can fail.

**`src/design/`** — tokens and primitives. Feature code imports from `@/design`
and never from `react-native` directly for anything with a visual default.

**`src/lib/`** — pure, dependency-free domain logic: money arithmetic, date
handling, ids. No React, no SQLite. This is the layer that is trivial to unit
test, and it holds the rules that are expensive to get wrong.

**`src/db/`** — schema, migrations, connection. Feature-agnostic.

## Rendering and reactivity

There is no Redux, no Zustand, no TanStack Query. The reason is that this app has
almost no client state — it has *database* state, and SQLite already knows when
that changes.

`expo-sqlite` is opened with `enableChangeListener: true`, which makes it emit a
native event on every committed write. Drizzle's `useLiveQuery` subscribes to
that event and re-runs the query. So:

```
write a transaction  →  SQLite commits  →  native change event
                     →  useLiveQuery re-runs  →  list re-renders
```

No cache invalidation, no query keys, no manual refetch, no stale-time tuning.
The database is the store. A global state library here would be a second copy of
data that SQLite already holds authoritatively, plus the bugs that come from the
two disagreeing.

Genuinely ephemeral UI state — a sheet being open, a form's in-progress input —
stays in local `useState` where it belongs.

## Performance posture

| Concern | Approach |
|---------|----------|
| List scrolling | `FlashList` — recycles views instead of retaining every row |
| Press feedback | Reanimated worklets — runs on the UI thread, unaffected by a busy JS thread |
| Theme switching | Styles built once per theme and cached in a `WeakMap`, not rebuilt per render |
| Query cost | Indexes ordered to match real access patterns; see `docs/data-model.md` |
| Concurrency | WAL journal mode — readers never block on the writer |
| Bundle size | Per-weight font imports; verified via `expo export` (12MB → 7.1MB) |

## What this architecture does not solve yet

- **Conflict resolution.** Phase 4 ships last-write-wins, which is adequate for
  a single user on one or two devices and honestly inadequate beyond that.
- **Encryption at rest.** The local database holds salary and spending data. It
  should be SQLCipher-backed before this app goes anywhere near a public release.
- **Tests.** `src/lib` is pure and should be under unit test from Phase 1.
