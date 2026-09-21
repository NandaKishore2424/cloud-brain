# Data model

Schema definition: [`src/db/schema.ts`](../src/db/schema.ts)
Table creation:    [`src/db/migrations.ts`](../src/db/migrations.ts)

## Storage conventions

These apply to every table without exception.

| Concern | Representation | Why |
|---------|----------------|-----|
| Primary key | `TEXT` — UUIDv7 | Time-sortable, offline-generatable, sync-safe |
| Money | `INTEGER` paise | Floats cannot represent decimal currency exactly |
| Calendar day | `TEXT` `'YYYY-MM-DD'` | No timezone to get wrong |
| Instant | `INTEGER` epoch ms (UTC) | Unambiguous point in time |
| Boolean | `INTEGER` 0/1 | SQLite has no boolean type |
| Deletion | `deleted_at INTEGER NULL` | Tombstones are required for sync |

### Why UUIDv7 rather than autoincrement

An autoincrementing integer requires a central allocator. In a local-first app
the device must be able to create a row while offline and have that row keep its
identity forever, including after it reaches Postgres. UUIDv7 gives that, and
because the first 48 bits are a millisecond timestamp, IDs still sort
chronologically — so inserts append to the right of the B-tree instead of
scattering, and `ORDER BY id` is free chronological ordering.

### Why soft deletes

If a row were hard-deleted on the device, the next sync would see its absence as
"this device has never seen this row" and the server would send it back. A
tombstone is the only way one replica can tell another that a row was
deliberately removed.

The cost: every query must filter `WHERE deleted_at IS NULL`. This is why
`deleted_at` is the **leading column** of most indexes.

### Why calendar dates are text

`new Date().toISOString().slice(0, 10)` is the most common date bug in mobile
apps. `toISOString` converts to UTC first, so at 04:00 IST it returns yesterday.
Storing the *day* as `'2026-09-20'` removes the timezone from the problem
entirely. It also means lexicographic string comparison equals chronological
comparison, so SQLite answers `BETWEEN '2026-09-01' AND '2026-09-30'` straight
off a plain TEXT index with no date functions.

---

## Tables

### `accounts`
Where money sits. Seeded with one `Cash` account so the first transaction has a
home.

Current balance is **derived** — `opening_balance` plus the sum of transactions —
never stored. A stored balance is a denormalisation that will eventually
disagree with the ledger, and reconciling it is a bug hunt nobody enjoys.

### `categories`
Seeded with 12 expense and 6 income categories using **fixed UUIDs**, so every
install gets byte-identical ids and two devices cannot create duplicate
"Groceries" rows that differ only by key. `is_system = 1` protects them from
deletion. `kind` constrains a category to one side of the ledger — "Salary" can
never be selected for an expense.

### `transactions`
The ledger. `amount` is always **positive**; direction lives in `type`
(`income` | `expense`), enforced by a `CHECK` constraint.

Storing expenses as negative numbers looks economical but means every aggregate
has to know the sign convention, and one missing `ABS()` silently inverts a
total. An explicit type column makes intent visible at every query site.

Indexes:

| Index | Columns | Serves |
|-------|---------|--------|
| `transactions_ledger_idx` | `(deleted_at, occurred_on)` | The main list and every monthly aggregate |
| `transactions_account_idx` | `(account_id, occurred_on)` | Per-account history |
| `transactions_category_idx` | `(category_id, occurred_on)` | Category breakdown |

Column order in `transactions_ledger_idx` is the point. Every query filters "not
deleted" and then walks a date range newest-first. With `deleted_at` leading,
SQLite seeks to the live rows and reads the date range in index order — no temp
B-tree, no sort step. Reversing the two columns would force a scan.

### `todos`
`completed_at` non-null means done, which stores the completion time for free
rather than needing a separate boolean plus timestamp.

`project` is free text, not a foreign key. A projects table would need CRUD, a
picker, and rename-cascade handling to earn its place — for a single user
typing "payments" occasionally, it does not.

`sort_order` is sparse (gaps between values) so a drag-reorder can write one row
instead of renumbering the list.

### `notes`
`tags` is a JSON array in a TEXT column. SQLite has no array type; the
alternative is a join table, which for a personal notes app buys correctness
nobody needs and costs a join on every read. Search is `LIKE` over title and
body rather than FTS5 — measured, and fast enough to ~2,000 notes (ADR 0010).

### `applications` · `application_events` (migration 3)
A job application and its timeline. `status` is one of seven pipeline stages;
`ghosted` is distinct from `rejected` because "they stopped replying" and "they
said no" are different signals about a source. Salary is a range in integer
paise. Every status change writes an `application_events` row automatically,
so the timeline cannot be forgotten. Events reference their application with
`ON DELETE CASCADE`.

| Index | Columns | Serves |
|---|---|---|
| `applications_pipeline_idx` | `(deleted_at, status, next_action_on)` | Pipeline grouped by stage; overdue follow-ups |
| `application_events_timeline_idx` | `(application_id, deleted_at, happened_on)` | One application's timeline |

### `work_logs` (migration 4)
What was worked on, as free text, dated by `logged_on` — the day the work
happened, not the day it was written, because logging yesterday after midnight
is the normal case. `CHECK (length(trim(body)) > 0)` on both SQLite and Postgres,
so neither end can store or replicate an empty entry. Deliberately no category
or project columns: structure is extracted at summary time (ADR 0014).

| Index | Columns | Serves |
|---|---|---|
| `work_logs_week_idx` | `(deleted_at, logged_on)` | One week of entries, with no sort step |

### `meta`
Key/value store for per-device state. Holds the sync cursors
(`sync.lastPushedAt`, `sync.lastPulledAt`, `sync.userId`, `sync.lastSyncedAt`) —
and is the one table **never** synced, because a cursor copied to another device
would tell it that it already has rows it has never seen (ADR 0012).

Schema version is **not** here — it lives in SQLite's own `PRAGMA user_version`,
so the version and the schema cannot disagree and both move in the same
transaction.
