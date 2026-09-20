/**
 * Result — explicit success/failure without exceptions.
 *
 * Why: a thrown error is invisible in a function's type. `listTransactions()`
 * returning `Promise<Transaction[]>` tells a caller nothing about the fact that
 * SQLite can fail. `Promise<Result<Transaction[]>>` forces the caller to decide
 * what happens when it does.
 *
 * Convention: everything in a feature's `api/` folder returns Result and never
 * throws. UI code reads `.ok` and renders accordingly. Programmer errors (a bug,
 * a violated invariant) may still throw — Result is for *expected* failure.
 */

export type ErrorCode =
  | 'DB_READ'
  | 'DB_WRITE'
  | 'DB_MIGRATION'
  | 'NOT_FOUND'
  | 'VALIDATION'
  // Phase 4. Kept distinct from one another because the UI reacts to each
  // differently: NETWORK is worth retrying silently, AUTH needs the user to
  // sign in again, and SYNC means the request reached the server and the
  // server refused it — which is a bug to surface, not a blip to hide.
  | 'NETWORK'
  | 'AUTH'
  | 'SYNC'
  | 'UNKNOWN';

export type AppError = {
  readonly code: ErrorCode;
  /** Safe to show a user. No stack traces, no SQL. */
  readonly message: string;
  readonly cause?: unknown;
};

export type Result<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: AppError }>;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(
  code: ErrorCode,
  message: string,
  cause?: unknown,
): Result<T> {
  return { ok: false, error: { code, message, cause } };
}

/**
 * Wrap a throwing async call into a Result. This is the boundary where
 * exception-based APIs (SQLite, fetch) become Result-based.
 */
export async function attempt<T>(
  code: ErrorCode,
  message: string,
  fn: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (cause) {
    if (__DEV__) console.error(`[${code}] ${message}`, cause);
    return err(code, message, cause);
  }
}

/** Synchronous sibling of `attempt`. */
export function attemptSync<T>(
  code: ErrorCode,
  message: string,
  fn: () => T,
): Result<T> {
  try {
    return ok(fn());
  } catch (cause) {
    if (__DEV__) console.error(`[${code}] ${message}`, cause);
    return err(code, message, cause);
  }
}

export function unwrapOr<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/** Narrowing helper for `.filter()` over an array of Results. */
export function isOk<T>(r: Result<T>): r is Readonly<{ ok: true; value: T }> {
  return r.ok;
}
