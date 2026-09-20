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

## Phase 4 — Sync

The hard one.

- Supabase Auth (email OTP)
- Postgres schema mirroring the local one, Row Level Security on every table
- Outbox table: local writes enqueue a sync job
- Pull/push on app foreground and on network return
- Last-write-wins on `updated_at`, with the loser logged rather than discarded

Prerequisite already in place: UUIDv7 keys, `updated_at` on every row, soft
deletes.

## Phase 5 — Job applications

Companies, roles, status pipeline, per-application event timeline, next-action
reminders.

## Phase 6 — Voice work log

The reason the project is called Cloud Brain.

- Nightly notification → mic → **on-device** speech recognition (free, no STT API)
- Raw transcript written to SQLite **before** any AI call — a failed or
  rate-limited model must never cost the user their words
- Transcript → Supabase Edge Function → Gemini structured output → typed work items
- `pg_cron` weekly rollup → sprint-ready summary
- Quarterly rollup → achievements in STAR form for appraisals and CV bullets

The API key lives in the Edge Function, never in the app bundle.
