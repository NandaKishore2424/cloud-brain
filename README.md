# Cloud Brain

An Android-first personal operations app for a working software professional —
money, tasks, notes, job applications and a spoken daily work log, in one place.

Built local-first: every read is served from an on-device SQLite database, so
the UI never waits on a network call.

---

## Status

| Phase | Scope | State |
|-------|-------|-------|
| 0 | Foundation — design system, local database, navigation | ✅ |
| 1 | Money — income & expense ledger | ✅ |
| 2 | Todos | ✅ |
| 3 | Notes | ✅ |
| 4 | Cloud sync & auth (Supabase) | ⛔ needs credentials |
| 5 | Job application tracker | ✅ |
| 6 | Voice work log + AI weekly summaries | ⛔ needs a dev build |
| 7 | Home dashboard | ✅ |

## Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| App | React Native 0.86 / Expo SDK 57 / React 19 | One toolchain, Android-first, no Xcode requirement |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` | |
| Navigation | expo-router (file-based, typed routes) | |
| Local database | SQLite (`expo-sqlite`, WAL) | Source of truth for all reads |
| Query layer | Drizzle ORM + hand-written migrations | Type-safe SQL, explicit schema history |
| Styling | Design tokens + `StyleSheet` | No styling runtime — see ADR 0003 |
| Animation | Reanimated 4 (UI-thread worklets) | Press feedback stays at 60fps under JS load |
| Cloud (Phase 4) | Supabase — Postgres, Auth, Edge Functions | Free tier, Postgres over a proprietary store |

## Running it

Requires Node 20.19.4+. No Android SDK needed.

```bash
npm install
npm start
```

Scan the QR code with **Expo Go** on an Android device.

```bash
npm run verify      # typecheck + layering + unit tests + schema execution
npm run test        # Vitest over pure domain logic
npm run verify:schema  # runs migrations against a real SQLite engine
npm run check:layering # enforces the dependency-direction rules
```

The schema check executes the migrations against sql.js (WASM SQLite) and
asserts constraints fire, seed data lands, and the ledger query uses its index
without a sort pass. `tsc` and the bundler never run the SQL; this does.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — how the layers fit together
- [`docs/data-model.md`](docs/data-model.md) — tables, indexes, conventions
- [`docs/roadmap.md`](docs/roadmap.md) — phase-by-phase scope
- [`docs/decisions/`](docs/decisions/) — architecture decision records

## Design principles

1. **Latency is a feature.** Recording an expense takes under five seconds and
   zero network round-trips. Anything slower does not get used, and an unused
   tracker is worse than none.
2. **Correctness over convenience in the data layer.** Money is integer paise.
   Calendar dates are timezone-free text. Deletes are soft. These are enforced
   by the type system, not by discipline.
3. **Explicit over magic.** Migrations are hand-written SQL. Styles are plain
   objects. When something breaks at 11pm, the stack trace should point at code
   that is readable.
