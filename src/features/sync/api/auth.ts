import type { Session } from '@supabase/supabase-js';

import { attempt, err, ok, type Result } from '@/lib/result';

import { supabase } from './client';

/**
 * Authentication — email one-time code, and nothing else.
 *
 * **Why OTP rather than a password.** A password field means storing a
 * password, validating a password, resetting a password and getting all three
 * right; a six-digit code to an address the person already controls removes
 * that surface entirely. There is no password to leak because there is no
 * password. It also removes the "create an account" step — the first code sent
 * to a new address creates the account.
 *
 * **Why not OAuth (Google / GitHub).** Both need a redirect back into the app,
 * which needs a custom URL scheme, which needs a native dev build — and
 * ADR 0002 keeps this project inside Expo Go until Phase 6. A code typed into a
 * text field needs no redirect at all.
 *
 * SETUP REQUIRED ON THE SUPABASE PROJECT. Supabase's default "Magic Link"
 * email template sends `{{ .ConfirmationURL }}` — a link, which is useless
 * without a deep link back into the app. The template must be edited to include
 * `{{ .Token }}` so the mail carries the six digits this screen asks for.
 * See HANDOVER.md.
 */

/** The signed-in user, or null. Never throws — signed out is not an error. */
export async function currentSession(): Promise<Session | null> {
  if (supabase === null) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Send a code.
 *
 * `shouldCreateUser` is left at its default of true, so a first-time address
 * signs up and signs in through one path. This is a personal app with one
 * account; a separate registration flow would be ceremony with no purpose.
 */
export async function requestCode(email: string): Promise<Result<void>> {
  if (supabase === null) {
    return err('SYNC', 'Sync is not configured on this build.');
  }

  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return err('VALIDATION', 'That does not look like an email address.');
  }

  const client = supabase;
  return attempt('AUTH', 'Could not send the code. Check your connection.', async () => {
    const { error } = await client.auth.signInWithOtp({ email: address });
    if (error !== null) throw error;
  });
}

/**
 * Exchange the code for a session.
 *
 * `type: 'email'` covers both the sign-up and sign-in cases; Supabase decides
 * which based on whether the address already exists.
 */
export async function verifyCode(email: string, code: string): Promise<Result<Session>> {
  if (supabase === null) {
    return err('SYNC', 'Sync is not configured on this build.');
  }

  const digits = code.replace(/\D/g, '');
  if (digits.length !== 6) {
    return err('VALIDATION', 'The code is six digits.');
  }

  const client = supabase;
  const result = await attempt('AUTH', 'That code did not work.', async () => {
    const { data, error } = await client.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: digits,
      type: 'email',
    });
    if (error !== null) throw error;
    return data.session;
  });

  if (!result.ok) return result;
  if (result.value === null) return err('AUTH', 'That code did not work.');
  return ok(result.value);
}

/**
 * Sign out.
 *
 * **The local database is left completely untouched.** ADR 0004 says the app is
 * local-first and fully usable signed out, so signing out is the end of
 * *syncing*, not the end of the data — a sign-out that wiped the device would
 * make "your data is yours, on your phone" false.
 *
 * The account claim in `meta` survives too. That is what stops a later sign-in
 * as a different account from adopting this database and pushing one person's
 * rows into another person's account.
 */
export async function signOut(): Promise<Result<void>> {
  if (supabase === null) return ok(undefined);

  const client = supabase;
  return attempt('AUTH', 'Could not sign out.', async () => {
    const { error } = await client.auth.signOut();
    if (error !== null) throw error;
  });
}
