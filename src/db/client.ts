import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';

import * as schema from './schema';

export const DATABASE_NAME = 'cloudbrain.db';

/**
 * The single SQLite connection for the app's lifetime.
 *
 * Opened synchronously at module load. That is safe and intentional: expo-sqlite
 * opens the handle on the JS thread without touching disk beyond the file open,
 * and having `db` be a plain value rather than a promise means every query site
 * stays synchronous to write and read.
 *
 * `enableChangeListener: true` is NOT optional. It makes SQLite emit a native
 * event on every committed write, which is what Drizzle's `useLiveQuery` hook
 * subscribes to. Without it, queries return once and never update, and the UI
 * silently goes stale after the first render. This one flag is the difference
 * between a reactive local database and a snapshot.
 */
const sqlite = SQLite.openDatabaseSync(DATABASE_NAME, {
  enableChangeListener: true,
});

/**
 * Drizzle instance. Passing `schema` enables the relational query API and gives
 * every query result its inferred row type.
 */
export const db = drizzle(sqlite, { schema });

/** Raw handle — needed for PRAGMAs and migrations, which Drizzle does not model. */
export { sqlite };

export type Database = typeof db;
