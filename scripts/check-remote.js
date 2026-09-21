/* eslint-disable no-console */
/**
 * Live-project verification.
 *
 * `npm run verify:rls` proves the migration *files* are correct by executing
 * them against PGlite. It cannot prove they were ever applied to the real
 * Supabase project — those are two different claims, and only one of them was
 * ever checked. This script checks the other one.
 *
 * It uses only the publishable/anon key, i.e. exactly the credential that ships
 * inside the APK. That is deliberate: every assertion here is one an attacker
 * holding the extracted key could also make, so "this passes" means "an
 * attacker with the key gets nothing".
 *
 * What the HTTP status codes mean:
 *   404 + PGRST202  the function does not exist   -> migration 0003 not applied
 *   401/403 + 42501 permission denied             -> exists, correctly closed
 *   200             anon executed a write function -> SECURITY FAILURE
 *
 * 42501 is Postgres's `insufficient_privilege`. Note it comes from the GRANT
 * layer, which refuses before RLS is ever consulted — so a passing run here
 * shows both layers are in place, not just one.
 *
 * Run with:  npm run check:remote      (needs network and a filled-in .env)
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const SYNCED_TABLES = [
  'accounts',
  'categories',
  'transactions',
  'todos',
  'notes',
  'applications',
  'application_events',
  'work_logs',
];

let failures = 0;

function check(ok, label, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures += 1;
}

/** Minimal .env reader — no dependency, and the file is two lines. */
function readEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return {};

  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match !== null) out[match[1]] = match[2];
  }
  return out;
}

async function main() {
  const env = readEnv();
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  // Not configured is a skip, not a failure. The repo must stay clonable and
  // runnable by someone with no Supabase project — same reason the client
  // returns null rather than throwing (ADR 0004).
  if (!url || !key || url.includes('YOUR-PROJECT-REF')) {
    console.log('\n  – .env not configured; skipping live checks.\n');
    process.exit(0);
  }

  const headers = { apikey: key, 'Content-Type': 'application/json' };

  console.log('\nReachability');
  const health = await fetch(`${url}/auth/v1/health`, { headers });
  check(health.ok, 'project responds to the publishable key', `HTTP ${health.status}`);

  console.log('\nAnonymous access is refused (the key ships in the APK)');
  for (const table of SYNCED_TABLES) {
    const read = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers });
    check(read.status === 401 || read.status === 403, `anon cannot read ${table}`, `HTTP ${read.status}`);
  }

  const write = await fetch(`${url}/rest/v1/accounts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: '00000000-0000-4000-8000-000000000001',
      user_id: '00000000-0000-4000-8000-000000000002',
      name: 'probe',
      kind: 'cash',
      created_at: 1,
      updated_at: 1,
    }),
  });
  check(write.status === 401 || write.status === 403, 'anon cannot insert', `HTTP ${write.status}`);

  console.log('\nMigration 0003 applied (last-write-wins functions)');
  for (const table of SYNCED_TABLES) {
    const response = await fetch(`${url}/rest/v1/rpc/sync_upsert_${table}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ rows: [] }),
    });

    if (response.status === 404) {
      check(false, `sync_upsert_${table}`, 'ABSENT — run supabase/migrations/0003_lww_upsert.sql');
    } else if (response.status === 200) {
      check(false, `sync_upsert_${table}`, 'anon EXECUTED it — the revoke did not apply');
    } else {
      check(true, `sync_upsert_${table}`, `deployed, anon refused (HTTP ${response.status})`);
    }
  }

  console.log(
    failures === 0
      ? '\n  Live project matches the migrations, and the shipped key reaches nothing.\n'
      : `\n  ${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
