import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '../api/client';

export type AuthState = {
  readonly session: Session | null;
  /** True until the stored session has been read back from SecureStore. */
  readonly isRestoring: boolean;
};

/**
 * The current session, kept in step with Supabase's own auth state.
 *
 * `onAuthStateChange` rather than a one-off read: the session can change
 * without this screen doing anything — a token refresh on foreground, an
 * expiry, a sign-out. Polling would be the alternative, and would be wrong
 * between polls.
 *
 * `isRestoring` exists to avoid a flash of the signed-out screen on launch.
 * Reading the session means reading SecureStore, which is asynchronous, so for
 * one or two frames a returning user genuinely looks signed out. Rendering the
 * sign-in form in that gap and then yanking it away is worse than waiting.
 */
export function useAuthSession(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    if (supabase === null) {
      setIsRestoring(false);
      return;
    }

    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsRestoring(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setIsRestoring(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, isRestoring };
}
