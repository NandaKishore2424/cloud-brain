/**
 * Does a personal notes app actually need FTS?
 *
 * Benchmarks LIKE-based search against realistic note volumes, so the decision
 * is made on a measurement rather than on "full-text search sounds right".
 */
const initSqlJs = require('sql.js');

const WORDS = [
  'payment', 'webhook', 'retry', 'idempotency', 'race', 'condition', 'redis',
  'postgres', 'migration', 'index', 'query', 'plan', 'sprint', 'review',
  'standup', 'refactor', 'auth', 'token', 'cache', 'latency', 'throughput',
  'deploy', 'rollback', 'incident', 'postmortem', 'metric', 'dashboard',
  'interview', 'resume', 'appraisal', 'salary', 'offer', 'recruiter',
];

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeBody(rand, wordCount) {
  const out = [];
  for (let i = 0; i < wordCount; i += 1) {
    out.push(WORDS[Math.floor(rand() * WORDS.length)]);
  }
  return out.join(' ');
}

(async () => {
  const SQL = await initSqlJs();

  console.log('\n  LIKE search, WORST CASE (zero matches, full scan) — median of 50 runs\n');
  console.log('  notes   avg body   db size    median    p95       matches');
  console.log('  ' + '-'.repeat(62));

  for (const count of [100, 500, 2000, 10000, 50000]) {
    const db = new SQL.Database();
    db.run(`CREATE TABLE notes (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]', pinned_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
    );`);
    db.run('CREATE INDEX notes_recent_idx ON notes (deleted_at, updated_at);');

    const rand = mulberry32(42);
    db.run('BEGIN;');
    const stmt = db.prepare(
      'INSERT INTO notes (id, title, body, created_at, updated_at) VALUES (?,?,?,?,?)',
    );
    for (let i = 0; i < count; i += 1) {
      // ~200 words is a long note; most are far shorter.
      stmt.run([`n${i}`, makeBody(rand, 6), makeBody(rand, 200), 1, i]);
    }
    stmt.free();
    db.run('COMMIT;');

    const bytes = db.export().length;

    // WORST CASE: a term that matches nothing, so LIMIT cannot short-circuit
    // and SQLite must scan every row. A common term finds 50 matches almost
    // immediately and measures nothing useful.
    const query = `SELECT id, title FROM notes
                   WHERE deleted_at IS NULL
                     AND (title LIKE '%zzzznomatch%' OR body LIKE '%zzzznomatch%')
                   ORDER BY updated_at DESC LIMIT 50;`;

    // Warm up, then measure.
    for (let i = 0; i < 5; i += 1) db.exec(query);

    const samples = [];
    let matches = 0;
    for (let i = 0; i < 50; i += 1) {
      const t0 = process.hrtime.bigint();
      const res = db.exec(query);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1e6);
      matches = res[0] ? res[0].values.length : 0;
    }
    samples.sort((a, b) => a - b);

    const median = samples[Math.floor(samples.length / 2)];
    const p95 = samples[Math.floor(samples.length * 0.95)];

    console.log(
      `  ${String(count).padEnd(8)}` +
        `${'200w'.padEnd(11)}` +
        `${(bytes / 1024 / 1024).toFixed(1).padStart(5)}MB   ` +
        `${median.toFixed(2).padStart(6)}ms  ` +
        `${p95.toFixed(2).padStart(6)}ms  ` +
        `${matches}`,
    );

    db.close();
  }

  console.log('\n  Reference: 16ms is one frame at 60fps.\n');
})();
