import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

/**
 * The Supabase client, or `null` when sync is not configured.
 *
 * **Returning null rather than throwing is the important decision here.** ADR
 * 0004 says the app is local-first and must be fully usable signed out — so a
 * missing or malformed `.env` makes sync unavailable, not the app. Someone who
 * clones this repo and runs it with no Supabase project gets a working app,
 * which is also what makes the local-first claim true rather than aspirational.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Configured means both values are present AND not the placeholders from
 * `.env.example`. Copying the template without filling it in is the most
 * likely misconfiguration, and it would otherwise fail later with a confusing
 * network error instead of a clear "not configured".
 */
export const isSyncConfigured: boolean =
  typeof url === 'string' &&
  url.startsWith('https://') &&
  !url.includes('YOUR-PROJECT-REF') &&
  typeof anonKey === 'string' &&
  anonKey.length > 20 &&
  !anonKey.startsWith('paste-your');

/* ------------------------------------------------------------------ */
/* Session storage                                                     */
/* ------------------------------------------------------------------ */

/**
 * Android SecureStore rejects values much beyond 2KB, and a Supabase session —
 * access token, refresh token, user object — regularly exceeds that. Values are
 * therefore split across numbered keys, with a count stored alongside.
 *
 * Kept well under the limit: the ceiling is approximate and platform-dependent,
 * and silently failing to persist a session is a bug that looks like "it keeps
 * logging me out".
 */
const CHUNK_SIZE = 1500;

/**
 * Auth tokens go in SecureStore, not AsyncStorage.
 *
 * AsyncStorage on Android is an unencrypted SQLite file inside the app
 * sandbox — readable on a rooted or compromised device. SecureStore is backed
 * by the Android Keystore. A refresh token grants access to everything the
 * account owns, so it is the one value in this app that genuinely warrants it.
 *
 * (The application database is still unencrypted. That is tracked as a hard
 * gate before any public release — see HANDOVER.md.)
 */
const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (count === null) return null;

    const parts: string[] = [];
    for (let index = 0; index < Number(count); index += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${index}`);
      // A missing chunk means the stored value is torn — perhaps a write was
      // interrupted. Returning null makes the user sign in again, which is
      // recoverable; returning a truncated token is not.
      if (part === null) return null;
      parts.push(part);
    }

    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await secureStorage.removeItem(key);

    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }

    // Chunks first, count last. If this is interrupted, the count is either
    // absent (treated as no session) or correct — never pointing at chunks
    // that were not written.
    for (const [index, chunk] of chunks.entries()) {
      await SecureStore.setItemAsync(`${key}.${index}`, chunk);
    }
    await SecureStore.setItemAsync(`${key}.n`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const count = await SecureStore.getItemAsync(`${key}.n`);
    if (count === null) return;

    // Count first, so an interrupted delete leaves orphaned chunks rather than
    // a count pointing at chunks that are gone.
    await SecureStore.deleteItemAsync(`${key}.n`);
    for (let index = 0; index < Number(count); index += 1) {
      await SecureStore.deleteItemAsync(`${key}.${index}`);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Client                                                              */
/* ------------------------------------------------------------------ */

export const supabase: SupabaseClient | null = isSyncConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        storage: secureStorage,
        // Keep the user signed in across launches. The refresh token is the
        // reason the storage above is SecureStore.
        persistSession: true,
        autoRefreshToken: true,
        // There is no browser and no redirect URL to parse. Leaving this on
        // makes the client look for an OAuth fragment that can never exist.
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * Token refresh has to follow the app's lifecycle.
 *
 * Supabase's auto-refresh runs on a timer. On a phone the process is frozen in
 * the background, so that timer does not fire — and on resume the client would
 * otherwise keep using an access token that expired while the screen was off,
 * producing a burst of 401s at exactly the moment the user returns. Refresh is
 * therefore stopped on background and restarted on foreground.
 */
if (supabase !== null) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

/** Narrowing helper, so call sites do not repeat the null check. */
export function requireSupabase(): SupabaseClient {
  if (supabase === null) {
    throw new Error('Supabase is not configured — check .env');
  }
  return supabase;
}
