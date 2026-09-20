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

## Phase 2 — Todos

Open/done lists, projects as free text, priority, due dates, swipe to complete,
drag to reorder. Deferred: subtasks, recurring todos, reminders.

## Phase 3 — Notes

Create/edit/delete, tags, pin, FTS5 full-text search. Deferred: rich text,
attachments, backlinks.

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
