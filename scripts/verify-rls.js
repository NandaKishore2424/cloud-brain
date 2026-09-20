/* eslint-disable no-console */
/**
 * Row Level Security verification.
 *
 * The app ships an anon key inside the APK where anyone can extract it. That is
 * safe only because RLS restricts what the key can do. This script proves it
 * does, by running the real migrations against real Postgres (PGlite — Postgres
 * compiled to WebAssembly) and then attempting the attacks that matter.
 *
 * WHY STRUCTURAL CHECKS ARE NOT ENOUGH. "Is RLS enabled?" passes against a
 * policy of `using (true)`, which protects nothing. Every assertion below is
 * behavioural: sign in as one user, try to reach another user's data, and
 * require that it fails.
 *
 * The Supabase-specific pieces — the `auth` schema, `auth.uid()`, and the
 * `anon` / `authenticated` roles — are stubbed here the way Supabase implements
 * them: `auth.uid()` reads the JWT subject out of a session setting.
 *
 * Run with:  npm run verify:rls
 */
const fs = require('node:fs');
const path = require('node:path');

const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

const SYNCED_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'todos',
  'notes',
  'applications',
  'application_events',
];

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

let failures = 0;

function check(ok, label) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
}

/** Run a block as an authenticated user, exactly as PostgREST would. */
async function asUser(db, userId, work) {
  await db.exec(`
    set role authenticated;
    select set_config('request.jwt.claim.sub', '${userId}', false);
  `);
  try {
    return await work();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Expect a statement to be rejected outright (policy violation). */
async function expectRejected(db, label, sql) {
  try {
    await db.exec(sql);
    check(false, `${label} — was ACCEPTED but must be rejected`);
  } catch {
    check(true, label);
  }
}

async function main() {
  const db = await new PGlite();

  // --- Supabase environment stub ------------------------------------------
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;

    create schema auth;
    create table auth.users (id uuid primary key);

    -- How Supabase resolves the current user: the JWT 'sub' claim, which
    -- PostgREST puts into a session setting before running the query.
    create function auth.uid() returns uuid
      language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

    grant usage on schema public to anon, authenticated;
    grant usage on schema auth to anon, authenticated;
  `);

  // --- The real migrations -------------------------------------------------
  console.log('\nApplying migrations');
  for (const file of fs.readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith('.sql')) continue;
    try {
      await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
      check(true, file);
    } catch (error) {
      check(false, `${file}: ${error.message}`);
      process.exit(1);
    }
  }

  // --- Structure -----------------------------------------------------------
  console.log('\nStructure');
  const structure = await db.query(
    `select c.relname,
            c.relrowsecurity       as enabled,
            c.relforcerowsecurity  as forced,
            count(p.polname)::int  as policies
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     left join pg_policy p on p.polrelid = c.oid
     where n.nspname = 'public' and c.relkind = 'r'
     group by c.relname, c.relrowsecurity, c.relforcerowsecurity
     order by c.relname`,
  );

  const byName = new Map(structure.rows.map((r) => [r.relname, r]));
  for (const table of SYNCED_TABLES) {
    const row = byName.get(table);
    check(
      row !== undefined && row.enabled && row.forced && row.policies === 4,
      `${table}: RLS enabled + forced, 4 policies`,
    );
  }
  check(
    structure.rows.every((r) => r.enabled),
    'no public table was left without RLS',
  );

  // --- Seed as superuser (bypasses RLS, which is the point) ---------------
  await db.exec(`
    insert into auth.users (id) values ('${ALICE}'), ('${BOB}');

    insert into public.accounts (id, user_id, name, kind, created_at, updated_at) values
      ('aaaaaaaa-0000-4000-8000-000000000001', '${ALICE}', 'Alice cash', 'cash', 1, 1),
      ('bbbbbbbb-0000-4000-8000-000000000001', '${BOB}',   'Bob cash',   'cash', 1, 1);

    insert into public.transactions
      (id, user_id, account_id, amount, type, occurred_on, created_at, updated_at) values
      ('aaaaaaaa-0000-4000-8000-000000000002', '${ALICE}',
       'aaaaaaaa-0000-4000-8000-000000000001', 500000, 'expense', '2026-09-20', 1, 1),
      ('bbbbbbbb-0000-4000-8000-000000000002', '${BOB}',
       'bbbbbbbb-0000-4000-8000-000000000001', 900000, 'expense', '2026-09-20', 1, 1);
  `);

  // --- Isolation: the assertion that actually matters ---------------------
  console.log('\nIsolation');

  await asUser(db, ALICE, async () => {
    const accounts = await db.query('select id, name from public.accounts');
    check(accounts.rows.length === 1, 'Alice sees exactly one account');
    check(accounts.rows[0]?.name === 'Alice cash', "Alice sees only her own account");

    const txs = await db.query('select id, amount from public.transactions');
    check(txs.rows.length === 1, 'Alice sees exactly one transaction');
    check(Number(txs.rows[0]?.amount) === 500000, "Alice sees only her own amount");

    // RLS filters rather than errors, so a targeted read of someone else's row
    // returns zero rows. That distinction matters: a test expecting an error
    // would pass for the wrong reason.
    const targeted = await db.query(
      `select id from public.transactions
       where id = 'bbbbbbbb-0000-4000-8000-000000000002'`,
    );
    check(targeted.rows.length === 0, "Alice cannot read Bob's row even by id");
  });

  await asUser(db, BOB, async () => {
    const accounts = await db.query('select name from public.accounts');
    check(
      accounts.rows.length === 1 && accounts.rows[0]?.name === 'Bob cash',
      'Bob sees only his own account',
    );
  });

  // --- Write-path attacks --------------------------------------------------
  console.log('\nWrite attacks');

  await asUser(db, ALICE, async () => {
    await expectRejected(
      db,
      "Alice cannot insert a row owned by Bob",
      `insert into public.accounts (id, user_id, name, kind, created_at, updated_at)
       values ('cccccccc-0000-4000-8000-000000000001', '${BOB}', 'stolen', 'cash', 1, 1)`,
    );

    // The `with check` clause on UPDATE exists for exactly this. Without it,
    // Alice could hand one of her own rows to Bob — writing into his account.
    await expectRejected(
      db,
      "Alice cannot reassign her own row to Bob (update with check)",
      `update public.accounts set user_id = '${BOB}'
       where id = 'aaaaaaaa-0000-4000-8000-000000000001'`,
    );

    const updated = await db.query(
      `update public.accounts set name = 'hacked'
       where id = 'bbbbbbbb-0000-4000-8000-000000000001' returning id`,
    );
    check(updated.rows.length === 0, "Alice's update of Bob's row affects zero rows");

    const deleted = await db.query(
      `delete from public.transactions
       where id = 'bbbbbbbb-0000-4000-8000-000000000002' returning id`,
    );
    check(deleted.rows.length === 0, "Alice's delete of Bob's row affects zero rows");
  });

  // --- The unauthenticated key --------------------------------------------
  console.log('\nAnonymous access');

  await db.exec('set role anon;');
  for (const table of ['accounts', 'transactions', 'notes']) {
    await expectRejected(
      db,
      `anon cannot read ${table}`,
      `select * from public.${table}`,
    );
  }
  await db.exec('reset role;');

  // --- Last-write-wins upsert ---------------------------------------------
  //
  // The conditional upsert in 0003 is what makes "last write wins" true rather
  // than "last push wins". These assert the behaviour directly: a stale push
  // must be a no-op, a newer push must win, and neither may cross a user
  // boundary.
  console.log('\nLast-write-wins upsert');

  const noteOf = async (id) =>
    (await db.query('select title, updated_at from public.notes where id = $1', [id]))
      .rows[0];

  const NOTE_ID = 'aaaaaaaa-0000-4000-8000-00000000000a';

  await db.exec(`
    insert into public.notes (id, user_id, title, body, created_at, updated_at)
    values ('${NOTE_ID}', '${ALICE}', 'original', '', 1, 100);
  `);

  await asUser(db, ALICE, async () => {
    // Stale: updated_at 50 < the stored 100.
    await db.query('select public.sync_upsert_notes($1::jsonb)', [
      JSON.stringify([
        { id: NOTE_ID, user_id: ALICE, title: 'stale', body: '',
          tags: [], created_at: 1, updated_at: 50 },
      ]),
    ]);
    check((await noteOf(NOTE_ID)).title === 'original', 'a stale push is a no-op');

    // Newer: updated_at 200 > 100.
    await db.query('select public.sync_upsert_notes($1::jsonb)', [
      JSON.stringify([
        { id: NOTE_ID, user_id: ALICE, title: 'newer', body: '',
          tags: [], created_at: 1, updated_at: 200 },
      ]),
    ]);
    check((await noteOf(NOTE_ID)).title === 'newer', 'a newer push wins');

    // Equal timestamps must not flip the row — otherwise re-pushing an
    // unchanged row would churn it on every sync.
    await db.query('select public.sync_upsert_notes($1::jsonb)', [
      JSON.stringify([
        { id: NOTE_ID, user_id: ALICE, title: 'equal', body: '',
          tags: [], created_at: 1, updated_at: 200 },
      ]),
    ]);
    check((await noteOf(NOTE_ID)).title === 'newer', 'an equal-timestamp push is a no-op');

    // A brand new row still inserts.
    await db.query('select public.sync_upsert_notes($1::jsonb)', [
      JSON.stringify([
        { id: 'aaaaaaaa-0000-4000-8000-00000000000b', user_id: ALICE,
          title: 'fresh', body: '', tags: [], created_at: 1, updated_at: 10 },
      ]),
    ]);
    check(
      (await noteOf('aaaaaaaa-0000-4000-8000-00000000000b'))?.title === 'fresh',
      'a new row inserts through the same path',
    );
  });

  // The function is security invoker, so RLS still applies inside it. If this
  // ever fails, the function has been made security definer and every policy
  // in 0002 is bypassed.
  await asUser(db, BOB, async () => {
    await expectRejected(
      db,
      'the upsert function cannot write across users (still security invoker)',
      `select public.sync_upsert_notes('${JSON.stringify([
        { id: 'cccccccc-0000-4000-8000-00000000000c', user_id: ALICE,
          title: 'stolen', body: '', tags: [], created_at: 1, updated_at: 999 },
      ])}'::jsonb)`,
    );
    check(
      (await db.query('select id from public.notes')).rows.length === 0,
      'Bob still sees none of the notes',
    );
  });

  console.log(
    failures === 0
      ? '\n  RLS verified: isolation holds on read, write, update and delete.\n'
      : `\n  ${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
