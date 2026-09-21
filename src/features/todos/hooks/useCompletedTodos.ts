import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { completedTodos, type TodoListItem } from '../api';

/** Recently completed todos, newest first. Capped by the query. */
export function useCompletedTodos(): TodoListItem[] {
  const query = useMemo(() => completedTodos(), []);
  const { data } = useLiveQuery(query, [query]);
  return data ?? [];
}
