/**
 * Migrations — the ordered, append-only history of the local schema.
 *
 * THE RULE: once a migration has shipped, it is frozen. You may never edit a
 * migration that has already run on a real device, because that device will
 * not run it again — its `user_version` has already moved past it. Editing one
 * produces two devices that both claim version N with different schemas, which
 * is the worst kind of bug to debug. To change something, append a new migration.
 *
 * Version tracking uses SQLite's built-in `PRAGMA user_version`: a 32-bit
 * integer stored in the database header. No bookkeeping table, no chance of the
 * tracker and the schema disagreeing, and it is updated inside the same
 * transaction as the DDL, so a crash mid-migration rolls back both.
 *
 * System rows (default categories, the starter account) use FIXED UUIDs rather
 * than generated ones. Every install gets byte-identical ids, so when Phase 4
 * sync arrives two devices cannot create duplicate "Groceries" categories that
 * differ only by id.
 */

export type Migration = {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
};

/** Milliseconds since epoch, computed by SQLite at migration time. */
const NOW_MS = "(CAST(strftime('%s','now') AS INTEGER) * 1000)";

const SYSTEM_ACCOUNT_ID = '01920000-0000-7000-8000-00000000a001';

/* ------------------------------------------------------------------ */
/* Seed data                                                           */
/* ------------------------------------------------------------------ */
/*
 * Declared ABOVE `migrations` deliberately. `buildCategorySeed()` is invoked
 * while the `migrations` array literal is being evaluated, so every binding it
 * touches must already be initialised. `const` declarations are hoisted but sit
 * in the temporal dead zone until their initialiser runs — so with this block
 * below `migrations`, importing this module threw
 * "Cannot access SEED_CATEGORIES before initialization" at app startup.
 * Function declarations hoist fully, which is why the call itself resolved and
 * the failure looked like it came from inside the function.
 */

type SeedCategory = {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  icon: string;
  colorToken: string;
};

/**
 * Default categories. Chosen to cover an Indian salaried professional's actual
 * spending without becoming a taxonomy exercise — twelve expense buckets is
 * about the limit before categorising stops being worth the friction.
 */
const SEED_CATEGORIES: readonly SeedCategory[] = [
  // --- expense ---
  { id: '01920000-0000-7000-8000-00000000c001', name: 'Food & Dining', kind: 'expense', icon: 'restaurant-outline', colorToken: 'warning' },
  { id: '01920000-0000-7000-8000-00000000c002', name: 'Groceries', kind: 'expense', icon: 'basket-outline', colorToken: 'positive' },
  { id: '01920000-0000-7000-8000-00000000c003', name: 'Transport', kind: 'expense', icon: 'car-outline', colorToken: 'accent' },
  { id: '01920000-0000-7000-8000-00000000c004', name: 'Rent', kind: 'expense', icon: 'home-outline', colorToken: 'negative' },
  { id: '01920000-0000-7000-8000-00000000c005', name: 'Utilities', kind: 'expense', icon: 'flash-outline', colorToken: 'warning' },
  { id: '01920000-0000-7000-8000-00000000c006', name: 'Shopping', kind: 'expense', icon: 'bag-handle-outline', colorToken: 'accent' },
  { id: '01920000-0000-7000-8000-00000000c007', name: 'Health', kind: 'expense', icon: 'medkit-outline', colorToken: 'negative' },
  { id: '01920000-0000-7000-8000-00000000c008', name: 'Entertainment', kind: 'expense', icon: 'film-outline', colorToken: 'accent' },
  { id: '01920000-0000-7000-8000-00000000c009', name: 'Subscriptions', kind: 'expense', icon: 'repeat-outline', colorToken: 'accent' },
  { id: '01920000-0000-7000-8000-00000000c010', name: 'Education', kind: 'expense', icon: 'school-outline', colorToken: 'positive' },
  { id: '01920000-0000-7000-8000-00000000c011', name: 'Travel', kind: 'expense', icon: 'airplane-outline', colorToken: 'accent' },
  { id: '01920000-0000-7000-8000-00000000c012', name: 'Other', kind: 'expense', icon: 'ellipsis-horizontal-outline', colorToken: 'accent' },

  // --- income ---
  { id: '01920000-0000-7000-8000-00000000d001', name: 'Salary', kind: 'income', icon: 'wallet-outline', colorToken: 'positive' },
  { id: '01920000-0000-7000-8000-00000000d002', name: 'Freelance', kind: 'income', icon: 'laptop-outline', colorToken: 'positive' },
  { id: '01920000-0000-7000-8000-00000000d003', name: 'Bonus', kind: 'income', icon: 'gift-outline', colorToken: 'positive' },
  { id: '01920000-0000-7000-8000-00000000d004', name: 'Interest', kind: 'income', icon: 'trending-up-outline', colorToken: 'positive' },
  { id: '01920000-0000-7000-8000-00000000d005', name: 'Refund', kind: 'income', icon: 'arrow-undo-outline', colorToken: 'positive' },
  { id: '01920000-0000-7000-8000-00000000d006', name: 'Other', kind: 'income', icon: 'ellipsis-horizontal-outline', colorToken: 'positive' },
];

function buildCategorySeed(): string[] {
  return SEED_CATEGORIES.map(
    (c, i) =>
      `INSERT OR IGNORE INTO categories
         (id, name, kind, icon, color_token, sort_order, is_system, created_at, updated_at)
       VALUES
         ('${c.id}', '${c.name.replace(/'/g, "''")}', '${c.kind}', '${c.icon}',
          '${c.colorToken}', ${i}, 1, ${NOW_MS}, ${NOW_MS});`,
  );
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'core_tables',
    statements: [
      `CREATE TABLE IF NOT EXISTS meta (
         key   TEXT PRIMARY KEY NOT NULL,
         value TEXT NOT NULL
       );`,

      `CREATE TABLE IF NOT EXISTS accounts (
         id              TEXT PRIMARY KEY NOT NULL,
         name            TEXT NOT NULL,
         kind            TEXT NOT NULL,
         opening_balance INTEGER NOT NULL DEFAULT 0,
         currency        TEXT NOT NULL DEFAULT 'INR',
         archived_at     INTEGER,
         created_at      INTEGER NOT NULL,
         updated_at      INTEGER NOT NULL,
         deleted_at      INTEGER
       );`,
      `CREATE INDEX IF NOT EXISTS accounts_active_idx
         ON accounts (deleted_at, archived_at);`,

      `CREATE TABLE IF NOT EXISTS categories (
         id          TEXT PRIMARY KEY NOT NULL,
         name        TEXT NOT NULL,
         kind        TEXT NOT NULL CHECK (kind IN ('income','expense')),
         icon        TEXT NOT NULL DEFAULT 'ellipse-outline',
         color_token TEXT NOT NULL DEFAULT 'accent',
         sort_order  INTEGER NOT NULL DEFAULT 0,
         is_system   INTEGER NOT NULL DEFAULT 0,
         created_at  INTEGER NOT NULL,
         updated_at  INTEGER NOT NULL,
         deleted_at  INTEGER
       );`,
      `CREATE INDEX IF NOT EXISTS categories_kind_idx
         ON categories (kind, deleted_at);`,

      `CREATE TABLE IF NOT EXISTS transactions (
         id          TEXT PRIMARY KEY NOT NULL,
         account_id  TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
         category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
         amount      INTEGER NOT NULL CHECK (amount > 0),
         type        TEXT NOT NULL CHECK (type IN ('income','expense')),
         note        TEXT,
         occurred_on TEXT NOT NULL,
         created_at  INTEGER NOT NULL,
         updated_at  INTEGER NOT NULL,
         deleted_at  INTEGER
       );`,
      `CREATE INDEX IF NOT EXISTS transactions_ledger_idx
         ON transactions (deleted_at, occurred_on);`,
      `CREATE INDEX IF NOT EXISTS transactions_account_idx
         ON transactions (account_id, occurred_on);`,
      `CREATE INDEX IF NOT EXISTS transactions_category_idx
         ON transactions (category_id, occurred_on);`,

      `CREATE TABLE IF NOT EXISTS todos (
         id           TEXT PRIMARY KEY NOT NULL,
         title        TEXT NOT NULL,
         details      TEXT,
         project      TEXT,
         priority     TEXT NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low','normal','high')),
         due_on       TEXT,
         completed_at INTEGER,
         sort_order   INTEGER NOT NULL DEFAULT 0,
         created_at   INTEGER NOT NULL,
         updated_at   INTEGER NOT NULL,
         deleted_at   INTEGER
       );`,
      `CREATE INDEX IF NOT EXISTS todos_open_idx
         ON todos (deleted_at, completed_at, sort_order);`,
      `CREATE INDEX IF NOT EXISTS todos_due_idx ON todos (due_on);`,

      `CREATE TABLE IF NOT EXISTS notes (
         id         TEXT PRIMARY KEY NOT NULL,
         title      TEXT NOT NULL DEFAULT '',
         body       TEXT NOT NULL DEFAULT '',
         tags       TEXT NOT NULL DEFAULT '[]',
         pinned_at  INTEGER,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         deleted_at INTEGER
       );`,
      `CREATE INDEX IF NOT EXISTS notes_recent_idx
         ON notes (deleted_at, updated_at);`,
    ],
  },

  {
    version: 2,
    name: 'seed_reference_data',
    statements: [
      // A starter account so the very first transaction has somewhere to go.
      `INSERT OR IGNORE INTO accounts
         (id, name, kind, opening_balance, currency, created_at, updated_at)
       VALUES
         ('${SYSTEM_ACCOUNT_ID}', 'Cash', 'cash', 0, 'INR', ${NOW_MS}, ${NOW_MS});`,

      ...buildCategorySeed(),
    ],
  },
  {
    version: 3,
    name: 'job_applications',
    statements: [
      `CREATE TABLE IF NOT EXISTS applications (
         id             TEXT PRIMARY KEY NOT NULL,
         company        TEXT NOT NULL,
         role           TEXT NOT NULL,
         source         TEXT,
         location       TEXT,
         applied_on     TEXT NOT NULL,
         status         TEXT NOT NULL DEFAULT 'applied'
                        CHECK (status IN ('applied','screen','tech','onsite',
                                          'offer','rejected','ghosted')),
         -- Integer paise, same invariant as transactions (ADR 0006). A range
         -- rather than a single figure because that is how postings quote it.
         salary_min     INTEGER,
         salary_max     INTEGER,
         contact        TEXT,
         notes          TEXT,
         next_action    TEXT,
         next_action_on TEXT,
         created_at     INTEGER NOT NULL,
         updated_at     INTEGER NOT NULL,
         deleted_at     INTEGER
       );`,
      /*
       * Leading `deleted_at` for the same reason as every other table, then
       * `status` (the equality predicate the pipeline view filters on), then
       * `next_action_on` for the overdue-follow-up scan.
       */
      `CREATE INDEX IF NOT EXISTS applications_pipeline_idx
         ON applications (deleted_at, status, next_action_on);`,
      `CREATE INDEX IF NOT EXISTS applications_applied_idx
         ON applications (deleted_at, applied_on);`,

      `CREATE TABLE IF NOT EXISTS application_events (
         id             TEXT PRIMARY KEY NOT NULL,
         application_id TEXT NOT NULL
                        REFERENCES applications(id) ON DELETE CASCADE,
         kind           TEXT NOT NULL,
         happened_on    TEXT NOT NULL,
         note           TEXT,
         created_at     INTEGER NOT NULL,
         updated_at     INTEGER NOT NULL,
         deleted_at     INTEGER
       );`,
      `CREATE INDEX IF NOT EXISTS application_events_timeline_idx
         ON application_events (application_id, deleted_at, happened_on);`,
    ],
  },
  {
    version: 4,
    name: 'work_log',
    statements: [
      `CREATE TABLE IF NOT EXISTS work_logs (
         id         TEXT PRIMARY KEY NOT NULL,
         logged_on  TEXT NOT NULL,
         -- An empty entry is never intentional: it is a dictation that
         -- captured nothing, or a save tapped by accident. Refused here rather
         -- than only in the UI, so no code path can store one.
         body       TEXT NOT NULL CHECK (length(trim(body)) > 0),
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         deleted_at INTEGER
       );`,
      /*
       * Every read is "live entries in this week": equality on deleted_at, then
       * a range on logged_on. Same shape as transactions_ledger_idx.
       */
      `CREATE INDEX IF NOT EXISTS work_logs_week_idx
         ON work_logs (deleted_at, logged_on);`,
    ],
  },
];

/** Highest version defined here. The migrator brings the device up to this. */
export const TARGET_SCHEMA_VERSION = migrations.reduce(
  (max, m) => Math.max(max, m.version),
  0,
);

export { SYSTEM_ACCOUNT_ID };
