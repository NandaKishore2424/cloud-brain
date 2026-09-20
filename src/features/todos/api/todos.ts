import { and, asc, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { todos, type Todo, type TodoPriority } from '@/db/schema';
import { nowTimestamp, type CalendarDate } from '@/lib/date';
import { newId } from '@/lib/id';
import {
  orderForMove,
  orderForNewItem,
  renormalise,
  type OrderAssignment,
} from '@/lib/ordering';
import { attempt, err, ok, type Result } from '@/lib/result';

/**
 * Todo data access. The only place todo SQL is written.
 *
 * Same two-shape split as the money feature: unexecuted query builders for
 * `useLiveQuery` to subscribe to, and mutations that execute and return
 * `Result<T>`.
 */

export type TodoListItem = Todo;

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Open todos — not deleted, not completed.
 *
 * Ordered by `sortOrder` here even though `groupTodos` sorts within buckets
 * anyway. Returning rows already in order means the grouping pass is a single
 * sort per bucket over an almost-sorted array rather than over a shuffled one,
 * and it makes the query's output deterministic when debugging.
 */
export function openTodos() {
  return db
    .select()
    .from(todos)
    .where(and(isNull(todos.deletedAt), isNull(todos.completedAt)))
    .orderBy(asc(todos.sortOrder));
}

/**
 * Recently completed todos, newest first.
 *
 * Capped. The done list is for reassurance and for undoing an accidental tick,
 * not an archive — an unbounded query would grow without limit and it is read
 * on every write like every other live query.
 */
export function completedTodos(limit = 50) {
  return db
    .select()
    .from(todos)
    .where(and(isNull(todos.deletedAt), isNotNull(todos.completedAt)))
    .orderBy(desc(todos.completedAt))
    .limit(limit);
}

/**
 * Distinct project names across open todos, with a count for each.
 *
 * `project` is free text rather than a foreign key (see docs/data-model.md), so
 * the set of projects is derived rather than stored. That keeps projects
 * zero-maintenance: one disappears when its last todo does, with no orphan rows
 * and no management screen.
 */
export function projectsInUse() {
  return db
    .select({
      project: todos.project,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(todos)
    .where(
      and(isNull(todos.deletedAt), isNull(todos.completedAt), isNotNull(todos.project)),
    )
    .groupBy(todos.project)
    .orderBy(desc(sql`count`));
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type CreateTodoInput = {
  title: string;
  project?: string | null;
  priority?: TodoPriority;
  dueOn?: CalendarDate | null;
  details?: string | null;
};

export async function createTodo(input: CreateTodoInput): Promise<Result<string>> {
  const title = input.title.trim();
  if (title.length === 0) {
    return err('VALIDATION', 'Give the task a title');
  }

  const id = newId();
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not save that task', () =>
    // Read-then-write, so it runs in a transaction: the minimum order must not
    // move between being read and being used. A second insert racing this one
    // would otherwise produce two todos claiming the same position.
    db.transaction(async (tx) => {
      const [row] = await tx
        .select({ minimum: sql<number | null>`min(${todos.sortOrder})` })
        .from(todos)
        .where(and(isNull(todos.deletedAt), isNull(todos.completedAt)));

      await tx.insert(todos).values({
        id,
        title,
        details: normaliseText(input.details),
        project: normaliseText(input.project),
        priority: input.priority ?? 'normal',
        dueOn: input.dueOn ?? null,
        sortOrder: orderForNewItem(row?.minimum ?? null),
        createdAt: now,
        updatedAt: now,
      });

      return id;
    }),
  );

  return result.ok ? ok(id) : result;
}

/**
 * Tick or untick a todo.
 *
 * Completion state lives in `completedAt` rather than a boolean, which stores
 * *when* it was done for free and makes "recently completed" a plain ORDER BY
 * instead of needing a second column.
 */
export async function setTodoCompleted(
  id: string,
  completed: boolean,
): Promise<Result<void>> {
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not update that task', () =>
    db
      .update(todos)
      .set({ completedAt: completed ? now : null, updatedAt: now })
      .where(eq(todos.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export type UpdateTodoPatch = Partial<
  Pick<CreateTodoInput, 'title' | 'project' | 'priority' | 'dueOn' | 'details'>
>;

export async function updateTodo(
  id: string,
  patch: UpdateTodoPatch,
): Promise<Result<void>> {
  if (patch.title !== undefined && patch.title.trim().length === 0) {
    return err('VALIDATION', 'Give the task a title');
  }

  const result = await attempt('DB_WRITE', 'Could not update that task', () =>
    db
      .update(todos)
      .set({
        ...(patch.title !== undefined ? { title: patch.title.trim() } : null),
        ...(patch.project !== undefined ? { project: normaliseText(patch.project) } : null),
        ...(patch.details !== undefined ? { details: normaliseText(patch.details) } : null),
        ...(patch.priority !== undefined ? { priority: patch.priority } : null),
        ...(patch.dueOn !== undefined ? { dueOn: patch.dueOn } : null),
        updatedAt: nowTimestamp(),
      })
      .where(eq(todos.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export async function softDeleteTodo(id: string): Promise<Result<void>> {
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not delete that task', () =>
    db.update(todos).set({ deletedAt: now, updatedAt: now }).where(eq(todos.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export async function restoreTodo(id: string): Promise<Result<void>> {
  const result = await attempt('DB_WRITE', 'Could not restore that task', () =>
    db
      .update(todos)
      .set({ deletedAt: null, updatedAt: nowTimestamp() })
      .where(eq(todos.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

/**
 * Push every overdue task to a new date in one write.
 *
 * Overdue tasks accumulate — a week away and there are eleven of them, each
 * needing the detail sheet opened, a date picked and the sheet dismissed. That
 * friction is why people abandon todo apps rather than triage them: the pile
 * becomes evidence of failure instead of a list of work.
 *
 * One statement, not a read-then-loop. The predicate does the selection, so
 * this is a single UPDATE regardless of how many rows match, and there is no
 * window in which a task completed mid-operation gets rescheduled anyway.
 *
 * Only *open* tasks move. A task completed late is finished, and dragging its
 * due date forward would rewrite history.
 */
export async function rescheduleOverdue(
  today: CalendarDate,
  to: CalendarDate,
): Promise<Result<number>> {
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not reschedule those tasks', async () => {
    const affected = await db
      .select({ id: todos.id })
      .from(todos)
      .where(
        and(
          isNull(todos.deletedAt),
          isNull(todos.completedAt),
          lt(todos.dueOn, today),
        ),
      );

    if (affected.length === 0) return 0;

    await db
      .update(todos)
      .set({ dueOn: to, updatedAt: now })
      .where(
        and(
          isNull(todos.deletedAt),
          isNull(todos.completedAt),
          lt(todos.dueOn, today),
        ),
      );

    return affected.length;
  });

  return result.ok ? ok(result.value) : result;
}

/* ------------------------------------------------------------------ */
/* Reordering                                                          */
/* ------------------------------------------------------------------ */

export type OrderedTodo = { id: string; sortOrder: number };

/**
 * Move a todo within its bucket.
 *
 * The happy path writes exactly one row: `orderForMove` finds an integer
 * between the new neighbours and only that todo's `sortOrder` changes.
 *
 * When the gap between neighbours is exhausted — roughly sixteen insertions at
 * the same position — it returns `null`, and this falls back to re-spacing the
 * whole bucket. That is O(n) writes, but for one bucket and only after repeated
 * insertions at one spot.
 *
 * Keeping the fallback here rather than in the hook means callers never have to
 * know the ordering scheme can run out of room.
 */
export async function moveTodo(
  bucket: readonly OrderedTodo[],
  fromIndex: number,
  toIndex: number,
): Promise<Result<void>> {
  const target = orderForMove(bucket, fromIndex, toIndex);

  // `undefined` means the move is a no-op — do not dirty a row for nothing.
  if (target === undefined) return ok(undefined);

  const moving = bucket[fromIndex];
  if (!moving) return err('NOT_FOUND', 'That task is no longer in the list');

  if (target !== null) {
    const result = await attempt('DB_WRITE', 'Could not reorder that task', () =>
      db
        .update(todos)
        .set({ sortOrder: target, updatedAt: nowTimestamp() })
        .where(eq(todos.id, moving.id)),
    );
    return result.ok ? ok(undefined) : result;
  }

  // Gap exhausted. Re-space the bucket in its intended final order.
  const reordered = [...bucket];
  const [removed] = reordered.splice(fromIndex, 1);
  if (removed) reordered.splice(toIndex, 0, removed);

  return applyOrderAssignments(renormalise(reordered));
}

/** Write a full set of re-spaced orders in one transaction. */
async function applyOrderAssignments(
  assignments: readonly OrderAssignment[],
): Promise<Result<void>> {
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not reorder tasks', () =>
    db.transaction(async (tx) => {
      for (const assignment of assignments) {
        await tx
          .update(todos)
          .set({ sortOrder: assignment.sortOrder, updatedAt: now })
          .where(eq(todos.id, assignment.id));
      }
    }),
  );

  return result.ok ? ok(undefined) : result;
}

/** Empty and whitespace-only strings are stored as NULL, never as ''. */
function normaliseText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
