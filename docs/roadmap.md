# Roadmap

One phase per working session. Each ends with a passing typecheck, an updated
`HANDOVER.md`, and study notes written.

---

## Phase 0 — Foundation ✅

Design system, local database with migrations, navigation shell, shared domain
library. No user-facing features.

## Phase 1 — Money ✅

Delivered. Entry flow, reactive ledger, month aggregates, category
breakdown, delete with undo, dev seeder, 68 unit tests. See ADR 0007 and 0008.

Scope:
- `src/features/money/api/` — list, create, update, soft-delete, month summary
- Reactive transaction list via `useLiveQuery`, grouped by day, `FlashList`
- Add-transaction sheet: **target under 5 seconds** from tab tap to saved
- Month header: income / expense / net
- Category breakdown

Explicitly deferred: charts, budgets, recurring transactions, CSV export,
multi-account transfers.

The entry flow is the whole bet. Amount keypad first (it is the only required
field), category second, everything else optional with sensible defaults. If
logging an expense feels like filling a form, the app stops being used in a week.

## Phase 2 — Todos ✅

Delivered. Date-bucketed list (Overdue / Today / Tomorrow / Upcoming /
Someday), always-visible quick-add composer, project filter derived from the
todos themselves, detail sheet, delete with undo, sparse integer ordering.

**Changed from plan:** drag-to-reorder was replaced with discrete Move up /
Move down actions — see ADR 0009. Drag and date-bucketing are two competing
organising principles for the same gesture. The sparse-ordering layer a drag
implementation would need is built and tested.

Deferred: subtasks, recurring todos, reminders, notifications.

## Phase 3 — Notes ✅

Delivered. List with pinned section, full-screen editor with autosave, inline
tag entry, pin, delete with undo, and debounced search.

**Changed from plan:** FTS5 was replaced with `LIKE` search — see ADR 0010.
Measured worst case is under 3ms at 2,000 notes against a 16.7ms frame budget,
and `sql.js` (the schema verification engine) has no FTS5, so the migration
could not have been covered by the verification layer. The ADR records a
concrete trigger for revisiting and `npm run bench:search` re-measures it.

Phase 3 added **no migration**; the schema stays at version 2.

Deferred: rich text, attachments, backlinks, note-to-todo linking.

## Phase 4 — Sync 🟡

The hard one. Built and verified; not yet exercised as a full round trip on
hardware.

- Supabase Auth (email OTP), tokens in the Android Keystore via SecureStore
- Postgres schema mirroring the local one; RLS enabled **and forced** on every
  table, four policies each, `authenticated` only
- **No outbox.** Every row carries `updated_at` and deletes are tombstones, so
  the pending set is `updated_at > cursor`. Cursors live in the existing `meta`
  table and are derived from observed data, never from the device clock
- Push, then pull, on app foreground, on sign-in and on demand
- Last-write-wins enforced **in SQL on both ends** —
  `on conflict do update ... where excluded.updated_at > t.updated_at`.
  PostgREST's own upsert overwrites unconditionally, which is last-*push*-wins
  and loses data silently; the client needs the same clause or a pull
  overwrites an unpushed local edit
- An account claim in `meta` prevents syncing one device's database into a
  second account — something RLS cannot prevent, because such rows arrive
  correctly labelled

Prerequisites already in place since Phase 0: UUIDv7 keys, `updated_at` on every
row, soft deletes.

See ADR 0012 (sync) and ADR 0013 (auth). Deferred deliberately: CRDTs, account
deletion and export, encryption at rest — all listed as gates before release.

## Phase 5 — Job applications ✅

Delivered. Pipeline grouped by stage (furthest-along first), per-application
timeline written automatically on every status change, next-action tracking
with overdue follow-up flagging, salary ranges in integer paise.

**Adds migration 3** — the first since Phase 0, and the first exercise of the
forward-migration test added in Phase 3.

Deferred: email parsing, calendar integration, document attachments.

## Phase 6 — Work log ✅

The reason the project is called Cloud Brain. Delivered in a deliberately
simpler form than first planned — see ADR 0014.

- A **Work** capture button on Home opens the log with the keyboard up
- **Voice is the keyboard's microphone** — Android's own dictation, offline on
  most devices, no native module and no build change
- Entries dated by the day the work happened (Today / Yesterday, or the
  original day when editing); grouped by day, browsed a week at a time
- **Share week** — plain text for a standup or a manager
- **Summarise with AI** — a prompt asking for a sprint update, STAR-form
  achievements and CV bullets, using only what is in the log; handed to
  Gemini / ChatGPT through the share sheet. No key, no server, nothing leaves
  the phone until the person chooses where

**Adds migration 4** (`work_logs`) locally and `0005` on Postgres, so the log is
ready to sync if sync is switched on.

Deferred: a nightly reminder notification, and an in-app summary through an
Edge Function once there is a signed-in user to authorise it.

---

## Phase 7 — Home dashboard ✅

Delivered. Replaces the Phase 0 foundation-check screen with a real hub:
overdue tasks and due follow-ups first, then today's tasks, the month's net,
the job-hunt state and recent notes. Every card links into its tab; nothing is
editable there.

**Ordered by urgency, not by feature.** A dashboard organised by feature is a
menu; organised by urgency it answers "what should I be doing".

The dashboard is its own feature with its own read models in
`features/dashboard/api/`, querying the schema directly rather than importing
from `features/money/api` and friends — `npm run check:layering` enforces that.
The small duplication in query shape is deliberate: these are different read
models that happen to touch the same tables, and coupling them would mean a
dashboard tweak could break the ledger.
