import { useEffect, useState } from 'react';

import type { AppError } from '@/lib/result';

import { sqlite } from './client';
import { runMigrations, type MigrationReport } from './migrator';

export type BootstrapState =
  | { status: 'pending' }
  | { status: 'ready'; report: MigrationReport }
  | { status: 'failed'; error: AppError };

/**
 * Prepares the local database before the app renders.
 *
 * Migrations must complete before any screen issues a query, otherwise the
 * first render races the schema into existence and fails with "no such table".
 * Gating the whole tree on this is the simplest correct answer: it runs once,
 * takes a few milliseconds on an existing database, and happens while the
 * splash screen is still up, so the user never sees a loading state.
 */
export function useDatabaseBootstrap(): BootstrapState {
  const [state, setState] = useState<BootstrapState>({ status: 'pending' });

  useEffect(() => {
    let cancelled = false;

    void runMigrations(sqlite).then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: 'ready', report: result.value }
          : { status: 'failed', error: result.error },
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
