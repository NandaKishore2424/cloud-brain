# HANDOVER

> Living state file. **Read after `CLAUDE.md`, before touching code.**
> Every session updates this before it ends.

**Last updated:** 2026-09-20
**Current phase:** Phase 7 — Home dashboard
**Status:** ✅ Complete — `npm run verify` passes (typecheck + layering + 141 tests + schema)

---

## Where things stand

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation: repo, docs, design system, DB layer, navigation shell | ✅ Done |
| 1 | Money — ledger, entry flow, month summary, category breakdown | ✅ Done |
| 2 | Todos — bucketed list, quick-add, projects, sparse ordering | ✅ Done |
| 3 | Notes — list, full-screen editor with autosave, tags, search | ✅ Done |
| 4 | Supabase auth + sync | ⛔ **Blocked — needs a Supabase project** |
| 5 | Job application tracker | ✅ Done |
| 6 | Voice work-log + AI summaries | ⛔ Blocked — needs a dev build + AI key |
| 7 | Home dashboard | ✅ Done |

**Every phase that can be built without external credentials is done.**
Phases 4 and 6 are blocked on things only the author can provide — see below.

---

## What Phase 3 delivered

**Pure logic** (`src/features/notes/tags.ts`) — 20 tests
- `normaliseTags` (trim, lowercase, truncate, de-duplicate — in that order)
- `buildPreview` (collapse whitespace, truncate at a character budget)
- `sanitiseSearchTerm` (strip LIKE wildcards)

Extracted out of `api/` because that module imports the db client, which cannot
load under Vitest. Same principle that moved `ordering.ts` to `lib` in Phase 2.

**Data access** (`src/features/notes/api/`)
- `notesList(search)` — pinned first, then `updatedAt` desc, LIKE search, capped
- `noteById`, `allNotesForTagIndex`
- `createNote`, `updateNote`, `setNotePinned`, `softDeleteNote`, `restoreNote`
- `discardIfEmpty` — hard-deletes an untouched note, guarded **in SQL**

**Hooks** — `useNotes` (splits pinned/rest in one pass), `useTags`,
`useNote`, `useDebouncedValue`

**UI**
- `NotesScreen` — search, pinned/all sections, long-press actions sheet, undo
- `NoteEditor` — full-screen route at `app/note/[id].tsx`, autosave, no Save button
- `TagEditor` — commits on space or comma, backspace removes the last tag
- `NoteRow`, `SearchBar`

**Tooling**
- `scripts/bench-search.js` + `npm run bench:search`
- Forward-migration test in `verify:schema` (clears the flagged debt)
- Notes seeding in dev tools; seed data is deliberately varied in *shape*

**Docs** — ADR 0010, `study/phase-3/` with an 11-question bank

---

## Changed from the original plan

**FTS5 was replaced with `LIKE` search** (ADR 0010). Two reasons:

1. **Measured.** Worst case (zero-match, full scan) is 2.79ms at 2,000 notes and
   13.5ms at 10,000, against a 16.7ms frame budget. A phone is 2–4× slower, so
   the ceiling is ~2–3k notes — above what this app will hold.
2. **`sql.js` has no FTS5.** The schema verification engine is compiled with
   FTS3 only, so an FTS5 migration could not be executed by the layer that
   exists to catch migrations that compile but do not run.

ADR 0010 records the trigger for revisiting and the preferred options.
**Phase 3 added no migration; the schema stays at version 2.**

---

## What Phase 5 delivered

**Migration 3** — `applications` and `application_events`. The first migration
since Phase 0, and the first real exercise of the forward-migration test added
in Phase 3, which now reports both `v1 → v3` and `v2 → v3` matching a fresh
install.

**Pure logic** (`src/features/applications/pipeline.ts`) — 18 tests
- `STATUS_ORDER` — furthest-along first, not funnel order
- `isActive`, `advanceStatus`, `needsFollowUp`, `groupByStatus`

**Data access** — `allApplications`, `applicationById`, `eventsForApplication`
as query builders; `createApplication`, `setApplicationStatus`,
`updateApplication`, `addApplicationEvent`, soft delete and restore.

Both `createApplication` and `setApplicationStatus` write their timeline event
**inside the same transaction** as the row change. A status that moved without a
timeline entry is a gap that cannot be reconstructed, and the timeline is the
entire point of the feature.

**UI** — `ApplicationsScreen` (stage sections, active/total/follow-up counters,
closed-outcome toggle), `ApplicationDetailScreen` (full-screen route with stage
picker, next-action presets and the timeline), `AddApplicationSheet`,
`ApplicationRow`, `StatusBadge`.

**Navigation** — a fifth tab, `Jobs`. See the nav-pressure note in the debt
table.

**Verification** — the schema check now asserts the `applications_pipeline_idx`
query plan and the new CHECK and FOREIGN KEY constraints.

---

## Next session

There is no unblocked phase left. The options are:

1. **Unblock Phase 4** by creating a Supabase project (see below), then build sync.
2. **Unblock Phase 6** by setting up a dev build (see below).
3. **Use it for a fortnight and fix what annoys you.** Genuinely the highest
   value option — every deferred item so far is a guess about what you will not
   miss, and a fortnight of real use will tell you which guesses were wrong.

## What Phase 7 delivered

Replaced the Phase 0 foundation-check Home screen with a real dashboard:
overdue tasks and due follow-ups first, then today's tasks, the month's net,
job-hunt state and recent notes. Cards link into their tabs; nothing is editable
there.

`features/dashboard/` has its own `api/` with seven small indexed read models
querying the schema directly, rather than importing from other features'
`api/` folders — which `check:layering` would reject. Dev tools moved into
`features/dashboard/components/DevTools.tsx`, still `__DEV__`-gated.

---

## Blocked phases — what they need from the author

### Phase 4 — Supabase sync ⛔

Cannot be built without credentials. **Needed before starting:**

1. A Supabase project (free tier) at supabase.com
2. The project URL and anon key, placed in `.env` as
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (`.env` is already gitignored)

Everything else is designable in advance and largely pre-paid for: UUIDv7 keys,
`updated_at` on every row, and soft deletes are all in place (ADR 0004).

Scope when unblocked: Supabase Auth (email OTP), a Postgres schema mirroring the
local one with Row Level Security on every table, an outbox table for local
writes, pull/push on foreground and network return, last-write-wins on
`updated_at` with the loser logged rather than discarded.

### Phase 6 — Voice work log ⛔

Needs two things:

1. **A custom dev build.** `expo-speech-recognition` is not in Expo Go, which
   breaks the constraint in ADR 0002. This is the phase where that constraint
   was always going to end. EAS Build (free tier) or a local Android SDK install.
2. **A Gemini API key** (free tier), stored in a Supabase Edge Function — never
   in the app bundle (CLAUDE.md §2 invariant 6).

This is also the right moment to add **SQLCipher** for encryption at rest, since
it needs the same dev build.

---

## Known issues / debt

| Item | Severity | Note |
|------|----------|------|
| Local DB not encrypted | **medium** | Holds salary and spending data. Needs the Phase 6 dev build. |
| Project path contains a space | medium | Already broke the Vitest alias once. **Breaks local Gradle builds.** Rename to `cloud-brain`. |
| No edit flow for transactions | low | `updateTransaction` exists but nothing calls it. |
| No account picker / full date picker | low | Both forced by Phase 4. |
| `deletedAt` rows never purged | low | Needs compaction in Phase 4. |
| No project rename (todos) | low | `project` is free text. |
| Five tabs, and Phase 6 wants a sixth | medium | Android tolerates five; six is too many. Voice log should be a Home action or replace the Home tab, not a sixth tab. |
| Icons are Expo defaults | low | Cosmetic. |

---

## Decisions a future session must not silently reverse

Reversing one means writing a new ADR that supersedes it.

- **No styling library** — tokens + `StyleSheet` only (ADR 0003)
- **Drizzle for queries, hand-written migrations** (ADR 0005)
- **Local-first**; SQLite is the read path, Supabase is a sync target (ADR 0004)
- **Expo Go compatibility** is a hard constraint until Phase 6 (ADR 0002)
- **Money is integer paise**, amounts always positive, direction in `type` (ADR 0006)
- **Defaults-first entry** for fast captures — but *not* for notes (ADR 0007)
- **No component tests**; layered verification instead (ADR 0008)
- **Sparse ordering**; priority never participates in sorting (ADR 0009)
- **LIKE search until ~2,000 notes**, then revisit with the benchmark (ADR 0010)
- **A shipped migration is frozen.** Append a new one; never edit an old one.
- **Dependencies point one way** — enforced by `npm run check:layering`.
- **All SQL lives in a feature's `api/`.** Components never import `db`.
- **No state management library.** SQLite is the store; `useLiveQuery` is the
  subscription.
