import type { SQLiteDatabase } from 'expo-sqlite';

import { attempt, type Result } from '@/lib/result';

import { migrations, TARGET_SCHEMA_VERSION } from './migrations';

/**
 * Migration runner.
 *
 * Reads the device's current schema version from `PRAGMA user_version`, applies
 * every migration above it in order, and stamps the new version — each
 * migration and its version bump inside one transaction, so a crash halfway
 * through leaves the database at the previous version rather than in a partial
 * state that no migration knows how to repair.
 *
 * Deliberately not using `drizzle-kit`'s bundled migrator: see
 * docs/decisions/0005-drizzle-with-hand-written-migrations.md.
 */

/** PRAGMAs that must be set on every connection, before any migration runs. */
async function configureConnection(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    -- Write-Ahead Logging. Readers no longer block on the writer, so the UI can
    -- keep querying while a save commits. Materially smoother on a list screen
    -- that re-renders on every write.
    PRAGMA journal_mode = WAL;

    -- With WAL, NORMAL means fsync at checkpoints rather than on every commit.
    -- Trades a theoretical loss of the last transaction on an OS-level crash
    -- (not an app crash) for a large write-throughput win.
    PRAGMA synchronous = NORMAL;

    -- SQLite ships with foreign keys OFF for backwards compatibility. Without
    -- this line every REFERENCES clause in the schema is decorative.
    PRAGMA foreign_keys = ON;

    -- Wait rather than fail if another connection holds a write lock.
    PRAGMA busy_timeout = 5000;
  `);
}

async function readSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  return row?.user_version ?? 0;
}

export type MigrationReport = {
  readonly from: number;
  readonly to: number;
  readonly applied: readonly string[];
};

export async function runMigrations(
  db: SQLiteDatabase,
): Promise<Result<MigrationReport>> {
  return attempt('DB_MIGRATION', 'Could not prepare the local database', async () => {
    await configureConnection(db);

    const from = await readSchemaVersion(db);
    const applied: string[] = [];

    if (from >= TARGET_SCHEMA_VERSION) {
      return { from, to: from, applied };
    }

    const pending = migrations
      .filter((m) => m.version > from)
      .sort((a, b) => a.version - b.version);

    for (const migration of pending) {
      // Exclusive so no other connection can observe a half-migrated schema.
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const statement of migration.statements) {
          await tx.execAsync(statement);
        }
        // Safe to interpolate: `version` is an integer literal from our own
        // source, and PRAGMA does not accept bound parameters.
        await tx.execAsync(`PRAGMA user_version = ${migration.version};`);
      });

      applied.push(`${migration.version}_${migration.name}`);
      if (__DEV__) {
        console.log(`[db] applied migration ${migration.version}: ${migration.name}`);
      }
    }

    return { from, to: TARGET_SCHEMA_VERSION, applied };
  });
}
