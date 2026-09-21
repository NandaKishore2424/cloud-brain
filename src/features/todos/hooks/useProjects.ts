import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { projectsInUse } from '../api';

export type ProjectSummary = { project: string; count: number };

/**
 * Projects currently in use, most-used first.
 *
 * Derived from the todos themselves rather than stored in a table, so a project
 * appears when its first task is created and disappears with its last. No CRUD
 * screen, no orphan rows, no rename cascade.
 */
export function useProjects(): ProjectSummary[] {
  const query = useMemo(() => projectsInUse(), []);
  const { data } = useLiveQuery(query, [query]);

  return useMemo(
    () =>
      (data ?? []).flatMap((row) =>
        row.project === null ? [] : [{ project: row.project, count: row.count }],
      ),
    [data],
  );
}
