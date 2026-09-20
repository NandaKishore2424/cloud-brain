import { describe, expect, it } from 'vitest';

import { applyAmountKey, isSaveableAmount, type AmountKey } from './amountInput';

/** Type a whole sequence of keys into an empty buffer. */
const type = (keys: string): string =>
  [...keys].reduce<string>(
    (buffer, key) => applyAmountKey(buffer, key as AmountKey),
    '',
  );

describe('digit entry', () => {
  it('appends digits in order', () => {
    expect(type('1234')).toBe('1234');
  });

  it('suppresses a leading zero', () => {
    expect(type('05')).toBe('5');
  });

  it('keeps a legitimate zero in a later position', () => {
    expect(type('105')).toBe('105');
  });

  it('caps the whole part to guard against a stuck key', () => {
    expect(type('1234567890123')).toBe('123456789');
  });
});

describe('decimal point', () => {
  it('accepts one decimal point', () => {
    expect(type('42.5')).toBe('42.5');
  });

  it('ignores a second decimal point rather than erroring', () => {
    expect(type('42.5.3')).toBe('42.53');
  });

  it('expands a leading point to 0.', () => {
    expect(type('.5')).toBe('0.5');
  });

  it('never accepts a third decimal place', () => {
    expect(type('42.567')).toBe('42.56');
  });
});

describe('backspace', () => {
  it('removes the last character', () => {
    expect(applyAmountKey('425', 'backspace')).toBe('42');
  });

  it('removes a decimal point like any other character', () => {
    expect(applyAmountKey('42.', 'backspace')).toBe('42');
  });

  it('is a no-op on an empty buffer', () => {
    expect(applyAmountKey('', 'backspace')).toBe('');
  });

  it('allows typing a decimal again after deleting one', () => {
    let buffer = type('42.5');
    buffer = applyAmountKey(buffer, 'backspace');
    buffer = applyAmountKey(buffer, 'backspace');
    expect(buffer).toBe('42');
    expect(applyAmountKey(buffer, '.')).toBe('42.');
  });
});

describe('isSaveableAmount', () => {
  it('rejects every representation of nothing entered', () => {
    expect(isSaveableAmount('')).toBe(false);
    expect(isSaveableAmount('0')).toBe(false);
    expect(isSaveableAmount('0.')).toBe(false);
    expect(isSaveableAmount('0.0')).toBe(false);
    expect(isSaveableAmount('0.00')).toBe(false);
  });

  it('accepts any positive amount', () => {
    expect(isSaveableAmount('1')).toBe(true);
    expect(isSaveableAmount('0.01')).toBe(true);
    expect(isSaveableAmount('42.')).toBe(true);
  });
});
