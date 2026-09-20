import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { notes, type Note } from '@/db/schema';
import { nowTimestamp } from '@/lib/date';
import { newId } from '@/lib/id';
import { attempt, err, ok, type Result } from '@/lib/result';

import { normaliseTags, sanitiseSearchTerm } from '../tags';

/**
 * Note data access. The only place note SQL is written.
 *
 * Same two-shape split as money and todos: unexecuted query builders for
 * `useLiveQuery`, and mutations returning `Result<T>`.
 */

export type NoteListItem = Note;

/** Cap on rows returned by the list and by search. */
const LIST_LIMIT = 200;

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Notes, pinned first, then most recently edited.
 *
 * The ordering expression is `(pinned_at IS NULL)` ascending — false (0) sorts
 * before true (1), so pinned notes lead — then `pinned_at` descending so the
 * most recently pinned is first among them, then `updated_at` descending for
 * everything else.
 *
 * `search` is matched with LIKE against title and body. A leading wildcard
 * cannot use an index, so this is a full scan; see ADR 0010 for the measurement
 * that makes it acceptable at this scale and the threshold for revisiting.
 *
 * The term is passed as a bound parameter by Drizzle, not interpolated, so a
 * note containing `%` or a quote cannot alter the query.
 */
export function notesList(search: string) {
  const term = search.trim();

  const filters = [isNull(notes.deletedAt)];
  if (term.length > 0) {
    const pattern = `%${sanitiseSearchTerm(term)}%`;
    const match = or(like(notes.title, pattern), like(notes.body, pattern));
    if (match !== undefined) filters.push(match);
  }

  return db
    .select()
    .from(notes)
    .where(and(...filters))
    .orderBy(
      sql`${notes.pinnedAt} IS NULL`,
      desc(notes.pinnedAt),
      desc(notes.updatedAt),
    )
    .limit(LIST_LIMIT);
}

/** A single note, for the editor. */
export function noteById(id: string) {
  return db.select().from(notes).where(eq(notes.id, id)).limit(1);
}

/**
 * Every tag currently in use, with a count.
 *
 * `tags` is a JSON array in a TEXT column, so this cannot be a GROUP BY — SQLite
 * has no array type to unnest without the JSON1 extension's `json_each`. Using
 * `json_each` would work but ties the query to an extension for what is a small
 * in-memory reduction over an already-loaded list, so the aggregation happens in
 * the hook instead.
 */
export function allNotesForTagIndex() {
  return db
    .select({ tags: notes.tags })
    .from(notes)
    .where(isNull(notes.deletedAt));
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export type CreateNoteInput = {
  title?: string;
  body?: string;
  tags?: string[];
};

/**
 * Create a note and return its id.
 *
 * Notes are created **empty and immediately**, before the user types anything,
 * so the editor has a real row to autosave into. An editor that has to decide
 * between "insert" and "update" on every keystroke is where duplicate-note bugs
 * come from.
 *
 * The consequence is handled by `discardIfEmpty`: a note opened and abandoned
 * without typing is removed on exit, so backing out of a new note does not
 * leave a blank row behind.
 */
export async function createNote(input: CreateNoteInput = {}): Promise<Result<string>> {
  const id = newId();
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not create that note', () =>
    db.insert(notes).values({
      id,
      title: input.title ?? '',
      body: input.body ?? '',
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    }),
  );

  return result.ok ? ok(id) : result;
}

export type UpdateNotePatch = {
  title?: string;
  body?: string;
  tags?: string[];
};

export async function updateNote(
  id: string,
  patch: UpdateNotePatch,
): Promise<Result<void>> {
  const result = await attempt('DB_WRITE', 'Could not save that note', () =>
    db
      .update(notes)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : null),
        ...(patch.body !== undefined ? { body: patch.body } : null),
        ...(patch.tags !== undefined ? { tags: normaliseTags(patch.tags) } : null),
        updatedAt: nowTimestamp(),
      })
      .where(eq(notes.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export async function setNotePinned(
  id: string,
  pinned: boolean,
): Promise<Result<void>> {
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not pin that note', () =>
    db
      .update(notes)
      .set({ pinnedAt: pinned ? now : null, updatedAt: now })
      .where(eq(notes.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export async function softDeleteNote(id: string): Promise<Result<void>> {
  const now = nowTimestamp();

  const result = await attempt('DB_WRITE', 'Could not delete that note', () =>
    db.update(notes).set({ deletedAt: now, updatedAt: now }).where(eq(notes.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

export async function restoreNote(id: string): Promise<Result<void>> {
  const result = await attempt('DB_WRITE', 'Could not restore that note', () =>
    db
      .update(notes)
      .set({ deletedAt: null, updatedAt: nowTimestamp() })
      .where(eq(notes.id, id)),
  );

  return result.ok ? ok(undefined) : result;
}

/**
 * Remove a note that was created but never written to.
 *
 * A genuine hard delete, not a tombstone. A note with no title, no body and no
 * tags was never a note — it is an artefact of opening the editor. Leaving a
 * tombstone would sync an empty row to every other device in Phase 4.
 *
 * Guarded by the emptiness check in SQL rather than trusting the caller, so a
 * race between autosave and navigating back cannot delete content.
 */
export async function discardIfEmpty(id: string): Promise<Result<boolean>> {
  const result = await attempt('DB_WRITE', 'Could not discard that note', async () => {
    const outcome = await db
      .delete(notes)
      .where(
        and(
          eq(notes.id, id),
          eq(notes.title, ''),
          eq(notes.body, ''),
          sql`${notes.tags} IN ('[]', '')`,
        ),
      );

    // Drizzle surfaces the driver result; a changed-row count of 0 means the
    // note had content and was correctly left alone.
    const changes = (outcome as { changes?: number }).changes ?? 0;
    return changes > 0;
  });

  return result.ok ? ok(result.value) : result;
}

export async function getNote(id: string): Promise<Result<Note>> {
  const result = await attempt('DB_READ', 'Could not load that note', () =>
    db.select().from(notes).where(eq(notes.id, id)).limit(1),
  );

  if (!result.ok) return result;

  const row = result.value[0];
  if (!row) return err('NOT_FOUND', 'That note no longer exists');
  return ok(row);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

