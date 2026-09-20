# HANDOVER

> Living state file. **Read after `CLAUDE.md`, before touching code.**
> Every session updates this before it ends.

**Last updated:** 2026-09-20
**Current phase:** Phase 0 — Foundation
**Status:** ✅ Complete — typecheck passes, Android bundle verified

---

## Where things stand

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation: repo, docs, design system, DB layer, navigation shell | ✅ Done |
| 1 | Money — accounts, transactions, categories, monthly view | ⬜ **Next** |
| 2 | Todos | ⬜ |
| 3 | Notes | ⬜ |
| 4 | Supabase auth + sync | ⬜ |
| 5 | Job application tracker | ⬜ |
| 6 | Voice work-log + AI summaries | ⬜ |

---

## What Phase 0 delivered

**App**
- Expo SDK 57 / RN 0.86 / React 19, TypeScript `strict` + `noUncheckedIndexedAccess`
- expo-router file-based navigation, 4-tab shell (Home, Money, Todos, Notes)
- Root layout gates render on font loading **and** database migration, holding
  the native splash so there is no unstyled first frame

**Design system** (`src/design/`)
- Two-layer tokens: raw palette → semantic colour scheme, light + dark
- Primitives: `Text`, `Button`, `Card`, `Screen`, `Icon`, `Divider`, `EmptyState`
- `useThemedStyles` — per-theme stylesheet cache in a `WeakMap`
- Reanimated press feedback on the UI thread, haptics on press-in

**Data layer** (`src/db/`)
- `expo-sqlite` with `enableChangeListener: true` (required for `useLiveQuery`)
- WAL, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`
- Drizzle schema for **money, todos, notes only** — later phases add their own
  tables via new migrations
- Hand-written migration runner on `PRAGMA user_version`; DDL and version bump
  share one transaction
- Migration 1: core tables + indexes. Migration 2: 1 starter account,
  12 expense + 6 income categories, all with fixed UUIDs

**Domain library** (`src/lib/`) — pure, no React, no SQLite
- `money.ts` — branded `Paise`, Indian digit grouping, `parseAmount`
- `date.ts` — `CalendarDate` (TEXT) vs `Timestamp` (epoch ms)
- `id.ts` — UUIDv7
- `result.ts` — `Result<T>`, `attempt`, `attemptSync`

**Docs**
- `docs/` — architecture, data model, roadmap, 6 ADRs (committed)
- `study/phase-0/` — 6 teaching notes + 27-question interview bank (gitignored)

**Verification** (`scripts/verify-schema.js`, run via `npm run verify`)
- Executes the migrations against a real SQLite engine (sql.js/WASM) on the dev
  machine — no device needed
- Asserts: migrations apply, seed counts, every CHECK and FOREIGN KEY constraint
  actually rejects bad rows, the ledger query uses `transactions_ledger_idx`
  with no temp B-tree sort, and re-running the migrator is a no-op
- All 16 checks pass

**Bug this caught** — worth remembering, because both `tsc` and `expo export`
missed it: `buildCategorySeed()` is called while the `migrations` array literal
is evaluated, but `SEED_CATEGORIES` was declared *below* it. `const` is hoisted
into a temporal dead zone, so importing the module threw *"Cannot access
SEED_CATEGORIES before initialization"* — the app would have crashed on first
launch. The seed block now sits above `migrations`, with a comment saying why.

**Also verified**
- `npx expo export --platform android` — bundles successfully
- Bundle size fix: per-weight Inter imports took the export from **12MB → 7.1MB**
  (the package root re-exports all 18 weights, ~340KB each)

---

## Next session: Phase 1 — Money

**Entry point:** read `docs/roadmap.md` § Phase 1, then `src/db/schema.ts`
(`accounts`, `categories`, `transactions` are already defined — do not redesign).

**Build, in this order:**

1. `src/features/money/api/` — `listTransactions`, `createTransaction`,
   `updateTransaction`, `softDeleteTransaction`, `getMonthSummary`.
   Return `Result<T>`. Only place money SQL is written.
2. `src/features/money/hooks/useTransactions.ts` — reactive read via
   `useLiveQuery` so the list updates with no manual refetch.
3. **Add-transaction sheet.** Amount keypad → type toggle → category → note.
   **Target: under 5 seconds from tab tap to saved.** This is the core product
   bet; optimise this screen hardest. Amount first — it is the only required
   field. Everything else gets a sensible default.
4. Transaction list — `FlashList`, grouped by day, sticky date headers.
5. Month summary header: income / expense / net, then category breakdown.

**Do not build** charts, budgets, recurring transactions, CSV export or
multi-account transfers. They are listed as deferred in `docs/roadmap.md`.

**Note:** `src/db/seed.ts` does not exist yet. If dev data is wanted, add it in
Phase 1 and call it from a dev-only control, never automatically.

**Replace** `app/(tabs)/index.tsx` — it is currently a Phase 0 foundation-check
screen (reads schema version and seed counts live from SQLite). It served its
purpose; the real dashboard replaces it.

---

## Known issues / debt

| Item | Severity | Note |
|------|----------|------|
| No tests | **medium** | `src/lib/money.ts` and `date.ts` are pure functions and the highest-value test surface in the project. Add Vitest in Phase 1. |
| Local DB not encrypted | **medium** | Holds salary and spending data. SQLCipher needs a custom dev build (blocked by ADR 0002 until Phase 6). Tracked, not fixed. |
| Project path contains a space (`Desktop/Cloud Brain`) | low | Harmless for Expo Go and EAS Build. **Will break local Gradle builds.** Rename the folder to `cloud-brain` before attempting one. |
| No schema drift check | low | `schema.ts` and `migrations.ts` are kept in agreement by hand. A dev-only check comparing `PRAGMA table_info` against the Drizzle schema would catch divergence. |
| Icons are Expo defaults | low | Cosmetic. Replace before any public release. |
| `deletedAt` rows never purged | low | Needs a compaction job in Phase 4, once sync can confirm a tombstone reached all replicas. |
| `react-dom` pinned via `overrides` | low | npm hoists 19.3.x which demands react ^19.3, conflicting with Expo's react 19.2.3. Android-only app, so react-dom is never rendered. Revisit if web is ever targeted. |

---

## Decisions a future session must not silently reverse

These were argued through. Reversing one means writing a new ADR that supersedes it.

- **No styling library** — tokens + `StyleSheet` only (ADR 0003)
- **Drizzle for queries, hand-written migrations**, no drizzle-kit bundling (ADR 0005)
- **Local-first**; SQLite is the read path, Supabase is a sync target (ADR 0004)
- **Expo Go compatibility** is a hard constraint until Phase 6 (ADR 0002)
- **Money is integer paise**, amounts always positive, direction in `type` (ADR 0006)
- **A shipped migration is frozen.** Append a new one; never edit an old one.
- **No feature imports from another feature.**
