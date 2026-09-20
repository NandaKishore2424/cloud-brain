import { describe, expect, it } from 'vitest';

import { PREVIEW_LENGTH, buildPreview, normaliseTags, sanitiseSearchTerm } from './tags';

describe('normaliseTags', () => {
  it('trims surrounding whitespace', () => {
    expect(normaliseTags(['  work  '])).toEqual(['work']);
  });

  it('lowercases so casing variants are one tag', () => {
    expect(normaliseTags(['Work', 'WORK', 'work'])).toEqual(['work']);
  });

  it('drops empty and whitespace-only entries', () => {
    expect(normaliseTags(['', '   ', 'work'])).toEqual(['work']);
  });

  it('de-duplicates while preserving insertion order', () => {
    expect(normaliseTags(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('truncates an over-long tag rather than rejecting it', () => {
    const long = 'x'.repeat(60);
    const [tag] = normaliseTags([long]);
    expect(tag).toHaveLength(30);
  });

  /**
   * Truncation happens before de-duplication, so two tags differing only past
   * the limit collapse into one rather than producing two identical chips.
   */
  it('de-duplicates after truncation', () => {
    const a = `${'x'.repeat(30)}aaa`;
    const b = `${'x'.repeat(30)}bbb`;
    expect(normaliseTags([a, b])).toHaveLength(1);
  });

  it('handles an empty list', () => {
    expect(normaliseTags([])).toEqual([]);
  });
});

describe('buildPreview', () => {
  it('returns short bodies unchanged', () => {
    expect(buildPreview('A short note.')).toBe('A short note.');
  });

  it('collapses newlines and runs of whitespace', () => {
    expect(buildPreview('line one\n\n\nline   two')).toBe('line one line two');
  });

  it('trims leading and trailing whitespace', () => {
    expect(buildPreview('\n\n  hello  \n')).toBe('hello');
  });

  it('truncates past the budget and appends an ellipsis', () => {
    const body = 'a'.repeat(PREVIEW_LENGTH + 50);
    const preview = buildPreview(body);

    expect(preview).toHaveLength(PREVIEW_LENGTH + 1);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('does not truncate at exactly the budget', () => {
    const body = 'a'.repeat(PREVIEW_LENGTH);
    expect(buildPreview(body)).toBe(body);
  });

  it('returns an empty string for an empty body', () => {
    expect(buildPreview('')).toBe('');
    expect(buildPreview('   \n  ')).toBe('');
  });
});

describe('sanitiseSearchTerm', () => {
  /**
   * The failure this prevents: '%' is a LIKE wildcard, so searching for "50%"
   * would build '%50%%' and match every note in the database — the worst
   * possible search result, silently.
   */
  it('strips LIKE wildcards', () => {
    expect(sanitiseSearchTerm('50%')).toBe('50');
    expect(sanitiseSearchTerm('a_b')).toBe('ab');
    expect(sanitiseSearchTerm('back\\slash')).toBe('backslash');
  });

  it('trims whitespace', () => {
    expect(sanitiseSearchTerm('  hello  ')).toBe('hello');
  });

  it('leaves ordinary terms untouched', () => {
    expect(sanitiseSearchTerm('payment webhook')).toBe('payment webhook');
  });

  it('leaves quotes alone — they are bound as parameters, not interpolated', () => {
    expect(sanitiseSearchTerm("it's")).toBe("it's");
  });
});
