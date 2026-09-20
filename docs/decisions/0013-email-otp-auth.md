# 0013 — Email one-time code for authentication

**Status:** Accepted · 2026-09-20
**Relates to:** [0002](0002-expo-go-constraint.md) (Expo Go), [0004](0004-local-first-sqlite.md) (local-first)

## Context

Phase 4 needs an account so rows can be owned and RLS can isolate them. The app
must remain fully usable signed out — that is ADR 0004 and it is not negotiable.

## Decision

Email one-time code (`signInWithOtp` / `verifyOtp`). One screen, reached from
Home, never shown on launch.

**Rejected: email and password.** A password means storing, validating and
resetting one, and getting all three right. A six-digit code to an address the
person already controls removes the surface entirely — there is no password to
leak because there is no password. It also removes the separate registration
step: the first code sent to a new address creates the account.

**Rejected: OAuth (Google / GitHub).** Both need a redirect back into the app,
which needs a custom URL scheme, which needs a native dev build — and ADR 0002
keeps this project inside Expo Go until Phase 6. A code typed into a text field
needs no redirect.

## Session storage

Tokens go in `expo-secure-store`, not AsyncStorage. AsyncStorage on Android is
an unencrypted SQLite file inside the app sandbox, readable on a rooted or
compromised device. SecureStore is backed by the Android Keystore. A refresh
token grants access to everything the account owns, so it is the one value in
this app that warrants it.

SecureStore rejects values much beyond ~2KB on Android and a Supabase session
regularly exceeds that, so the adapter chunks. The chunk count is written
**last** and deleted **first**, so an interrupted write is read as "no session"
rather than as a truncated token.

*(The application database itself is still unencrypted — a hard gate before any
public release, tracked in HANDOVER.md.)*

## Consequences

- **The project needs custom SMTP before it can be used at all.** This was
  discovered late and is worth recording precisely, because the chain is not
  obvious:

  1. Supabase's default Magic Link template sends `{{ .ConfirmationURL }}` — a
     link, useless without a deep link back into an Expo Go app.
  2. Getting a code instead means editing the template to include
     `{{ .Token }}`.
  3. **Editing auth email templates requires custom SMTP.** The dashboard
     disables the subject and body fields otherwise: *"Set up custom SMTP to
     edit templates."*

  So custom SMTP moved from a pre-launch gate to a prerequisite for the first
  sign-in. The built-in mailer additionally only delivers to addresses belonging
  to project team members, and is rate-limited to a handful of messages an hour;
  custom SMTP raises that to 30/hour.

  None of this is visible from the code, and the failure it produces is
  confusing rather than loud — the mail arrives and the app asks for six digits
  that are not in it. Hence `docs/email-setup.md`.
- **Signing out leaves the local database completely untouched.** Sign-out ends
  replication, not access to your own data. The account claim in `meta` survives
  it on purpose (see ADR 0012, decision 5).
