import { getTableColumns } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import {
  accounts,
  applicationEvents,
  applications,
  categories,
  notes,
  todos,
  transactions,
} from '@/db/schema';

/**
 * Row translation between the local SQLite schema and Postgres.
 *
 * The two schemas are deliberately identical in shape, but they name columns
 * differently at the language boundary: Drizzle exposes `occurredOn` in
 * TypeScript while both databases store `occurred_on`, and PostgREST returns
 * the snake_case form in JSON.
 *
 * **The mapping is derived from Drizzle's own column metadata rather than
 * hand-written.** A hand-written mapper for seven tables is around 150 lines of
 * `occurredOn: row.occurred_on` — and every one of those lines is a chance to
 * transpose two fields of the same type, which no compiler catches and which
 * corrupts data silently. Deriving it means the mapping cannot disagree with
 * the schema, because it *is* the schema.
 */

/** A column's TypeScript name paired with its SQL name and data type. */
type ColumnInfo = {
  tsName: string;
  sqlName: string;
  dataType: string;
};

function describeColumns(table: SQLiteTable): ColumnInfo[] {
  const columns = getTableColumns(table);
  return Object.entries(columns).map(([tsName, column]) => ({
    tsName,
    sqlName: column.name,
    dataType: column.dataType,
  }));
}

/**
 * Local row → the shape Postgres expects.
 *
 * `user_id` is attached here rather than stored locally. The local database is
 * single-tenant by construction — it is on one person's phone — so carrying a
 * user column in SQLite would be dead weight on every row. Ownership is a
 * property of the *remote* copy, so it is added at the boundary.
 */
export function toRemoteRow(
  table: SQLiteTable,
  row: Record<string, unknown>,
  userId: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { user_id: userId };

  for (const column of describeColumns(table)) {
    out[column.sqlName] = row[column.tsName] ?? null;
  }

  return out;
}

/**
 * Postgres row → the shape the local schema expects.
 *
 * `user_id` is dropped: it has no column locally, and passing an unknown key to
 * Drizzle's insert would fail.
 *
 * The numeric coercion is not cosmetic. Postgres `bigint` exceeds the range
 * JSON can represent exactly, so PostgREST may serialise it as a **string** to
 * avoid precision loss. Written straight into SQLite that produces a timestamp
 * stored as text, which then compares lexicographically — `'9'` sorts after
 * `'10'` — and conflict resolution starts picking the wrong winner. Silently.
 */
export function toLocalRow(
  table: SQLiteTable,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const column of describeColumns(table)) {
    let value = remote[column.sqlName] ?? null;

    if (column.dataType === 'number' && typeof value === 'string') {
      const parsed = Number(value);
      value = Number.isFinite(parsed) ? parsed : null;
    }

    if (column.dataType === 'boolean' && typeof value === 'number') {
      value = value !== 0;
    }

    out[column.tsName] = value;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* The registry                                                        */
/* ------------------------------------------------------------------ */

export type SyncTable = {
  /** Postgres table name. Identical to the SQLite one. */
  readonly remoteName: string;
  readonly table: SQLiteTable;
};

/**
 * Every table that syncs, parents before children.
 *
 * Order does not strictly matter — the Postgres schema deliberately declares no
 * foreign keys between synced tables, precisely so a child arriving before its
 * parent is not an error. It is kept in dependency order anyway so that a
 * partial sync leaves the remote copy in a state that reads sensibly.
 *
 * `meta` is absent on purpose: it holds this device's sync cursors, which are
 * per-device state and must never be replicated.
 */
export const SYNC_TABLES: readonly SyncTable[] = [
  { remoteName: 'accounts', table: accounts },
  { remoteName: 'categories', table: categories },
  { remoteName: 'transactions', table: transactions },
  { remoteName: 'todos', table: todos },
  { remoteName: 'notes', table: notes },
  { remoteName: 'applications', table: applications },
  { remoteName: 'application_events', table: applicationEvents },
];
