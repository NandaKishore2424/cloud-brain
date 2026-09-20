import { count, getTableColumns, gt, type Column } from 'drizzle-orm';

import { db } from '@/db/client';
import { attempt, err, ok, type Result } from '@/lib/result';

import { accountGuard } from '../plan';
import { SYNC_TABLES } from '../tables';
import { currentSession } from './auth';
import { supabase } from './client';
import { CURSOR_KEYS, readCursors, writeCursor } from './cursors';
import { pullChanges } from './pull';
import { pushChanges } from './push';

/**
 * The sync cycle: push, then pull, then record that it worked.
 *
 * **Why the order does not matter for correctness.** The obvious worry is that
 * pushing before pulling sends a row that is already stale on the server. It
 * does — and the conditional upsert in migration 0003 discards it, atomically,
 * per row. Pulling first would only *narrow* that window rather than close it,
 * because another device can still write between this device's pull and its
 * push. Once correctness is handled in SQL, the order becomes a question of
 * preference, and push-first is preferred: it gets this device's unsaved work
 * off the device first, which is the half that is irreplaceable if the phone
 * is lost.
 *
 * **Why cursors advance only after a clean run.** Both cursors are global
 * rather than per-table, so a partial failure cannot be recorded precisely —
 * advancing after table 3 of 7 would risk skipping rows in tables 4 to 7 that
 * sort below the new cursor. So nothing advances unless everything succeeded,
 * and a failed sync simply repeats. That is affordable only because both ends
 * apply a row exclusively when it is strictly newer, which makes every retry a
 * no-op rather than a rewrite. Per-table cursors would cut the wasted traffic
 * and are the obvious change if this ever syncs enough data to notice.
 */

export type SyncSummary = {
  readonly sent: number;
  readonly received: number;
  readonly at: number;
};

/**
 * One sync at a time.
 *
 * Foregrounding the app, signing in and tapping "Sync now" can all fire within
 * a second of each other. Two concurrent cycles would read the same cursor,
 * send the same rows twice and race on writing it back. Sharing the in-flight
 * promise makes the second caller await the first rather than start a second.
 */
let inFlight: Promise<Result<SyncSummary>> | null = null;

export function runSync(): Promise<Result<SyncSummary>> {
  inFlight ??= execute().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function execute(): Promise<Result<SyncSummary>> {
  if (supabase === null) {
    return err('SYNC', 'Sync is not configured on this build.');
  }

  const session = await currentSession();
  if (session === null) {
    return err('AUTH', 'Sign in to sync.');
  }

  const cursors = await readCursors();
  if (!cursors.ok) return cursors;

  const userId = session.user.id;
  const guard = accountGuard(cursors.value.userId, userId);

  if (guard.kind === 'mismatch') {
    return err(
      'SYNC',
      'This device holds another account’s data. Reset sync to continue.',
    );
  }
  if (guard.kind === 'claim') {
    await writeCursor(CURSOR_KEYS.userId, userId);
  }

  const pushed = await pushChanges(userId, cursors.value.lastPushedAt);
  if (!pushed.ok) return pushed;
  await writeCursor(CURSOR_KEYS.lastPushedAt, pushed.value.highest);

  const pulled = await pullChanges(cursors.value.lastPulledAt);
  if (!pulled.ok) return pulled;
  await writeCursor(CURSOR_KEYS.lastPulledAt, pulled.value.highest);

  const at = Date.now();
  await writeCursor(CURSOR_KEYS.lastSyncedAt, at);

  return ok({ sent: pushed.value.sent, received: pulled.value.received, at });
}

/**
 * How many local rows have not reached the server.
 *
 * Shown on the sync screen so "not synced yet" is a number rather than a
 * feeling. Counted in SQL rather than by fetching rows — the answer is one
 * integer per table and the pending set can be the entire database on a first
 * run.
 */
export async function countPending(since: number): Promise<Result<number>> {
  return attempt('DB_READ', 'Could not count pending changes.', async () => {
    let total = 0;

    for (const { table } of SYNC_TABLES) {
      const updatedAt = (getTableColumns(table) as Record<string, Column>).updatedAt;
      if (updatedAt === undefined) continue;

      const rows = await db
        .select({ value: count() })
        .from(table)
        .where(gt(updatedAt, since));

      total += rows[0]?.value ?? 0;
    }

    return total;
  });
}
