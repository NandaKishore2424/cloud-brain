/**
 * Sync planning — the decisions, with none of the I/O.
 *
 * Everything here is a pure function, which is the point. A sync engine's bugs
 * are almost never in the HTTP call; they are in the arithmetic around it —
 * a cursor that advances past a row, a page loop that never terminates, a
 * batch boundary that drops a record. That logic is extracted here so it can be
 * tested by `npm run test` in milliseconds, with no device, no network and no
 * Supabase project. See ADR 0008 for why the project tests this layer and not
 * the rendering one.
 */

/* ------------------------------------------------------------------ */
/* Batching                                                            */
/* ------------------------------------------------------------------ */

/**
 * Rows per push RPC.
 *
 * The limit is the request body, not Postgres: the whole batch is serialised
 * into one JSON payload. 200 rows of this app's shape is on the order of tens
 * of kilobytes, which is comfortable on a phone connection and still means a
 * first sync of a few thousand rows is a handful of round trips rather than
 * thousands.
 */
export const PUSH_CHUNK_SIZE = 200;

/** Rows per pull page. Reads are cheaper than writes, so the page is larger. */
export const PULL_PAGE_SIZE = 500;

/** Split into fixed-size batches, preserving order. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');

  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Cursors                                                             */
/* ------------------------------------------------------------------ */

/**
 * The new cursor after handling a set of rows.
 *
 * **The cursor is derived from the data, never from the clock.** Using
 * `Date.now()` here is the classic sync bug: the device clock and the server
 * clock disagree by some unknown amount, so a cursor set from local time can
 * land *ahead* of rows the server is about to hand out — and those rows are
 * then skipped on every subsequent sync, permanently. Taking the maximum
 * `updated_at` actually observed makes the cursor a statement about data seen
 * rather than a statement about time, and the two clocks stop mattering.
 *
 * `previous` is included in the maximum so an empty batch cannot move it
 * backwards.
 */
export function highestTimestamp(previous: number, values: readonly number[]): number {
  let highest = previous;
  for (const value of values) {
    if (Number.isFinite(value) && value > highest) highest = value;
  }
  return highest;
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

/** Where the last page stopped: the sort key of its final row. */
export type PageCursor = Readonly<{ updatedAt: number; id: string }>;

export type PageQuery =
  /** First page: everything newer than the stored cursor. */
  | Readonly<{ kind: 'since'; updatedAt: number }>
  /** Later pages: a PostgREST `or=` expression continuing after `cursor`. */
  | Readonly<{ kind: 'after'; expression: string }>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The filter for the next page of a pull.
 *
 * **Why this is a keyset and not an offset.** `OFFSET n` re-scans and skips n
 * rows on every page, so paging through the table is quadratic — and worse, if
 * a row is written between two pages the window shifts underneath and a row is
 * silently skipped. Keyset pagination asks for "everything after this exact
 * position", which is stable under concurrent writes and uses the index.
 *
 * **Why the position is a pair and not just a timestamp.** Ordering by
 * `updated_at` alone is not a total order: rows written in the same
 * transaction share a millisecond. If a page ends in the middle of such a
 * group, `updated_at > last` skips the rest of the group, while
 * `updated_at >= last` returns the same page forever — an infinite loop that
 * only appears once a single millisecond holds more rows than fit in a page.
 * Adding `id` as a tiebreaker makes the sort key unique, so "strictly after
 * this row" is always well defined:
 *
 *     updated_at > t  OR  (updated_at = t AND id > i)
 *
 * The id is validated rather than escaped. It comes from our own UUIDv7
 * generator and can only be a hex string, so anything else is a bug worth
 * failing loudly on — not a value to sanitise and carry into a query.
 */
export function pageQuery(since: number, cursor: PageCursor | null): PageQuery {
  if (cursor === null) return { kind: 'since', updatedAt: since };

  if (!UUID_RE.test(cursor.id)) {
    throw new Error(`refusing to page from a non-uuid id: ${cursor.id}`);
  }
  if (!Number.isInteger(cursor.updatedAt)) {
    throw new Error(`refusing to page from a non-integer timestamp: ${cursor.updatedAt}`);
  }

  return {
    kind: 'after',
    expression:
      `updated_at.gt.${cursor.updatedAt},` +
      `and(updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`,
  };
}

/** A page smaller than the limit means the server has nothing left to give. */
export function isLastPage(received: number, pageSize: number): boolean {
  return received < pageSize;
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

export type AccountGuard =
  | Readonly<{ kind: 'ok' }>
  /** First sync on this device — adopt the account. */
  | Readonly<{ kind: 'claim' }>
  /** The local database belongs to a different account. Refuse. */
  | Readonly<{ kind: 'mismatch'; storedUserId: string }>;

/**
 * Whether this local database may sync with this account.
 *
 * The failure mode being prevented is not hypothetical: sign in as A, sync,
 * sign out, sign in as B, and a naive engine pushes every one of A's rows into
 * B's account — where RLS happily accepts them, because they arrive stamped
 * with B's `user_id`. Row-level security protects one account from another over
 * the network; it cannot protect against a client that has simply mixed two
 * people's data together locally before sending it.
 *
 * So the account that a local database belongs to is recorded on first sync and
 * checked on every sync after. A mismatch stops sync entirely rather than
 * resolving it, because both resolutions destroy something: pushing merges the
 * two, wiping the local database discards unsynced work. That is a decision for
 * the person, not the engine.
 */
export function accountGuard(storedUserId: string | null, currentUserId: string): AccountGuard {
  if (storedUserId === null || storedUserId === '') return { kind: 'claim' };
  if (storedUserId === currentUserId) return { kind: 'ok' };
  return { kind: 'mismatch', storedUserId };
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/**
 * "Synced 4 min ago" — deliberately coarse.
 *
 * Sync status is glanceable information: the only questions it answers are
 * "did it work" and "was it recently". A live-ticking seconds counter invites
 * the user to watch a number that does not matter, so the resolution drops off
 * quickly with age.
 */
export function formatSyncedAt(at: number | null, now: number): string {
  if (at === null) return 'Never synced';

  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'Synced just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Synced ${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.round(hours / 24);
  return `Synced ${days} ${days === 1 ? 'day' : 'days'} ago`;
}
