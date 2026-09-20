import { asc, getTableColumns, gt, type Column } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import { db } from '@/db/client';
import { attempt, err, ok, type Result } from '@/lib/result';

import { chunk, highestTimestamp, PUSH_CHUNK_SIZE } from '../plan';
import { SYNC_TABLES, toRemoteRow } from '../tables';
import { requireSupabase } from './client';

/**
 * Push — local changes out to Postgres.
 *
 * **There is no outbox.** The set of rows needing to be sent is exactly
 * `updated_at > lastPushedAt`, because every table carries `updatedAt` and
 * deletes are tombstones rather than removals (CLAUDE.md §2, invariant 3). An
 * outbox table earns its keep when you need ordered, exactly-once delivery of
 * *operations*; this replicates *state* under last-write-wins, where "rows
 * changed since the cursor" is an equivalent question with none of the
 * bookkeeping — no second table to keep consistent with the first, and no way
 * for the outbox and the data to disagree after a crash.
 *
 * **Every push is idempotent.** `sync_upsert_*` applies a row only when it is
 * strictly newer than what the server holds, so re-sending a row that already
 * arrived is a no-op rather than a write. That property is what makes the
 * retry strategy below affordable.
 */

export type PushOutcome = {
  /** Rows sent. Includes rows the server then ignored as stale. */
  readonly sent: number;
  /** The new cursor — only meaningful when every table succeeded. */
  readonly highest: number;
};

/**
 * Invariant 3 guarantees this column on every table, so a missing one is a
 * schema bug rather than a runtime condition to handle gracefully.
 */
function updatedAtColumn(table: SQLiteTable): Column {
  const column = (getTableColumns(table) as Record<string, Column>).updatedAt;
  if (column === undefined) {
    throw new Error('a synced table has no updatedAt column');
  }
  return column;
}

export async function pushChanges(
  userId: string,
  since: number,
): Promise<Result<PushOutcome>> {
  const supabase = requireSupabase();

  let sent = 0;
  let highest = since;

  for (const { remoteName, table } of SYNC_TABLES) {
    const column = updatedAtColumn(table);

    // Ascending, so that a failure part-way leaves a contiguous prefix sent
    // rather than an arbitrary scattering of rows.
    //
    // Unbounded on purpose: the whole pending set is read into memory. At this
    // app's scale — one person, thousands of rows at the very most — that is a
    // few hundred kilobytes, and the alternative (a per-cycle row limit) needs
    // a tiebreaker on equal timestamps to avoid skipping rows, which is real
    // complexity bought for no present benefit. The *network* is still
    // batched; only the read is not.
    const pending = await attempt('DB_READ', 'Could not read local changes.', async () =>
      db.select().from(table).where(gt(column, since)).orderBy(asc(column)),
    );
    if (!pending.ok) return pending;

    const rows = pending.value as Record<string, unknown>[];
    if (rows.length === 0) continue;

    for (const batch of chunk(rows, PUSH_CHUNK_SIZE)) {
      const payload = batch.map((row) => toRemoteRow(table, row, userId));

      const { error } = await supabase.rpc(`sync_upsert_${remoteName}`, {
        rows: payload,
      });

      if (error !== null) {
        return err(
          isOffline(error) ? 'NETWORK' : 'SYNC',
          `Could not send ${remoteName}: ${error.message}`,
          error,
        );
      }

      sent += batch.length;
      highest = highestTimestamp(
        highest,
        batch.map((row) => Number(row.updatedAt)),
      );
    }
  }

  return ok({ sent, highest });
}

/**
 * Distinguishing "the network is down" from "the server said no".
 *
 * supabase-js surfaces a failed fetch as an error with an empty code, which is
 * indistinguishable from a real failure unless you look at the message. The
 * distinction matters to the UI: a dropped connection on a train is not worth
 * a red banner, while a rejected write is.
 */
function isOffline(error: { message: string; code?: string }): boolean {
  return /fetch|network|timeout|abort/i.test(error.message);
}
