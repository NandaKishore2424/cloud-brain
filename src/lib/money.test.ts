import { describe, expect, it } from 'vitest';

import {
  addPaise,
  asPaise,
  formatAmountInput,
  formatMoney,
  formatMoneyCompact,
  fromRupees,
  parseAmount,
  scalePaise,
  subtractPaise,
  toRupees,
  type Paise,
} from './money';

const p = (n: number) => n as Paise;

describe('fromRupees', () => {
  it('converts whole rupees', () => {
    expect(fromRupees(42)).toBe(4200);
  });

  it('converts paise without float drift', () => {
    expect(fromRupees(42.5)).toBe(4250);
    expect(fromRupees(0.01)).toBe(1);
    expect(fromRupees(19.99)).toBe(1999);
  });

  /**
   * The case that motivates the whole integer-paise design: 1.005 * 100 is
   * 100.49999999999999 in IEEE-754, so a naive floor() yields 100 instead of
   * 101. Rounding collapses the error before it can be stored.
   */
  it('rounds the classic float-representation cases correctly', () => {
    expect(fromRupees(1.005)).toBe(101);
    expect(fromRupees(2.675)).toBe(268);
    expect(fromRupees(0.1 + 0.2)).toBe(30);
  });

  it('rounds half away from zero, symmetrically', () => {
    expect(fromRupees(0.005)).toBe(1);
    expect(fromRupees(-0.005)).toBe(-1);
  });

  it('rejects non-finite input', () => {
    expect(() => fromRupees(Number.NaN)).toThrow();
    expect(() => fromRupees(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe('asPaise', () => {
  it('rejects a fractional value', () => {
    expect(() => asPaise(42.5)).toThrow(/integer/i);
  });

  it('rejects a value beyond safe integer range', () => {
    expect(() => asPaise(Number.MAX_SAFE_INTEGER + 2)).toThrow();
  });
});

describe('arithmetic', () => {
  /**
   * The headline argument for integers. Summing 0.1 + 0.2 as floats gives
   * 0.30000000000000004; in paise it is exactly 30.
   */
  it('sums exactly where floats would drift', () => {
    const total = addPaise(p(10), p(20));
    expect(total).toBe(30);
    expect(toRupees(total)).toBe(0.3);
  });

  it('stays exact across many additions', () => {
    // 1000 additions of ₹0.01. As floats this accumulates visible error.
    let running = p(0);
    for (let i = 0; i < 1000; i += 1) running = addPaise(running, p(1));
    expect(running).toBe(1000);
    expect(toRupees(running)).toBe(10);
  });

  it('subtracts into negative territory', () => {
    expect(subtractPaise(p(1000), p(2500))).toBe(-1500);
  });

  it('scales and rounds once', () => {
    expect(scalePaise(p(10000), 0.18)).toBe(1800);
    // 999 * 0.33 = 329.67 → 330, not truncated to 329.
    expect(scalePaise(p(999), 0.33)).toBe(330);
  });
});

describe('formatMoney', () => {
  it('formats with two decimals and the rupee symbol', () => {
    expect(formatMoney(p(4200))).toBe('₹42.00');
    expect(formatMoney(p(4250))).toBe('₹42.50');
    expect(formatMoney(p(5))).toBe('₹0.05');
  });

  it('groups using the Indian numbering system', () => {
    expect(formatMoney(p(123400), { decimals: false })).toBe('₹1,234');
    expect(formatMoney(p(12345600), { decimals: false })).toBe('₹1,23,456');
    expect(formatMoney(p(100000000000), { decimals: false })).toBe('₹1,00,00,00,000');
  });

  it('uses a typographic minus, not a hyphen', () => {
    const formatted = formatMoney(p(-4200));
    expect(formatted.startsWith('−')).toBe(true);
    expect(formatted.includes('-')).toBe(false);
  });

  it('honours the symbol and signed options', () => {
    expect(formatMoney(p(4200), { symbol: false })).toBe('42.00');
    expect(formatMoney(p(4200), { signed: true })).toBe('+₹42.00');
    // A negative value keeps its minus rather than gaining a plus.
    expect(formatMoney(p(-4200), { signed: true })).toBe('−₹42.00');
  });

  it('formats zero without a sign', () => {
    expect(formatMoney(p(0))).toBe('₹0.00');
  });
});

describe('formatMoneyCompact', () => {
  it('abbreviates using Indian scale words', () => {
    // 450 paise is ₹4.50. Compact format is deliberately approximate and
    // rounds to the nearest rupee, so ₹5 is the intended output.
    expect(formatMoneyCompact(p(450))).toBe('₹5');
    expect(formatMoneyCompact(p(4500000))).toBe('₹45K');
    expect(formatMoneyCompact(p(250000000))).toBe('₹25L');
    expect(formatMoneyCompact(p(25000000000))).toBe('₹25Cr');
  });

  it('drops a trailing .0', () => {
    expect(formatMoneyCompact(p(100000))).toBe('₹1K');
  });
});

describe('formatAmountInput', () => {
  it('preserves the input exactly as typed', () => {
    expect(formatAmountInput('')).toBe('0');
    expect(formatAmountInput('42')).toBe('42');
    // Trailing dot is kept — the user is mid-way through typing paise.
    expect(formatAmountInput('42.')).toBe('42.');
    // One decimal is NOT padded to two while typing.
    expect(formatAmountInput('42.5')).toBe('42.5');
  });

  it('groups the whole part while typing', () => {
    expect(formatAmountInput('123456')).toBe('1,23,456');
    expect(formatAmountInput('123456.7')).toBe('1,23,456.7');
  });

  it('renders a leading decimal point as 0.', () => {
    expect(formatAmountInput('.5')).toBe('0.5');
  });
});

describe('parseAmount', () => {
  it('parses plain and decimal input', () => {
    expect(parseAmount('42')).toEqual({ ok: true, value: 4200 });
    expect(parseAmount('42.5')).toEqual({ ok: true, value: 4250 });
    expect(parseAmount('42.50')).toEqual({ ok: true, value: 4250 });
  });

  it('strips grouping separators, whitespace and the rupee symbol', () => {
    expect(parseAmount(' ₹1,234.56 ')).toEqual({ ok: true, value: 123456 });
  });

  it('treats a trailing dot as zero paise', () => {
    expect(parseAmount('42.')).toEqual({ ok: true, value: 4200 });
  });

  it('rejects empty and zero amounts', () => {
    expect(parseAmount('').ok).toBe(false);
    expect(parseAmount('0').ok).toBe(false);
    expect(parseAmount('0.00').ok).toBe(false);
  });

  it('rejects more than two decimal places', () => {
    const result = parseAmount('42.555');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('VALIDATION');
  });

  it('rejects non-numeric input', () => {
    expect(parseAmount('abc').ok).toBe(false);
    expect(parseAmount('.').ok).toBe(false);
    // Sign is deliberately not accepted — direction lives in the type column.
    expect(parseAmount('-42').ok).toBe(false);
  });

  it('rejects absurd magnitudes', () => {
    expect(parseAmount('999999999999').ok).toBe(false);
  });

  it('returns a user-safe message on failure', () => {
    const result = parseAmount('');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBeTruthy();
      expect(result.error.message).not.toMatch(/SQL|undefined|null/i);
    }
  });
});
