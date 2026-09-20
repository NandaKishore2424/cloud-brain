import { inArray } from 'drizzle-orm';

import { db } from '@/db/client';
import { meta } from '@/db/schema';
import { attempt, type Result } from '@/lib/result';

/**
 * Sync cursors — what this device has already sent and received.
 *
 * **Why these live in the `meta` table rather than in an outbox table or in
 * AsyncStorage.** They have to move in the same transaction as the data they
 * describe, or a crash between "wrote the rows" and "wrote the cursor" leaves
 * the two disagreeing. Keeping them in the same SQLite database as everything
 * else makes that atomicity available; a cursor in AsyncStorage could never
 * have it.
 *
 * **Why they are per-device state and never sync.** `meta` is deliberately
 * absent from `SYNC_TABLES`. A cursor means "how far *this* phone has got";
 * replicating it to another phone would tell that device it had already
 * received rows it has never seen, and those rows would be skipped forever.
 */

export const CURSOR_KEYS = {
  /** Highest local `updatedAt` known to be on the server. */
  lastPushedAt: 'sync.lastPushedAt',
  /** Highest remote `updated_at` known to be in this database. */
  lastPulledAt: 'sync.lastPulledAt',
  /** The account this local database belongs to. See `accountGuard`. */
  userId: 'sync.userId',
  /** Wall-clock of the last fully successful sync. Display only. */
  lastSyncedAt: 'sync.lastSyncedAt',
} as const;

export type Cursors = {
  readonly lastPushedAt: number;
  readonly lastPulledAt: number;
  readonly userId: string | null;
  readonly lastSyncedAt: number | null;
};

/** `meta.value` is TEXT, so every number round-trips through a string. */
function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function readCursors(): Promise<Result<Cursors>> {
  return attempt('DB_READ', 'Could not read sync state.', async () => {
    const rows = await db
      .select()
      .from(meta)
      .where(inArray(meta.key, Object.values(CURSOR_KEYS)));

    const found = new Map(rows.map((row) => [row.key, row.value]));

    return {
      // Zero, not "now". A fresh database has sent and received nothing, so
      // the first sync must consider every row — starting the cursor at the
      // current time would skip the entire existing database.
      lastPushedAt: toNumber(found.get(CURSOR_KEYS.lastPushedAt), 0),
      lastPulledAt: toNumber(found.get(CURSOR_KEYS.lastPulledAt), 0),
      userId: found.get(CURSOR_KEYS.userId) ?? null,
      lastSyncedAt: found.has(CURSOR_KEYS.lastSyncedAt)
        ? toNumber(found.get(CURSOR_KEYS.lastSyncedAt), 0)
        : null,
    };
  });
}

/** Write one cursor. Upsert, because the row may not exist on a fresh install. */
export async function writeCursor(key: string, value: string | number): Promise<void> {
  await db
    .insert(meta)
    .values({ key, value: String(value) })
    .onConflictDoUpdate({ target: meta.key, set: { value: String(value) } });
}

/**
 * Forget everything this device knows about sync, without touching the data.
 *
 * The recovery action for a database that belongs to another account, and for
 * "something is wrong, sync everything again from scratch". Resetting the
 * cursors to zero makes the next sync consider every row in both directions;
 * the conditional upserts on both sides make that safe rather than destructive,
 * which is precisely why a full resync is an acceptable repair here and would
 * not be under an unconditional one.
 */
export async function resetCursors(): Promise<Result<void>> {
  return attempt('DB_WRITE', 'Could not reset sync state.', async () => {
    await db.delete(meta).where(inArray(meta.key, Object.values(CURSOR_KEYS)));
  });
}
