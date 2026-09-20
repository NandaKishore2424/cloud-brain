/* eslint-disable no-console */
/**
 * Schema verification — runs `src/db/migrations.ts` against a real SQLite
 * engine (sql.js, a WASM build) on the dev machine.
 *
 * Why this exists: `tsc` proves the migration SQL is a valid *string*, and
 * `expo export` proves the module *bundles*. Neither one executes the SQL. A
 * typo in a CREATE TABLE, a constraint that does not do what you think, or a
 * module-initialisation order bug all ship cleanly through both and then crash
 * on the device at first launch.
 *
 * This script caught exactly that during Phase 0: `buildCategorySeed()` was
 * called while the `migrations` array was being evaluated, but `SEED_CATEGORIES`
 * was declared below it and still in the temporal dead zone.
 *
 * Run with:  npm run verify:schema
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const ts = require('typescript');
const initSqlJs = require('sql.js');

/** Transpile and evaluate migrations.ts. It imports nothing, so this is safe. */
function loadMigrations() {
  const file = path.join(ROOT, 'src/db/migrations.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const mod = new Module('migrations');
  mod._compile(js, 'migrations.js');
  return mod.exports;
}

let failures = 0;

function check(ok, label) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures += 1;
}

async function main() {
  const { migrations, TARGET_SCHEMA_VERSION } = loadMigrations();
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');

  console.log('\nApplying migrations');
  for (const migration of migrations) {
    try {
      db.run('BEGIN;');
      for (const statement of migration.statements) db.run(statement);
      db.run(`PRAGMA user_version = ${migration.version};`);
      db.run('COMMIT;');
      check(true, `migration ${migration.version} — ${migration.name} (${migration.statements.length} statements)`);
    } catch (error) {
      db.run('ROLLBACK;');
      check(false, `migration ${migration.version} — ${migration.name}: ${error.message}`);
      process.exit(1);
    }
  }

  const one = (sql) => db.exec(sql)[0].values[0][0];

  console.log('\nSchema state');
  check(one('PRAGMA user_version;') === TARGET_SCHEMA_VERSION, `schema version is ${TARGET_SCHEMA_VERSION}`);
  check(one('SELECT count(*) FROM accounts;') === 1, 'starter account seeded');
  check(one("SELECT count(*) FROM categories WHERE kind='expense';") === 12, '12 expense categories seeded');
  check(one("SELECT count(*) FROM categories WHERE kind='income';") === 6, '6 income categories seeded');

  console.log('\nConstraints');
  const accountId = one('SELECT id FROM accounts LIMIT 1;');

  const accepts = (sql) => {
    try {
      db.run(sql);
      return true;
    } catch {
      return false;
    }
  };

  check(
    accepts(`INSERT INTO transactions (id, account_id, amount, type, occurred_on, created_at, updated_at)
             VALUES ('ok1', '${accountId}', 4200, 'expense', '2026-09-20', 1, 1);`),
    'accepts a valid transaction',
  );
  check(
    !accepts(`INSERT INTO transactions (id, account_id, amount, type, occurred_on, created_at, updated_at)
              VALUES ('bad1', '${accountId}', -100, 'expense', '2026-09-20', 1, 1);`),
    'rejects a negative amount',
  );
  check(
    !accepts(`INSERT INTO transactions (id, account_id, amount, type, occurred_on, created_at, updated_at)
              VALUES ('bad2', '${accountId}', 100, 'transfer', '2026-09-20', 1, 1);`),
    'rejects an out-of-domain transaction type',
  );
  check(
    !accepts(`INSERT INTO transactions (id, account_id, amount, type, occurred_on, created_at, updated_at)
              VALUES ('bad3', 'nope', 100, 'expense', '2026-09-20', 1, 1);`),
    'rejects an unknown account_id (foreign key enforced)',
  );
  check(
    !accepts(`INSERT INTO todos (id, title, priority, created_at, updated_at)
              VALUES ('bad4', 'x', 'urgent', 1, 1);`),
    'rejects an out-of-domain todo priority',
  );

  console.log('\nQuery plan — main ledger read');
  const plan = db
    .exec(
      `EXPLAIN QUERY PLAN
       SELECT * FROM transactions
       WHERE deleted_at IS NULL AND occurred_on BETWEEN '2026-09-01' AND '2026-09-30'
       ORDER BY occurred_on DESC;`,
    )[0]
    .values.map((row) => row.join(' '))
    .join('\n');

  console.log(`    ${plan.trim()}`);
  check(plan.includes('transactions_ledger_idx'), 'uses transactions_ledger_idx');
  check(!plan.includes('USE TEMP B-TREE'), 'no temp B-tree sort (index supplies the order)');

  console.log('\nQuery plan — open todo list');
  const todoPlan = db
    .exec(
      `EXPLAIN QUERY PLAN
       SELECT * FROM todos
       WHERE deleted_at IS NULL AND completed_at IS NULL
       ORDER BY sort_order;`,
    )[0]
    .values.map((row) => row.join(' '))
    .join('\n');

  console.log(`    ${todoPlan.trim()}`);
  check(todoPlan.includes('todos_open_idx'), 'uses todos_open_idx');
  check(
    !todoPlan.includes('USE TEMP B-TREE'),
    'no temp B-tree sort (index supplies the order)',
  );

  console.log('\nForward migration');
  await verifyForwardMigrations(SQL, migrations, TARGET_SCHEMA_VERSION);

  console.log('\nIdempotency');
  const current = one('PRAGMA user_version;');
  check(
    migrations.filter((m) => m.version > current).length === 0,
    're-running the migrator is a no-op',
  );

  console.log(
    failures === 0
      ? `\nAll checks passed (${migrations.length} migrations).\n`
      : `\n${failures} check(s) failed.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * Prove that a device upgrading from an older version lands on exactly the same
 * schema as a fresh install.
 *
 * Applying every migration to an empty database — which the checks above do —
 * only proves the chain is valid for a NEW install. It says nothing about a
 * phone sitting on version 2 when version 3 ships, which is the case that
 * actually breaks: the migration that works on an empty table and fails on one
 * with rows in it, or the `ALTER TABLE` that assumes a column an older device
 * does not have.
 *
 * Method: for every stopping point V, build a database by applying migrations
 * 1..V, then apply the remainder, and compare the resulting schema against a
 * database built in one pass. `sqlite_master` holds the canonical DDL for every
 * table, index and trigger, so comparing it catches any divergence.
 */
async function verifyForwardMigrations(SQL, migrations, targetVersion) {
  const fingerprint = (db) => {
    const result = db.exec(
      `SELECT type, name, sql FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY type, name;`,
    );
    return (result[0]?.values ?? []).map((row) => row.join(' | ')).join('\n');
  };

  const applyFrom = (db, fromVersion) => {
    for (const migration of migrations) {
      if (migration.version <= fromVersion) continue;
      db.run('BEGIN;');
      for (const statement of migration.statements) db.run(statement);
      db.run(`PRAGMA user_version = ${migration.version};`);
      db.run('COMMIT;');
    }
  };

  const fresh = new SQL.Database();
  fresh.run('PRAGMA foreign_keys = ON;');
  applyFrom(fresh, 0);
  const expected = fingerprint(fresh);
  fresh.close();

  for (let stop = 1; stop < targetVersion; stop += 1) {
    const staged = new SQL.Database();
    staged.run('PRAGMA foreign_keys = ON;');

    // Stop partway, as a shipped device would be.
    for (const migration of migrations) {
      if (migration.version > stop) break;
      staged.run('BEGIN;');
      for (const statement of migration.statements) staged.run(statement);
      staged.run(`PRAGMA user_version = ${migration.version};`);
      staged.run('COMMIT;');
    }

    // Now upgrade it the rest of the way, as the app would on next launch.
    applyFrom(staged, stop);

    const actual = fingerprint(staged);
    const version = staged.exec('PRAGMA user_version;')[0].values[0][0];
    staged.close();

    check(
      actual === expected && version === targetVersion,
      `upgrading from v${stop} matches a fresh install`,
    );
  }

  if (targetVersion < 2) {
    console.log('    (only one migration exists; nothing to upgrade from yet)');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
