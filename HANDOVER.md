# HANDOVER

> Living state file. **Read after `CLAUDE.md`, before touching code.**
> Every session updates this before it ends.

**Last updated:** 2026-09-20
**Current phase:** Phase 4 — Supabase sync · **BUILT, NOT YET RUN ON A DEVICE**
**Status:** 🟡 Code complete and verified offline. Two setup steps and one
on-device test stand between this and Done.

---

## Where things stand

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation | ✅ |
| 1 | Money | ✅ |
| 2 | Todos | ✅ |
| 3 | Notes | ✅ |
| 4 | **Supabase sync** | 🟡 **built — needs the two steps below** |
| 5 | Job applications | ✅ |
| 6 | Voice work-log + AI summaries | ⛔ needs a dev build + AI key |
| 7 | Home dashboard | ✅ |
| 8 | Usability, colour system, hardening | ✅ |

`npm run verify` passes: typecheck · layering · contrast (38 pairs) ·
**180 tests** · schema · RLS (30 checks).
`npm run check:remote` passes: **16 checks against the live project**.
`npm run verify:rls` now also asserts every sync function has a pinned
`search_path`, so a later migration cannot silently drop it.

---

## ⚠️ Do these two things before testing sync on the phone

**1. Custom SMTP, then the email template.** See **`docs/email-setup.md`** for
the full walkthrough.

Short version: the default template sends a *link*, which Expo Go cannot
receive. Changing it to send `{{ .Token }}` requires custom SMTP — the dashboard
disables the subject and body fields until one is configured (*"Set up custom
SMTP to edit templates"*). Supabase's built-in mailer also only delivers to
project team members' own addresses.

So sign-in does not work at all until an SMTP sender is configured. This was
originally filed as a pre-Play-Store gate; it is actually a prerequisite for the
first sign-in.

Without it, the mail arrives and the app asks for six digits that are not in it.
Nothing in the code can detect or report this — hence this note.

**2. Restart Metro after `.env` changed.**

`EXPO_PUBLIC_*` values are inlined into the bundle at build time, not read at
runtime. A running dev server holds the old (absent) values, so sync will report
"not configured" until Metro is restarted:

```bash
npx expo start -c
```

**Free-tier mail is rate-limited** to a couple of messages an hour. Budget the
test attempts accordingly.

---

## Phase 4 — what exists

### Server (applied to the live project and verified)

| File | What |
|------|------|
| `supabase/migrations/0001_initial_schema.sql` | 7 tables + `user_id`; timestamps as `bigint`; **no FKs between synced tables** |
| `supabase/migrations/0002_rls_policies.sql` | RLS enabled **and forced**, 4 policies each, `authenticated` only |
| `supabase/migrations/0003_lww_upsert.sql` | `sync_upsert_<table>(rows jsonb)`, `security invoker`, conditional on `updated_at` |
| `supabase/migrations/0004_function_search_path.sql` | pins `search_path = ''` on all seven functions |

All four confirmed applied on 2026-09-20 — by `npm run check:remote` over HTTPS,
and independently through the Supabase MCP (every table: RLS enabled **and**
forced, 4 policies).

### Database linter — the one remaining warning is a false positive

`public.rls_auto_enable()` is flagged as a `SECURITY DEFINER` function callable
by `anon`. It is **not ours** — it is owned by `postgres` and wired to the
`ensure_rls` event trigger, a safety net that auto-enables RLS on any new table
in `public`.

It was checked rather than assumed: calling it over PostgREST as `anon` returns
`0A000 — cannot display a value of type event_trigger`. An event-trigger
function has no callable signature, so the endpoint cannot invoke it. Leave it
alone; it is defence in depth, and removing it would remove a protection.

The performance linter reports all seven `*_sync_idx` indexes as unused. Also
expected — no sync has run yet. **Recheck this after a month of real use**; if
they are still unused then, that is a genuine finding.

### Client

```
src/features/sync/
  plan.ts            pure: chunking, cursor advance, keyset paging, account guard
  plan.test.ts       23 assertions
  localUpsert.ts     the local conditional upsert, db passed in so it is testable
  localUpsert.test.ts 9 assertions against real SQLite (sql.js)
  tables.ts          row translation, derived from Drizzle column metadata
  api/
    client.ts        Supabase client (null when unconfigured) + SecureStore adapter
    auth.ts          email OTP
    cursors.ts       sync cursors in the existing `meta` table
    push.ts          local -> remote
    pull.ts          remote -> local, keyset paginated
    engine.ts        runSync(): push, pull, record; single-flight
  hooks/             useAuthSession, useSync (foreground trigger, 60s floor)
  components/        SyncScreen
app/sync.tsx         route; reached from the cloud icon on Home
```

Design rationale: **ADR 0012** (sync) and **ADR 0013** (auth). Read those before
changing anything here — several of the choices look arbitrary and are not.

### What has NOT been exercised

Everything above is verified by execution *except* the round trip itself. No
row has yet travelled device → Postgres → device. The first on-device test
should be:

1. Open Home → cloud icon → sign in with the six-digit code.
2. Expect "Synced just now" and 0 pending.
3. Add an expense, reopen the sync screen: pending ≥ 1, then Sync now → 0.
4. Confirm the row in the Supabase table editor.
5. Uninstall and reinstall the app, sign in again, and confirm the data returns.

Step 5 is the one that matters — it is the actual promise being made.

---

## Next step — the APK  (config done, needs an Expo account)

`eas.json` and the npm scripts are committed. What remains needs the author's
own Expo login, so it could not be done from a session.

```bash
npm install -g eas-cli     # or npx eas-cli@latest below
eas login                  # free account
eas init                   # writes extra.eas.projectId into app.json — commit it

eas env:create --environment preview --type string \
  --name EXPO_PUBLIC_SUPABASE_URL --value https://abxzvpdvsalweypvhgbg.supabase.co
eas env:create --environment preview --type string \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <the publishable key from .env>

npm run build:apk          # 10-20 min including queue
```

Profiles: `preview` → APK (sideload, the one to use daily) · `development` →
APK with the dev client (unblocks Phase 6) · `production` → AAB (Play Store
only; an AAB cannot be sideloaded).

Full explanation, including why `appVersionSource` is `remote` and why the env
vars are not in `eas.json`, is in **`docs/building.md`**.

**The APK starts with an empty database** — separate sandbox from Expo Go. That
makes the first launch the real sync test: sign in, and the data should arrive.

## Hard gates before Play Store

| Gate | Why |
|------|-----|
| **Encryption at rest** | Other people's financial data on their phones. SQLCipher needs a dev build. |
| **Crash reporting** | `ErrorBoundary` logs to the dev console only; production failures are silent. |
| **Account deletion + data export** | India's DPDP Act 2023 applies once you process other people's personal data. |
| **A conflict strategy beyond last-write-wins** | It discards concurrent edits and trusts device clocks. Fine for one person. |
| **Free-tier capacity review** | 500MB Postgres is generous for one person, different across hundreds. |

---

## Known issues / debt

| Item | Severity | Note |
|------|----------|------|
| Sync round trip untested on hardware | **high** | See the checklist above. |
| Local DB unencrypted | **medium** | See gates. |
| No crash reporting | **medium** | See gates. |
| No network-reachability trigger | low | Foreground + manual only; needs a native module (ADR 0002). |
| Global rather than per-table cursors | low | One failing table replays all seven. Deliberate — ADR 0012, decision 4. |
| Five tabs, Phase 6 wants a sixth | medium | Voice log should be a Home action, not a tab. |
| `deletedAt` rows never purged | low | Needs a way to confirm a tombstone reached all replicas. |
| Icons are Expo defaults | low | Cosmetic. |

---

## Decisions a future session must not silently reverse

Reversing one means writing a new ADR that supersedes it.

- **No styling library** — tokens + `StyleSheet` (ADR 0003)
- **Drizzle for queries, hand-written migrations** (ADR 0005)
- **Local-first**; SQLite is the read path, Supabase is a sync target (ADR 0004).
  **The app must work fully signed out, and sync must never gate the UI.**
- **Expo Go compatibility** until Phase 6 (ADR 0002)
- **Money is integer paise**, positive, direction in `type` (ADR 0006)
- **Defaults-first entry** for fast captures — but not for notes (ADR 0007)
- **No component tests**; layered verification instead (ADR 0008)
- **Sparse ordering**; priority never sorts (ADR 0009)
- **LIKE search until ~2,000 notes** (ADR 0010)
- **Colour verified against WCAG in CI** (ADR 0011)
- **Cursors, not an outbox; conditional upsert on *both* ends** (ADR 0012)
- **Email OTP, tokens in SecureStore** (ADR 0013)
- **A shipped migration is frozen.** Append; never edit.
- **Dependencies point one way** — `npm run check:layering`.
- **All SQL lives in a feature's `api/`.** Components never import `db`.
- **No state management library.** SQLite is the store.
