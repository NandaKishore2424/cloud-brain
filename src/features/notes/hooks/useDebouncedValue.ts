import { useEffect, useState } from 'react';

/**
 * Trails `value` by `delayMs`, settling only once input stops.
 *
 * Search runs a full table scan (ADR 0010). Running it per keystroke would mean
 * eight scans to type "incident" — seven of which are thrown away before the
 * user sees them. Debouncing means one.
 *
 * It also keeps the typed text and the executed query as separate pieces of
 * state: the input stays perfectly responsive because it is not waiting on the
 * query at all.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    // Clearing on every change is what makes this a debounce rather than a
    // throttle — a pending timer is cancelled and restarted on each keystroke.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
