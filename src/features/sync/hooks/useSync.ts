import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { countPending, readCursors, runSync } from '../api';

/**
 * Sync status for the UI, plus the triggers that start a cycle.
 *
 * **Sync is never on the render path.** Nothing in this hook blocks a screen:
 * the app reads SQLite, and this reports on a background activity that happens
 * to be keeping SQLite company. That is the whole of ADR 0004 in one sentence,
 * and it is why the app stays usable with the radio off.
 */

export type SyncStatus = 'idle' | 'syncing' | 'error';

export type SyncState = {
  readonly status: SyncStatus;
  readonly lastSyncedAt: number | null;
  /** Local rows not yet known to be on the server. */
  readonly pending: number;
  readonly error: string | null;
  readonly sync: () => void;
  readonly refresh: () => void;
};

/**
 * Don't re-sync on every foreground.
 *
 * Android delivers an `active` state for anything that briefly covers the app —
 * a notification shade, a permission dialog, switching apps to copy a figure
 * and switching back. Without a floor, a minute of that is a dozen sync cycles
 * for no new data.
 */
const MIN_AUTO_INTERVAL_MS = 60_000;

export function useSync(enabled: boolean): SyncState {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const lastAttemptAt = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    void (async () => {
      const cursors = await readCursors();
      if (!cursors.ok || !mounted.current) return;

      setLastSyncedAt(cursors.value.lastSyncedAt);

      const count = await countPending(cursors.value.lastPushedAt);
      if (count.ok && mounted.current) setPending(count.value);
    })();
  }, []);

  const sync = useCallback(() => {
    if (!enabled) return;

    lastAttemptAt.current = Date.now();
    setStatus('syncing');
    setError(null);

    void (async () => {
      const result = await runSync();
      if (!mounted.current) return;

      if (result.ok) {
        setStatus('idle');
        setLastSyncedAt(result.value.at);
      } else {
        setStatus('error');
        setError(result.error.message);
      }

      refresh();
    })();
  }, [enabled, refresh]);

  // Initial state, and a sync as soon as there is an account to sync with.
  useEffect(() => {
    refresh();
    if (enabled) sync();
    // `sync` and `refresh` are stable for a given `enabled`; re-running this on
    // every render would sync in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Foreground. This stands in for a network-reachability listener, which would
  // need a native module the Expo Go build does not have (ADR 0002) — in
  // practice a phone that has regained signal is nearly always a phone the user
  // has just picked up.
  useEffect(() => {
    if (!enabled) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (Date.now() - lastAttemptAt.current < MIN_AUTO_INTERVAL_MS) return;
      sync();
    });

    return () => subscription.remove();
  }, [enabled, sync]);

  return { status, lastSyncedAt, pending, error, sync, refresh };
}
