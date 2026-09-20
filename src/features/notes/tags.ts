/**
 * Tag and preview text handling.
 *
 * Pure, and deliberately separate from `api/notes.ts`. That module imports the
 * database client, which pulls in `expo-sqlite` and cannot load under Vitest's
 * node environment — so anything defined there is untestable without a React
 * Native transform. The rules below are exactly the kind of thing that should
 * be tested, so they live where they can be.
 *
 * Same reasoning that moved `ordering.ts` into `lib`: logic worth testing does
 * not belong behind an import that cannot load in a test.
 */

/** Longest tag accepted. Matches the input's `maxLength`. */
const MAX_TAG_LENGTH = 30;

/**
 * Trim, lowercase, drop empties, and de-duplicate. Insertion order is kept.
 *
 * Lowercasing means "Work" and "work" are the same tag rather than two that
 * sort apart in the tag index and split their counts. The cost is that a tag
 * cannot carry intentional capitalisation, which for personal tagging is not a
 * loss worth the ambiguity.
 */
export function normaliseTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of tags) {
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (tag.length === 0 || seen.has(tag)) continue;
    seen.add(tag);
    output.push(tag);
  }

  return output;
}

/** Characters of body text kept for a list preview. */
export const PREVIEW_LENGTH = 140;

/**
 * Flatten a note body into a single-line preview.
 *
 * Whitespace collapses so a note whose first lines are short does not render a
 * preview that is mostly blank. Truncation happens at a character budget rather
 * than relying on `numberOfLines` alone, so a 20KB note does not ship its whole
 * body into the row's text measurement on every render.
 */
export function buildPreview(body: string): string {
  const flattened = body.replace(/\s+/g, ' ').trim();
  return flattened.length <= PREVIEW_LENGTH
    ? flattened
    : `${flattened.slice(0, PREVIEW_LENGTH)}…`;
}

/**
 * SQLite's LIKE treats `%` and `_` as wildcards.
 *
 * Without handling them, searching for "50%" matches every note and "a_b"
 * matches "axb". Drizzle's `like` does not emit an ESCAPE clause, so the
 * wildcards are stripped from user input instead of escaped. Search is
 * substring matching — a literal `%` is not a meaningful thing to search for,
 * and silently matching everything is the worse failure.
 */
export function sanitiseSearchTerm(term: string): string {
  return term.trim().replace(/[%_\\]/g, '');
}
