import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { notesList, type NoteListItem } from '../api';

export type NotesData = {
  pinned: NoteListItem[];
  rest: NoteListItem[];
  total: number;
  isEmpty: boolean;
  isLoading: boolean;
  error: Error | undefined;
};

/**
 * Reactive note list, split into pinned and unpinned.
 *
 * The SQL already returns pinned notes first, so the split is a single pass
 * that stops at the first unpinned row rather than two filters over the array.
 *
 * `search` is the DEBOUNCED term, not the raw input — see `useDebouncedValue`.
 * Passing raw input would rebuild the query object on every keystroke and make
 * `useLiveQuery` re-subscribe each time.
 */
export function useNotes(search: string): NotesData {
  const query = useMemo(() => notesList(search), [search]);
  const { data, error, updatedAt } = useLiveQuery(query, [query]);

  return useMemo(() => {
    const rows = data ?? [];

    let boundary = 0;
    while (boundary < rows.length && rows[boundary]?.pinnedAt != null) {
      boundary += 1;
    }

    return {
      pinned: rows.slice(0, boundary),
      rest: rows.slice(boundary),
      total: rows.length,
      isEmpty: rows.length === 0,
      isLoading: updatedAt === undefined && error === undefined,
      error,
    };
  }, [data, error, updatedAt]);
}
