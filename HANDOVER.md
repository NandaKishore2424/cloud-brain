# HANDOVER

> Living state file. **Read after `CLAUDE.md`, before touching code.**
> Every session updates this before it ends.

**Last updated:** 2026-09-21
**Current phase:** none — **all six features built.** Next is on-device testing.
**Status:** 🟢 Verified offline. Not yet exercised on a phone by anyone.

---

## Where things stand

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation | ✅ |
| 1 | Money | ✅ |
| 2 | Todos | ✅ |
| 3 | Notes | ✅ |
| 4 | Supabase sync | ✅ built · **switched off by choice** (below) |
| 5 | Job applications | ✅ |
| 6 | **Work log + AI weekly summaries** | ✅ ADR 0014 |
| 7 | Home dashboard | ✅ |
| 8 | Usability, colour system, hardening | ✅ |

`npm run verify` passes: typecheck · layering + live-query deps · contrast
(40 pairs) · **207 tests** · schema (4 migrations) · RLS (incl. work_logs).
`npm run check:remote` passes against the live project, `work_logs` included.

## Next: test on the phone, in Expo Go

**Port 8081 is taken on the development machine** by an unrelated local service
(a Java app answering with JSON errors). `npx expo start` will offer another
port; accept it, or pass one explicitly:

```bash
npx expo start --port 8095
```

**Highest-value checks**, in order — the first four were broken until
2026-09-21 and are fixed but not yet seen working on a device:

1. Money → previous month: the list and totals change
2. Notes → search: the list filters as you type
3. Add expense → switch to Income: the categories switch too
4. Add expense → pick a category you have used before: amount suggestions appear
5. Home → **Work** → dictate with the keyboard mic → Save → Summarise with AI
6. First launch creates the database cleanly (the path that crashed in Phase 0)

Then the APK — see "Next step — the APK" below.

---

## Phase 6 — what exists

```
src/features/worklog/
  summary.ts         pure: groupByDay, toRows, normaliseBody, share text, AI prompt
  summary.test.ts    16 assertions
  api/worklog.ts     workLogForWeek (query), create / update / softDelete / restore
  hooks/useWorkLog   week navigation (an anchor day; the range is derived)
  components/        WorkLogScreen
app/worklog.tsx      route; ?compose=1 focuses the field
```

- Local migration **4** (`work_logs`), Postgres **0005** — applied to the live
  project and verified, and registered in `SYNC_TABLES`, so switching sync on
  needs no server work.
- `src/lib/date.ts` gained `weekBounds`, `shiftWeek`, `formatWeekLabel`,
  `formatWeekday` (Monday-first; tested across month and year boundaries and
  the Sunday edge that `getDay()` gets wrong).
- **Voice = the keyboard's mic. AI = a share-sheet hand-off.** Not a stopgap —
  read ADR 0014 before "upgrading" either.

**Deliberately deferred:** a nightly reminder (`expo-notifications`), and an
in-app summary via an Edge Function — only reasonable once sync is on, because
an Edge Function callable with the public key is callable by anyone.

## The live-query bug (fixed 2026-09-21, commit 86c6c22)

Drizzle's `useLiveQuery(query, deps = [])` subscribes once when `deps` is
omitted, and no call site passed it — so month navigation, notes search, the
income/expense category switch and suggested amounts were all frozen on their
first result. Every call site now passes deps, and `check:layering` refuses a
call without them. Found by reading the library while building Phase 6, not by
a test: none of the 180 tests rendered a screen (ADR 0008).

---

## ⚠️ Sync is deliberately switched off

**Decision by the author, 2026-09-20: do not turn sync on, and do not prompt to.**

It is built, tested and committed. It is simply not enabled, because enabling it
requires a custom SMTP sender before the first sign-in can happen at all (see
`docs/email-setup.md`), and that is setup effort this project does not currently
want. The app is fully usable signed out — that was the design rule from the
start (ADR 0004), and this is that rule being cashed in.

**What this means in practice:**

- Do not register the `EXPO_PUBLIC_SUPABASE_*` variables with EAS. Without
  them the built app reports "Not configured in this build" on the sync screen
  and behaves normally everywhere else.
- **There is no backup.** Losing the phone, reinstalling, or clearing app data
  loses everything. This is understood and accepted.
- Nothing needs rebuilding to change this later: configure SMTP, add the two
  EAS variables, rebuild. No server work remains — all four migrations are
  applied and verified.

A future session must not treat this as an unfinished task to helpfully
complete.

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
| **Nothing tested on hardware yet** | **high** | See "Next: test on the phone" above. |
| Local DB unencrypted | **medium** | See gates. |
| No crash reporting | **medium** | See gates. |
| No network-reachability trigger | low | Foreground + manual only; needs a native module (ADR 0002). |
| Global rather than per-table cursors | low | One failing table replays all seven. Deliberate — ADR 0012, decision 4. |
| `deletedAt` rows never purged | low | Needs a way to confirm a tombstone reached all replicas. |
| Icons are Expo defaults | low | Cosmetic. |
| **No browser preview** | low | Tried 2026-09-21 and abandoned. Needs `react-native-web`, a proxy adding COOP/COEP to the HTML document, and a web-only entry warming the SQLite worker (sync calls spin ~100ms and always time out cold). Even then it fails on `withExclusiveTransactionAsync is not supported on web` (the migration runner) and SecureStore having no web build. Making it work means changing migration code for a platform the app never ships to. Test on the phone. |

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
- **Voice via the keyboard's mic; AI via a share-sheet hand-off** (ADR 0014)
- **`useLiveQuery` always gets a dependency list** — `check:layering` enforces it.
- **A shipped migration is frozen.** Append; never edit.
- **Dependencies point one way** — `npm run check:layering`.
- **All SQL lives in a feature's `api/`.** Components never import `db`.
- **No state management library.** SQLite is the store.
