import { and, desc, eq, gte, isNull, lte, ne, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { applications, notes, todos, transactions } from '@/db/schema';
import type { CalendarDate, DateRange } from '@/lib/date';

/**
 * Dashboard read models.
 *
 * The dashboard aggregates across every feature, which makes it the one place
 * the "no feature imports another feature" rule (CLAUDE.md §2) would be
 * tempting to break. It is not broken here.
 *
 * Instead the dashboard is its own feature with its own queries against the
 * shared schema. `src/db` is infrastructure, so depending on it is the correct
 * direction; depending on `features/money/api` would not be.
 *
 * The cost is a little duplicated query shape — a month total is expressed here
 * as well as in the money feature. That is the right trade: these are
 * *different read models* that happen to touch the same table. The money
 * feature's version returns rows grouped by type for a breakdown; this one
 * returns two numbers for a tile. Coupling them so they could share code would
 * mean every change to the dashboard risks the ledger.
 */

/** Income and expense totals for a range, as at most two rows. */
export function monthTotals(range: DateRange) {
  return db
    .select({
      type: transactions.type,
      total: sql<number>`sum(${transactions.amount})`.as('total'),
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        gte(transactions.occurredOn, range.start),
        lte(transactions.occurredOn, range.end),
      ),
    )
    .groupBy(transactions.type);
}

/**
 * Open todos that are due today or overdue.
 *
 * Both in one query rather than two: they render as a single "what needs doing"
 * tile, and the split between them is a comparison the caller can make on the
 * rows it already has.
 */
export function todosDueBy(today: CalendarDate) {
  return db
    .select({
      id: todos.id,
      title: todos.title,
      dueOn: todos.dueOn,
      priority: todos.priority,
    })
    .from(todos)
    .where(
      and(
        isNull(todos.deletedAt),
        isNull(todos.completedAt),
        lte(todos.dueOn, today),
      ),
    )
    .orderBy(todos.dueOn)
    .limit(20);
}

/** Count of open todos with no due date or a future one. */
export function openTodoCount() {
  return db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(todos)
    .where(and(isNull(todos.deletedAt), isNull(todos.completedAt)));
}

/**
 * Applications with a follow-up due today or overdue.
 *
 * Terminal stages are excluded in SQL rather than filtered afterwards — the
 * index covers `(deleted_at, status, next_action_on)`, so letting SQLite do it
 * means the rejected and ghosted rows are never read.
 */
export function followUpsDueBy(today: CalendarDate) {
  return db
    .select({
      id: applications.id,
      company: applications.company,
      role: applications.role,
      nextAction: applications.nextAction,
      nextActionOn: applications.nextActionOn,
    })
    .from(applications)
    .where(
      and(
        isNull(applications.deletedAt),
        lte(applications.nextActionOn, today),
        and(ne(applications.status, 'rejected'), ne(applications.status, 'ghosted')),
      ),
    )
    .orderBy(applications.nextActionOn)
    .limit(10);
}

/** Count of applications still in play. */
export function activeApplicationCount() {
  return db
    .select({ count: sql<number>`count(*)`.as('count') })
    .from(applications)
    .where(
      and(
        isNull(applications.deletedAt),
        and(ne(applications.status, 'rejected'), ne(applications.status, 'ghosted')),
      ),
    );
}

/** The few most recently edited notes, for a glanceable strip. */
export function recentNotes(limit = 3) {
  return db
    .select({
      id: notes.id,
      title: notes.title,
      body: notes.body,
      updatedAt: notes.updatedAt,
      pinnedAt: notes.pinnedAt,
    })
    .from(notes)
    .where(
      and(
        isNull(notes.deletedAt),
        // A note with nothing in it is an artefact of opening the editor, not
        // something worth a slot on the dashboard.
        or(ne(notes.title, ''), ne(notes.body, '')),
      ),
    )
    .orderBy(desc(notes.updatedAt))
    .limit(limit);
}

/** Today's spending, for the "so far today" line. */
export function spentOn(day: CalendarDate) {
  return db
    .select({ total: sql<number>`coalesce(sum(${transactions.amount}), 0)`.as('total') })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.type, 'expense'),
        eq(transactions.occurredOn, day),
      ),
    );
}
