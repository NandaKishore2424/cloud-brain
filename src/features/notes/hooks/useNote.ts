import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { noteById, type NoteListItem } from '../api';

export type SingleNote = {
  note: NoteListItem | undefined;
  isLoading: boolean;
};

/** One note, reactively. Used by the editor to seed its draft state. */
export function useNote(id: string): SingleNote {
  const query = useMemo(() => noteById(id), [id]);
  const { data, updatedAt } = useLiveQuery(query);

  return {
    note: data?.[0],
    isLoading: updatedAt === undefined,
  };
}
