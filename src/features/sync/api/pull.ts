import type { SQLiteTable } from 'drizzle-orm/sqlite-core';

import { db } from '@/db/client';
import { attempt, err, ok, type Result } from '@/lib/result';

import { conditionalUpsert } from '../localUpsert';
import {
  highestTimestamp,
  isLastPage,
  pageQuery,
  PULL_PAGE_SIZE,
  type PageCursor,
} from '../plan';
import { SYNC_TABLES, toLocalRow } from '../tables';
import { requireSupabase } from './client';

/**
 * Pull — remote changes down into SQLite.
 *
 * **The same conditional upsert runs on this side too.** The server has
 * `sync_upsert_*`; SQLite gets `on conflict do update ... where
 * excluded.updated_at > <table>.updated_at`. Both directions need it for the
 * same reason: an arriving row must only win if it is genuinely newer, or a
 * pull can overwrite an edit made on this device seconds earlier and never
 * pushed. Last-write-wins is only true when *both* ends check.
 *
 * **Table order is load-bearing here, unlike on the server.** The Postgres
 * schema declares no foreign keys between synced tables, so rows may arrive in
 * any order; SQLite does declare them and has them enforced, so inserting a
 * transaction before its account is a constraint violation. `SYNC_TABLES` is
 * in parent-before-child order precisely so that never happens.
 */

export type PullOutcome = {
  readonly received: number;
  readonly highest: number;
};

async function writeLocally(
  table: SQLiteTable,
  rows: Record<string, unknown>[],
): Promise<Result<void>> {
  return attempt('DB_WRITE', 'Could not save synced changes.', () =>
    conditionalUpsert(db, table, rows),
  );
}

export async function pullChanges(since: number): Promise<Result<PullOutcome>> {
  const supabase = requireSupabase();

  let received = 0;
  let highest = since;

  for (const { remoteName, table } of SYNC_TABLES) {
    let cursor: PageCursor | null = null;

    // Keyset pagination. Bounded by construction: every page either ends the
    // loop by being short, or advances `cursor` to a strictly greater
    // (updated_at, id) — so the loop cannot revisit a row or stall.
    for (;;) {
      const query = pageQuery(since, cursor);

      let request = supabase
        .from(remoteName)
        .select('*')
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(PULL_PAGE_SIZE);

      request =
        query.kind === 'since'
          ? request.gt('updated_at', query.updatedAt)
          : request.or(query.expression);

      const { data, error } = await request;

      if (error !== null) {
        return err(
          /fetch|network|timeout|abort/i.test(error.message) ? 'NETWORK' : 'SYNC',
          `Could not fetch ${remoteName}: ${error.message}`,
          error,
        );
      }

      const remoteRows = (data ?? []) as Record<string, unknown>[];
      if (remoteRows.length === 0) break;

      const written = await writeLocally(
        table,
        remoteRows.map((row) => toLocalRow(table, row)),
      );
      if (!written.ok) return written;

      received += remoteRows.length;
      highest = highestTimestamp(
        highest,
        remoteRows.map((row) => Number(row.updated_at)),
      );

      if (isLastPage(remoteRows.length, PULL_PAGE_SIZE)) break;

      const last = remoteRows[remoteRows.length - 1];
      cursor = {
        updatedAt: Number(last?.updated_at),
        id: String(last?.id),
      };
    }
  }

  return ok({ received, highest });
}
