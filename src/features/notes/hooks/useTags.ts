import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { allNotesForTagIndex } from '../api';

export type TagSummary = { tag: string; count: number };

/**
 * Tags in use, most-used first.
 *
 * Aggregated in memory rather than in SQL. `tags` is a JSON array in a TEXT
 * column, so counting per tag in SQL would need the JSON1 extension's
 * `json_each` to unnest it. That works, but it ties the query to an extension
 * for what is a reduction over a list the app has already loaded.
 */
export function useTags(): TagSummary[] {
  const query = useMemo(() => allNotesForTagIndex(), []);
  const { data } = useLiveQuery(query, [query]);

  return useMemo(() => {
    const counts = new Map<string, number>();

    for (const row of data ?? []) {
      for (const tag of row.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [data]);
}
