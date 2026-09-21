import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { CalendarDate, Timestamp } from '@/lib/date';
import type { Paise } from '@/lib/money';

/**
 * Local SQLite schema — the shape of the on-device database.
 *
 * This file describes the schema for *querying* (Drizzle builds type-safe SQL
 * from it). It does NOT create tables. Table creation lives in `migrations.ts`
 * as explicit, versioned DDL.
 *
 * That split is deliberate: see docs/decisions/0005-drizzle-with-hand-written-migrations.md.
 * The short version — the schema file is free to be reorganised at any time,
 * but a migration that has already run on a real device can never be edited.
 * Keeping them in separate files makes that distinction impossible to forget.
 *
 * `.$type<T>()` is how the branded domain types from `src/lib` survive the trip
 * through the database. A column typed `.$type<Paise>()` cannot be assigned a
 * plain number, so the integer-paise invariant is enforced by the compiler all
 * the way down to the insert statement.
 */

/**
 * Columns every table carries.
 *
 *  • createdAt / updatedAt — epoch ms.
 *  • deletedAt — soft delete. A row is "gone" when this is non-null.
 *
 * Soft deletes exist for Phase 4 sync. If a row were hard-deleted locally, the
 * next sync would see its absence as "this device never had it" and the server
 * would helpfully send it back. A tombstone is the only way to communicate
 * "this was deliberately removed" to another replica.
 */
const lifecycle = {
  createdAt: integer('created_at').$type<Timestamp>().notNull(),
  updatedAt: integer('updated_at').$type<Timestamp>().notNull(),
  deletedAt: integer('deleted_at').$type<Timestamp>(),
};

/* ================================================================== */
/* Money                                                              */
/* ================================================================== */

export type AccountKind = 'bank' | 'cash' | 'credit_card' | 'wallet' | 'investment';

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').$type<AccountKind>().notNull(),
    /**
     * Balance when the account was added to the app, in paise. Current balance
     * is this plus the sum of transactions — derived, never stored, so it can
     * never drift out of agreement with the ledger.
     */
    openingBalance: integer('opening_balance')
      .$type<Paise>()
      .notNull()
      // The brand is compile-time only, so the literal needs an explicit cast
      // to satisfy the column's declared type. This is the one place a raw
      // number legitimately becomes Paise without going through `asPaise`.
      .default(0 as Paise),
    currency: text('currency').notNull().default('INR'),
    archivedAt: integer('archived_at').$type<Timestamp>(),
    ...lifecycle,
  },
  (table) => [index('accounts_active_idx').on(table.deletedAt, table.archivedAt)],
);

export type TransactionType = 'income' | 'expense';

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** A category belongs to one side of the ledger. "Salary" is never an expense. */
    kind: text('kind').$type<TransactionType>().notNull(),
    /** Ionicons glyph name, resolved at render time. */
    icon: text('icon').notNull().default('ellipse-outline'),
    /** Token key from the design system, not a hex value. */
    colorToken: text('color_token').notNull().default('accent'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Seeded defaults are protected from deletion. */
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    ...lifecycle,
  },
  (table) => [index('categories_kind_idx').on(table.kind, table.deletedAt)],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    categoryId: text('category_id'),
    /**
     * Always POSITIVE paise. Direction lives in `type`.
     *
     * Storing expenses as negative numbers looks economical but means every
     * aggregate needs to know the sign convention, and a single missed
     * `ABS()` silently inverts a total. An explicit type column makes the
     * intent visible in every query.
     */
    amount: integer('amount').$type<Paise>().notNull(),
    type: text('type').$type<TransactionType>().notNull(),
    note: text('note'),
    /** The calendar day the money moved. TEXT 'YYYY-MM-DD'. */
    occurredOn: text('occurred_on').$type<CalendarDate>().notNull(),
    ...lifecycle,
  },
  (table) => [
    /**
     * The workhorse index. Every list and every monthly aggregate filters on
     * "not deleted" and then scans a date range newest-first. Ordering the
     * columns (deletedAt, occurredOn) lets SQLite seek straight to the live
     * rows and then walk the date range in order, with no temp B-tree sort.
     */
    index('transactions_ledger_idx').on(table.deletedAt, table.occurredOn),
    index('transactions_account_idx').on(table.accountId, table.occurredOn),
    index('transactions_category_idx').on(table.categoryId, table.occurredOn),
  ],
);

/* ================================================================== */
/* Todos                                                              */
/* ================================================================== */

export type TodoPriority = 'low' | 'normal' | 'high';

export const todos = sqliteTable(
  'todos',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    details: text('details'),
    /** Free-text project tag. Deliberately not a foreign key — see Phase 2 notes. */
    project: text('project'),
    priority: text('priority').$type<TodoPriority>().notNull().default('normal'),
    dueOn: text('due_on').$type<CalendarDate>(),
    /** Non-null means done. Keeps the completion time for free. */
    completedAt: integer('completed_at').$type<Timestamp>(),
    /** Manual ordering within the open list. Sparse, to allow cheap reordering. */
    sortOrder: integer('sort_order').notNull().default(0),
    ...lifecycle,
  },
  (table) => [
    index('todos_open_idx').on(table.deletedAt, table.completedAt, table.sortOrder),
    index('todos_due_idx').on(table.dueOn),
  ],
);

/* ================================================================== */
/* Notes                                                              */
/* ================================================================== */

export const notes = sqliteTable(
  'notes',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    /** JSON array of strings. SQLite has no array type; see Phase 3 notes. */
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    pinnedAt: integer('pinned_at').$type<Timestamp>(),
    ...lifecycle,
  },
  (table) => [index('notes_recent_idx').on(table.deletedAt, table.updatedAt)],
);

/* ================================================================== */
/* Job applications                                                   */
/* ================================================================== */

/**
 * Pipeline stages, in order.
 *
 * `ghosted` is a distinct outcome from `rejected` on purpose: "they stopped
 * replying" and "they said no" are different signals when you are trying to
 * work out which sources are worth your time.
 */
export type ApplicationStatus =
  | 'applied'
  | 'screen'
  | 'tech'
  | 'onsite'
  | 'offer'
  | 'rejected'
  | 'ghosted';

export const applications = sqliteTable(
  'applications',
  {
    id: text('id').primaryKey(),
    company: text('company').notNull(),
    role: text('role').notNull(),
    /** Where it came from: referral, LinkedIn, careers page. Free text. */
    source: text('source'),
    location: text('location'),
    appliedOn: text('applied_on').$type<CalendarDate>().notNull(),
    status: text('status').$type<ApplicationStatus>().notNull().default('applied'),
    /** Integer paise, same invariant as transactions. */
    salaryMin: integer('salary_min').$type<Paise>(),
    salaryMax: integer('salary_max').$type<Paise>(),
    contact: text('contact'),
    notes: text('notes'),
    /** What to do next, and when. The job-hunt equivalent of a due date. */
    nextAction: text('next_action'),
    nextActionOn: text('next_action_on').$type<CalendarDate>(),
    ...lifecycle,
  },
  (table) => [
    index('applications_pipeline_idx').on(
      table.deletedAt,
      table.status,
      table.nextActionOn,
    ),
    index('applications_applied_idx').on(table.deletedAt, table.appliedOn),
  ],
);

export type ApplicationEventKind =
  | 'applied'
  | 'status_change'
  | 'interview'
  | 'message'
  | 'note';

/**
 * Timeline entry for an application.
 *
 * Status changes write one of these automatically, so the history of a company
 * is a free by-product of using the tracker rather than something that has to
 * be maintained by hand. Six months later, "when did they first reply" is a
 * query rather than a memory.
 */
export const applicationEvents = sqliteTable(
  'application_events',
  {
    id: text('id').primaryKey(),
    applicationId: text('application_id').notNull(),
    kind: text('kind').$type<ApplicationEventKind>().notNull(),
    happenedOn: text('happened_on').$type<CalendarDate>().notNull(),
    note: text('note'),
    ...lifecycle,
  },
  (table) => [
    index('application_events_timeline_idx').on(
      table.applicationId,
      table.deletedAt,
      table.happenedOn,
    ),
  ],
);

/* ================================================================== */
/* Work log                                                           */
/* ================================================================== */

/**
 * What was worked on, one entry per thing, dated by the day the work happened.
 *
 * Deliberately just text and a date. The structure a weekly summary needs —
 * themes, achievements, STAR form — is extracted at summary time rather than
 * demanded at capture time: the entry is written at the end of a tiring day,
 * often by voice, and every required field there is a reason not to log at all.
 *
 * `loggedOn` is a CalendarDate, not derived from `createdAt`, because logging
 * yesterday's work after midnight is the normal case, not the exception.
 */
export const workLogs = sqliteTable(
  'work_logs',
  {
    id: text('id').primaryKey(),
    loggedOn: text('logged_on').$type<CalendarDate>().notNull(),
    body: text('body').notNull(),
    ...lifecycle,
  },
  (table) => [index('work_logs_week_idx').on(table.deletedAt, table.loggedOn)],
);

/* ================================================================== */
/* Meta                                                               */
/* ================================================================== */

/** Key/value store for schema version and app-level flags. */
export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/* ================================================================== */
/* Inferred row types                                                 */
/* ================================================================== */

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;

export type ApplicationEvent = typeof applicationEvents.$inferSelect;
export type NewApplicationEvent = typeof applicationEvents.$inferInsert;

export type WorkLog = typeof workLogs.$inferSelect;
export type NewWorkLog = typeof workLogs.$inferInsert;
