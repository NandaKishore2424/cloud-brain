/* eslint-disable no-console */
/**
 * Architecture checks.
 *
 * CLAUDE.md states two structural rules. Rules that live only in a document get
 * broken, quietly, by whoever is moving fastest — including me: Phase 2's dev
 * seeder imported `ORDER_GAP` from `@/features/todos/ordering`, inverting the
 * dependency direction, and nothing complained. This script is the complaint.
 *
 *   1. Infrastructure must not depend on features.
 *      `src/db` and `src/lib` may never import from `src/features`.
 *
 *   2. Features must not depend on each other.
 *      `src/features/a` may never import from `src/features/b`.
 *
 *   3. Every `useLiveQuery` call passes its dependency list.
 *      Drizzle's hook subscribes inside `useEffect(..., deps)` and `deps`
 *      defaults to `[]` — so without it, the hook subscribes once to the first
 *      query it is given and ignores every later one. A screen whose query
 *      depends on a month, a search term or a selected category silently keeps
 *      showing the first result. That shipped: month navigation, notes search,
 *      the income/expense category switch and the suggested amounts were all
 *      stuck, and 180 green tests could not see it because none render a
 *      screen. Not a layering rule, strictly — but it is the same kind of rule:
 *      one that lives in a document gets broken.
 *
 * Deliberately a plain string scan rather than an AST walk or a lint plugin:
 * import statements are trivially greppable, and a 60-line script that runs in
 * milliseconds gets kept in the verify chain, whereas a dependency-graph tool
 * would be one more thing to configure and upgrade.
 *
 * Run with:  npm run check:layering
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/** Matches the module specifier of any static or dynamic import. */
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function importsOf(file) {
  const source = fs.readFileSync(file, 'utf8');
  const found = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    if (specifier !== undefined) found.push(specifier);
  }
  return found;
}

/** Feature name for a path inside src/features, else null. */
function featureOf(relativePath) {
  const match = /^features\/([^/]+)\//.exec(relativePath);
  return match?.[1] ?? null;
}

const violations = [];

for (const file of walk(SRC)) {
  const relative = path.relative(SRC, file).split(path.sep).join('/');
  const owningFeature = featureOf(relative);
  const isInfrastructure = relative.startsWith('db/') || relative.startsWith('lib/');

  for (const specifier of importsOf(file)) {
    const featureImport = /^@\/features\/([^/]+)/.exec(specifier);
    if (featureImport === null) continue;

    const importedFeature = featureImport[1];

    if (isInfrastructure) {
      violations.push(
        `${relative}\n    imports ${specifier}\n    ` +
          'infrastructure (db/, lib/) must not depend on a feature',
      );
      continue;
    }

    if (owningFeature !== null && importedFeature !== owningFeature) {
      violations.push(
        `${relative}\n    imports ${specifier}\n    ` +
          `feature '${owningFeature}' must not depend on feature '${importedFeature}'`,
      );
    }
  }
}

/**
 * Count the top-level arguments of each `useLiveQuery(` call by walking
 * parentheses, since a regex cannot tell the comma in
 * `useLiveQuery(useMemo(() => q(a), [a]))` — nested, one argument — from the
 * one in `useLiveQuery(query, [query])`.
 */
function liveQueriesWithoutDeps(source) {
  const missing = [];
  const needle = 'useLiveQuery(';
  let from = 0;

  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) return missing;
    from = at + needle.length;

    // Walk to the MATCHING close paren, recording top-level commas.
    let depth = 1;
    let close = source.length;
    const commas = [];
    for (let i = from; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      } else if (ch === ',' && depth === 1) commas.push(i);
    }

    // A trailing comma — only whitespace before the close paren — does not
    // begin a second argument.
    const last = commas[commas.length - 1];
    const trailing = last !== undefined && source.slice(last + 1, close).trim() === '';
    const hasSecondArgument = commas.length - (trailing ? 1 : 0) >= 1;

    if (!hasSecondArgument) {
      missing.push(source.slice(0, at).split('\n').length);
    }
  }
}

for (const file of walk(SRC)) {
  const relative = path.relative(SRC, file).split(path.sep).join('/');
  for (const line of liveQueriesWithoutDeps(fs.readFileSync(file, 'utf8'))) {
    violations.push(
      `${relative}:${line}\n    useLiveQuery called without a dependency list\n    ` +
        'pass [query] (memoised) or [] (static) — the default [] freezes the first query',
    );
  }
}

if (violations.length === 0) {
  console.log('\n  ✓ Layering rules hold (no cross-feature or inverted imports).');
  console.log('  ✓ Every useLiveQuery call passes its dependency list.\n');
  process.exit(0);
}

console.error(`\n  ${violations.length} layering violation(s):\n`);
for (const violation of violations) console.error(`  ✗ ${violation}\n`);
console.error('  See CLAUDE.md §2 (Hard invariants) and docs/architecture.md.\n');
process.exit(1);
