import { drizzle } from 'drizzle-orm/sql-js';
import initSqlJs from 'sql.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { notes } from '@/db/schema';

import { conditionalUpsert, upsertAssignments } from './localUpsert';
import { toLocalRow } from './tables';

/**
 * The local half of last-write-wins, executed.
 *
 * `scripts/verify-rls.js` runs the equivalent assertions against real Postgres
 * for the server side. Without this file the client side of the same rule —
 * the half that protects unpushed local edits — would be the only part of the
 * conflict policy never actually run before reaching a phone.
 *
 * sql.js is real SQLite compiled to WebAssembly, so `ON CONFLICT ... WHERE` is
 * evaluated by the same engine that runs on the device.
 */

type Db = ReturnType<typeof drizzle>;

let db: Db;

const ID = '0199aa11-bb22-7c33-8d44-ee55ff667788';

/** The columns the real migration creates, so the test runs the real shape. */
const CREATE_NOTES = `
  CREATE TABLE notes (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL DEFAULT '',
    body       TEXT NOT NULL DEFAULT '',
    tags       TEXT NOT NULL DEFAULT '[]',
    pinned_at  INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );
`;

function remoteNote(fields: Record<string, unknown>) {
  return toLocalRow(notes, {
    id: ID,
    title: 'untitled',
    body: '',
    tags: [],
    pinned_at: null,
    created_at: 1,
    updated_at: 100,
    deleted_at: null,
    // PostgREST returns a user_id the local schema has no column for; dropping
    // it is `toLocalRow`'s job, and doing it here proves that still happens.
    user_id: 'some-user',
    ...fields,
  });
}

async function titleAndTimestamp() {
  const rows = await db.select().from(notes);
  return { title: rows[0]?.title, updatedAt: rows[0]?.updatedAt };
}

beforeEach(async () => {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  sqlite.run(CREATE_NOTES);
  db = drizzle(sqlite);
});

describe('upsertAssignments', () => {
  it('assigns every column except the primary key', () => {
    const keys = Object.keys(upsertAssignments(notes));

    expect(keys).not.toContain('id');
    // Generated from the schema, so a column added later is covered without
    // anyone remembering to add it here.
    expect(keys.sort()).toEqual(
      ['body', 'createdAt', 'deletedAt', 'pinnedAt', 'tags', 'title', 'updatedAt'].sort(),
    );
  });
});

describe('conditionalUpsert', () => {
  it('inserts a row that does not exist yet', async () => {
    await conditionalUpsert(db, notes, [remoteNote({ title: 'first' })]);
    expect(await titleAndTimestamp()).toEqual({ title: 'first', updatedAt: 100 });
  });

  it('lets a newer row win', async () => {
    await conditionalUpsert(db, notes, [remoteNote({ title: 'old', updated_at: 100 })]);
    await conditionalUpsert(db, notes, [remoteNote({ title: 'new', updated_at: 200 })]);

    expect(await titleAndTimestamp()).toEqual({ title: 'new', updatedAt: 200 });
  });

  // The assertion this whole module exists for. A pull must not flatten an
  // edit made on this device and not yet sent.
  it('refuses a stale row, leaving the local edit intact', async () => {
    await conditionalUpsert(db, notes, [remoteNote({ title: 'local edit', updated_at: 500 })]);
    await conditionalUpsert(db, notes, [remoteNote({ title: 'stale server', updated_at: 200 })]);

    expect(await titleAndTimestamp()).toEqual({ title: 'local edit', updatedAt: 500 });
  });

  it('treats an equal timestamp as stale, so a re-pull does not churn rows', async () => {
    await conditionalUpsert(db, notes, [remoteNote({ title: 'kept', updated_at: 300 })]);
    await conditionalUpsert(db, notes, [remoteNote({ title: 'replaced', updated_at: 300 })]);

    expect(await titleAndTimestamp()).toEqual({ title: 'kept', updatedAt: 300 });
  });

  it('applies a tombstone like any other update', async () => {
    await conditionalUpsert(db, notes, [remoteNote({ title: 'alive', updated_at: 100 })]);
    await conditionalUpsert(db, notes, [
      remoteNote({ title: 'alive', updated_at: 200, deleted_at: 200 }),
    ]);

    const rows = await db.select().from(notes);
    expect(rows[0]?.deletedAt).toBe(200);
  });

  it('round-trips a JSON column rather than storing "[object Object]"', async () => {
    await conditionalUpsert(db, notes, [remoteNote({ tags: ['work', 'urgent'] })]);

    const rows = await db.select().from(notes);
    expect(rows[0]?.tags).toEqual(['work', 'urgent']);
  });

  it('handles a batch larger than one chunk', async () => {
    const many = Array.from({ length: 250 }, (_, i) => {
      const id = `0199aa11-bb22-7c33-8d44-${String(i).padStart(12, '0')}`;
      return remoteNote({ id, title: `note ${i}` });
    });

    await conditionalUpsert(db, notes, many);

    const rows = await db.select().from(notes);
    expect(rows).toHaveLength(250);
  });

  it('does nothing when given no rows', async () => {
    await conditionalUpsert(db, notes, []);
    expect(await db.select().from(notes)).toHaveLength(0);
  });
});
