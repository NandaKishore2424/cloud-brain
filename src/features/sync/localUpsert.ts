import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { BaseSQLiteDatabase, SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';

import { chunk } from './plan';

/**
 * The local half of last-write-wins.
 *
 * Migration 0003 gives Postgres a conditional upsert. This is its mirror for
 * SQLite, and it exists as its own module for one reason: so it can be executed
 * in a test. `pull.ts` imports `@/db/client`, which imports `expo-sqlite`,
 * which needs a device — so anything written there is unreachable from
 * `npm run test` and can only be verified by installing the app. Taking the
 * database as an argument instead makes the same code runnable against sql.js
 * in Node.
 *
 * That is not a theoretical benefit. Phase 0 shipped a module-initialisation
 * bug that passed `tsc` and passed bundling and crashed on first launch,
 * because nothing executed it. This is the same class of code: SQL assembled
 * from strings, correct-looking, and unverifiable by a type system.
 */

/** Rows per INSERT, bounded to stay well inside SQLite's parameter limit. */
export const LOCAL_WRITE_CHUNK = 100;

/**
 * Any Drizzle SQLite database, whatever drives it.
 *
 * Generic over the schema rather than pinned to one, so the same function
 * accepts the app's `expo-sqlite` instance and the test's `sql.js` one. That
 * substitutability is the reason this module exists.
 */
type AnySQLiteDatabase<TSchema extends Record<string, unknown>> = BaseSQLiteDatabase<
  'sync' | 'async',
  unknown,
  TSchema
>;

function columnsOf(table: SQLiteTable): Record<string, SQLiteColumn> {
  return getTableColumns(table) as Record<string, SQLiteColumn>;
}

/**
 * `DO UPDATE SET` — every column except the primary key, taken from the
 * incoming row.
 *
 * Generated from the schema rather than written out, for the same reason the
 * Postgres side is generated: a column left out by hand does not fail, it just
 * silently stops replicating that one field, and only on the *other* device.
 */
export function upsertAssignments(table: SQLiteTable): Record<string, SQL> {
  const set: Record<string, SQL> = {};

  for (const [tsName, column] of Object.entries(columnsOf(table))) {
    if (tsName === 'id') continue;
    set[tsName] = sql.raw(`excluded."${column.name}"`);
  }

  return set;
}

/**
 * Insert rows, letting an existing row win unless the incoming one is newer.
 *
 * The `setWhere` clause is the entire point:
 *
 *     on conflict (id) do update set ... where excluded.updated_at > t.updated_at
 *
 * Without it a pull overwrites whatever is on the device, including an edit
 * made seconds ago and not yet pushed. Last-write-wins is only true when both
 * ends check; a client that always yields to the server is server-wins, which
 * is a different policy that quietly eats offline work.
 */
export async function conditionalUpsert<TSchema extends Record<string, unknown>>(
  db: AnySQLiteDatabase<TSchema>,
  table: SQLiteTable,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  const columns = columnsOf(table);
  const idColumn = columns.id;
  const updatedAt = columns.updatedAt;

  if (idColumn === undefined || updatedAt === undefined) {
    throw new Error('a synced table is missing id or updatedAt');
  }

  for (const batch of chunk(rows, LOCAL_WRITE_CHUNK)) {
    await db
      .insert(table)
      // Rows are built by `toLocalRow` from this same table's column metadata,
      // so they match by construction; the cast is the price of being generic
      // over seven tables rather than writing this seven times.
      .values(batch as never)
      .onConflictDoUpdate({
        target: idColumn,
        set: upsertAssignments(table),
        setWhere: sql`excluded.${sql.raw(`"${updatedAt.name}"`)} > ${updatedAt}`,
      });
  }
}
