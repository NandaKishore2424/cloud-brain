import { and, between, desc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { workLogs } from '@/db/schema';
import { nowTimestamp, type CalendarDate, type DateRange } from '@/lib/date';
import { newId } from '@/lib/id';
import { attempt, err, ok, type Result } from '@/lib/result';

import { normaliseBody } from '../summary';

/**
 * Work log data access. The only place work-log SQL is written.
 *
 * Same two-shape split as every other feature: unexecuted query builders for
 * `useLiveQuery`, and mutations returning `Result<T>`.
 */

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Live entries in one week.
 *
 * Ordered by `logged_on` only. The within-day order (by `created_at`) is applied
 * in `groupByDay` instead: adding it here would make SQLite sort the tail of
 * every result in a temporary B-tree, because the index supplies
 * `(deleted_at, logged_on)` and nothing after. `npm run verify:schema` asserts
 * this exact query plan has no temp sort. A week is tens of rows, so the
 * in-memory sort is free — but a query plan that lies about its shape is not.
 *
 * Bounded by the week, so no LIMIT is needed.
 */
export function workLogForWeek(range: DateRange) {
  return db
    .select()
    .from(workLogs)
    .where(and(isNull(workLogs.deletedAt), between(workLogs.loggedOn, range.start, range.end)))
    .orderBy(desc(workLogs.loggedOn));
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type WorkLogInput = {
  body: string;
  loggedOn: CalendarDate;
};

/**
 * Validation lives here, not only in the screen.
 *
 * The table's CHECK constraint would reject an empty body anyway — but as a
 * constraint violation, which surfaces as a generic write failure. Checking
 * first turns the same rule into a message the person can act on.
 */
function validated(input: WorkLogInput): Result<WorkLogInput> {
  const body = normaliseBody(input.body);
  if (body === '') return err('VALIDATION', 'Write or dictate something first.');
  return ok({ body, loggedOn: input.loggedOn });
}

export async function createWorkLog(input: WorkLogInput): Promise<Result<string>> {
  const clean = validated(input);
  if (!clean.ok) return clean;

  const id = newId();
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not save that entry', () =>
    db.insert(workLogs).values({
      id,
      body: clean.value.body,
      loggedOn: clean.value.loggedOn,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return result.ok ? ok(id) : result;
}

export async function updateWorkLog(id: string, input: WorkLogInput): Promise<Result<void>> {
  const clean = validated(input);
  if (!clean.ok) return clean;

  const result = await attempt('DB_WRITE', 'Could not update that entry', () =>
    db
      .update(workLogs)
      .set({ body: clean.value.body, loggedOn: clean.value.loggedOn, updatedAt: nowTimestamp() })
      .where(eq(workLogs.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export async function softDeleteWorkLog(id: string): Promise<Result<void>> {
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not delete that entry', () =>
    db.update(workLogs).set({ deletedAt: now, updatedAt: now }).where(eq(workLogs.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export async function restoreWorkLog(id: string): Promise<Result<void>> {
  const result = await attempt('DB_WRITE', 'Could not restore that entry', () =>
    db
      .update(workLogs)
      .set({ deletedAt: null, updatedAt: nowTimestamp() })
      .where(eq(workLogs.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}
