# HANDOVER

> Living state file. **Read after `CLAUDE.md`, before touching code.**
> Every session updates this before it ends.

**Last updated:** 2026-09-20
**Current phase:** Phase 2 — Todos
**Status:** ✅ Complete — `npm run verify` passes (typecheck + layering + 106 tests + schema)

---

## Where things stand

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation: repo, docs, design system, DB layer, navigation shell | ✅ Done |
| 1 | Money — ledger, entry flow, month summary, category breakdown | ✅ Done |
| 2 | Todos — bucketed list, quick-add, projects, sparse ordering | ✅ Done |
| 3 | Notes | ⬜ **Next** |
| 4 | Supabase auth + sync | ⬜ |
| 5 | Job application tracker | ⬜ |
| 6 | Voice work-log + AI summaries | ⬜ |

---

## What Phase 2 delivered

**Ordering** (`src/lib/ordering.ts`) — pure, 5 exported functions, 25 tests
- Sparse integer ordering at `ORDER_GAP` (65536) spacing, so a reorder writes
  **one row** instead of renumbering the list
- `orderBetween` returns `null` on gap exhaustion (16 insertions at one
  position) rather than colliding; `moveTodo` falls back to re-spacing
- Lives in `lib`, not the feature — nothing in it knows what a todo is

**Grouping** (`src/features/todos/grouping.ts`) — pure, generic over row shape
- Date buckets: Overdue / Today / Tomorrow / Upcoming / Someday
- Flattens to header/item rows with sticky indices, one O(n) pass
- Empty buckets omitted; ties broken on id for a total order

**Data access** (`src/features/todos/api/`)
- `openTodos`, `completedTodos` (capped at 50), `projectsInUse` as query builders
- `createTodo` (read-then-write inside a transaction), `setTodoCompleted`,
  `updateTodo`, `softDeleteTodo`, `restoreTodo`, `moveTodo`

**UI** (`src/features/todos/components/`)
- `TodosScreen` — composition root, mirrors `MoneyScreen`'s structure
- `QuickAddBar` — always-visible composer; keeps focus after submit so
  consecutive tasks are one continuous action; due/priority chips persist
- `TodoRow` — checkbox and row body as separate tap targets
- `TodoDetailSheet` — edit, move up/down, delete
- `FilterBar` — Open/Done switch plus project chips

**Shared / refactors**
- `UndoBar` + `useUndoTarget` extracted to the design system; `MoneyScreen`
  rewritten to use it (the duplicate was removed, not left behind)
- `scripts/check-layering.js` — enforces the two dependency-direction rules,
  wired into `npm run verify`
- Todo seeding added to the dev tools; seed data populates every bucket
- ADR 0009; `study/phase-2/` with 14-question interview bank

---

## Changed from the original plan

**Drag-to-reorder was replaced with Move up / Move down** (ADR 0009).

The list is grouped by due date, and manual order only has meaning *within* a
bucket. Dragging from Today into Tomorrow would have to silently rewrite the due
date, which is not what dragging means anywhere else. Drag and date-bucketing
are two organising principles competing for one gesture.

The sparse-ordering layer a drag implementation would need is built and tested —
if reordering turns out to be frequent in real use, drag only needs to call
`moveTodo` with different indices.

---

## Findings from this phase

1. **Layering violation, caught by hand then automated.** `db/seed.ts` imported
   `ORDER_GAP` from `@/features/todos/ordering` — infrastructure depending on a
   feature. Root cause was that the module was in the wrong place; it was never
   todo-specific. Moved to `src/lib/ordering.ts`, and
   `scripts/check-layering.js` now fails the build on a recurrence. Verified the
   check catches a planted violation rather than passing vacuously.

2. **Vitest alias broke on the space in the project path.** The alias was built
   with `new URL('./src', import.meta.url).pathname`, which percent-encodes —
   resolving to `.../Cloud%20Brain/src`, a path that does not exist. Every
   `@/...` import in a test failed with "Cannot find package", pointing at the
   import rather than the cause. Fixed with `fileURLToPath`. **This is the
   space-in-path debt showing up somewhere other than Gradle.**

---

## Next session: Phase 3 — Notes

**Entry point:** `docs/roadmap.md` § Phase 3, then `src/db/schema.ts` (`notes`
table is already defined — do not redesign). Both `MoneyScreen` and
`TodosScreen` are reference implementations now; follow their structure.

**Build, in this order:**
1. `src/features/notes/api/` — query builders for list and search, plus
   `createNote`, `updateNote`, `softDeleteNote`, `restoreNote`, `togglePin`.
2. `src/features/notes/hooks/useNotes.ts` — reactive, pinned first then by
   `updatedAt` descending.
3. List screen — `FlashList`, title plus a two-line body preview, pinned
   section at the top.
4. Editor — full-screen route (`app/note/[id].tsx`), not a sheet. Notes are
   written over minutes, not seconds, so the entry-flow reasoning from Phases 1
   and 2 does **not** transfer here. Autosave on a debounce.
5. Tags — `notes.tags` is a JSON array column. Parse on read, stringify on
   write; keep that boundary inside `api/`.
6. **FTS5 full-text search.** This needs migration 3 — a virtual table plus
   triggers to keep it in sync with `notes`. First real test of the
   append-only migration rule.

**Reuse:** `Sheet`, `UndoBar` + `useUndoTarget`, `EmptyState`, `Card`, and the
`orderForNewItem` helper if manual note ordering is wanted.

**Deferred:** rich text, attachments, backlinks, note-to-todo linking.

---

## Known issues / debt

| Item | Severity | Note |
|------|----------|------|
| Local DB not encrypted | **medium** | Holds salary and spending data. SQLCipher needs a custom dev build (blocked by ADR 0002 until Phase 6). |
| No forward-migration test | **medium** | `verify:schema` proves the chain applies to an *empty* database, not that a device on v2 upgrades to v3. **Phase 3 adds migration 3 (FTS5) — add this test first.** |
| Project path contains a space | medium | Already broke the Vitest alias once. Fine for Expo Go and EAS; **breaks local Gradle builds**. Rename to `cloud-brain` when convenient. |
| No edit flow for transactions | low | `updateTransaction` exists but nothing calls it. Delete-and-re-add with undo is the path. |
| No account picker / full date picker | low | Both forced by Phase 4. |
| `deletedAt` rows never purged | low | Needs compaction in Phase 4. |
| No project rename | low | `project` is free text; renaming means editing each task. |
| Icons are Expo defaults | low | Cosmetic. |

---

## Decisions a future session must not silently reverse

Reversing one means writing a new ADR that supersedes it.

- **No styling library** — tokens + `StyleSheet` only (ADR 0003)
- **Drizzle for queries, hand-written migrations** (ADR 0005)
- **Local-first**; SQLite is the read path, Supabase is a sync target (ADR 0004)
- **Expo Go compatibility** is a hard constraint until Phase 6 (ADR 0002)
- **Money is integer paise**, amounts always positive, direction in `type` (ADR 0006)
- **Defaults-first entry**: one required field, everything else defaulted (ADR 0007)
- **No component tests**; layered verification instead (ADR 0008)
- **Sparse ordering**; priority never participates in sorting (ADR 0009)
- **A shipped migration is frozen.** Append a new one; never edit an old one.
- **Dependencies point one way** — enforced by `npm run check:layering`.
- **All SQL lives in a feature's `api/`.** Components never import `db`.
- **No state management library.** SQLite is the store; `useLiveQuery` is the
  subscription.
