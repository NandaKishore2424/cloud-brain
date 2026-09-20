import { err, ok, type Result } from './result';

/**
 * Money — integer paise, never floating point.
 *
 * The invariant: a monetary amount is ALWAYS an integer number of paise.
 * `4200` means ₹42.00. Rupees only exist as a display format and as raw user
 * input; they never reach the database and never participate in arithmetic.
 *
 * Why this matters (the classic demo):
 *
 *     0.1 + 0.2              === 0.30000000000000004
 *     10   + 20              === 30
 *
 * IEEE-754 doubles cannot represent most decimal fractions exactly. Sum a few
 * hundred float rupee values and the total drifts by paise. In a ledger that is
 * not a rounding artefact, it is a wrong number on screen, and it compounds.
 * Integers are exact, and JS integers stay exact up to 2^53 — about ₹90 trillion
 * in paise, which is comfortably more than this app will ever hold.
 *
 * See docs/decisions/0006-money-as-integer-paise.md
 */

declare const paiseBrand: unique symbol;

/**
 * A branded integer. Structurally it is a `number`, but TypeScript will refuse
 * to accept a plain `number` where `Paise` is expected, so a raw rupee value
 * cannot be passed in by accident. The brand exists only at compile time and
 * costs nothing at runtime.
 */
export type Paise = number & { readonly [paiseBrand]: true };

export const ZERO_PAISE = 0 as Paise;

/** Assert that a raw number is already a whole paise value. */
export function asPaise(n: number): Paise {
  if (!Number.isInteger(n)) {
    throw new Error(`Paise must be an integer, received ${n}`);
  }
  if (!Number.isSafeInteger(n)) {
    throw new Error(`Paise value ${n} exceeds safe integer range`);
  }
  return n as Paise;
}

/** Convert a rupee number to paise, rounding half away from zero. */
export function fromRupees(rupees: number): Paise {
  if (!Number.isFinite(rupees)) {
    throw new Error(`Cannot convert non-finite value ${rupees} to paise`);
  }
  const scaled = rupees * 100;

  // Absorb float representation error before rounding.
  //
  // `1.005 * 100` is 100.49999999999999, and `Math.round` of that is 100 — the
  // caller plainly meant 101. Passing through a fixed-decimal string rounds on
  // the decimal representation instead of the binary one, recovering the
  // intent. `2.675 * 100` (267.49999999999994) behaves the same way.
  //
  // Six places is far beyond any currency precision, so this only ever corrects
  // representation noise, never a genuine fraction of a paise.
  //
  // Worth being precise about the limit: this recovers intent, it does not
  // recover information. By the time this function is called, the literal
  // `1.005` has already become the nearest double (1.00499999999999989) and the
  // original decimal is gone. That is the argument for the whole design —
  // `parseAmount` goes string to integer and never touches a float, and it is
  // the only path user input takes.
  const corrected = Number(scaled.toFixed(6));
  const rounded = corrected < 0 ? -Math.round(-corrected) : Math.round(corrected);
  return asPaise(rounded);
}

/** For display and charting only. Never feed the result back into arithmetic. */
export function toRupees(value: Paise): number {
  return value / 100;
}

export function addPaise(...values: Paise[]): Paise {
  return asPaise(values.reduce<number>((sum, v) => sum + v, 0));
}

export function subtractPaise(a: Paise, b: Paise): Paise {
  return asPaise(a - b);
}

export function negatePaise(value: Paise): Paise {
  return asPaise(-value);
}

export function absPaise(value: Paise): Paise {
  return asPaise(Math.abs(value));
}

/**
 * Multiply by a ratio (e.g. a 18% GST split) and round to whole paise.
 * Rounding happens once, at the end — never accumulate fractional paise.
 */
export function scalePaise(value: Paise, factor: number): Paise {
  const scaled = value * factor;
  return asPaise(scaled < 0 ? -Math.round(-scaled) : Math.round(scaled));
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * Group digits in the Indian numbering system: the last three digits form one
 * group, everything above that is grouped in twos.
 *
 *   1234       -> 1,234
 *   123456     -> 1,23,456
 *   10000000   -> 1,00,00,000   (one crore)
 *
 * Hand-rolled rather than `Intl.NumberFormat('en-IN')` so the output does not
 * depend on which ICU data the device's JS engine happens to ship.
 */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}`;
}

/**
 * Format a partially-typed amount string for live display on the keypad.
 *
 * Distinct from `formatMoney` because the input is mid-edit and must be shown
 * exactly as typed: `'42.'` keeps its trailing dot (the user is about to type
 * paise) and `'42.5'` shows one decimal rather than being padded to `'42.50'`.
 * Padding as they type would make the caret appear to jump.
 */
export function formatAmountInput(input: string): string {
  if (input === '') return '0';

  const dotIndex = input.indexOf('.');
  if (dotIndex === -1) return groupIndian(input);

  const whole = input.slice(0, dotIndex);
  const fraction = input.slice(dotIndex + 1);
  return `${groupIndian(whole === '' ? '0' : whole)}.${fraction}`;
}

/**
 * Render paise as a keypad input buffer.
 *
 * The inverse of `parseAmount`, used when a stored amount is recalled into the
 * entry field — tapping a suggested amount has to leave the keypad in exactly
 * the state it would be in had the user typed it.
 *
 * Whole rupees drop the decimal entirely: `4000` becomes `'40'`, not `'40.00'`.
 * Leaving the `.00` on would mean the next keypress is silently ignored,
 * because the buffer already holds two decimal places.
 */
export function toAmountInput(value: Paise): string {
  const whole = Math.floor(Math.abs(value) / 100);
  const fraction = Math.abs(value) % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, '0')}`;
}

export type FormatMoneyOptions = {
  /** Include the ₹ symbol. Default true. */
  symbol?: boolean;
  /** Show paise. Default true. When false, the value is rounded to rupees. */
  decimals?: boolean;
  /** Always show a leading + or −. Default false. */
  signed?: boolean;
};

/**
 * Format paise for display.
 *
 * Note the minus sign: U+2212 MINUS SIGN, not a hyphen. It is the same width as
 * a digit in most fonts, so a column of negative amounts stays aligned.
 */
export function formatMoney(
  value: Paise,
  options: FormatMoneyOptions = {},
): string {
  const { symbol = true, decimals = true, signed = false } = options;

  const negative = value < 0;
  const magnitude = Math.abs(value);

  const rupeePart = Math.floor(magnitude / 100);
  const paisePart = magnitude % 100;

  let body = groupIndian(String(rupeePart));
  if (decimals) body += `.${String(paisePart).padStart(2, '0')}`;

  const sign = negative ? '−' : signed ? '+' : '';
  const prefix = symbol ? '₹' : '';

  return `${sign}${prefix}${body}`;
}

/**
 * Compact format for tight spaces — dashboard tiles, chart axis labels.
 *
 *   4500000  -> ₹45K       (₹45,000)
 *   250000000 -> ₹25L      (₹25,00,000)
 */
export function formatMoneyCompact(value: Paise): string {
  const negative = value < 0;
  const rupees = Math.abs(value) / 100;

  let body: string;
  if (rupees >= 1_00_00_000) body = `${trimZero(rupees / 1_00_00_000)}Cr`;
  else if (rupees >= 1_00_000) body = `${trimZero(rupees / 1_00_000)}L`;
  else if (rupees >= 1_000) body = `${trimZero(rupees / 1_000)}K`;
  else body = String(Math.round(rupees));

  return `${negative ? '−' : ''}₹${body}`;
}

function trimZero(n: number): string {
  const fixed = n.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

const MAX_PAISE = 1_000_000_00_00_000; // ₹10,000 crore — a sanity ceiling.

/**
 * Parse free-text user input into paise.
 *
 * Accepts: "42", "42.5", "42.50", "1,234.56", " ₹99 ", "1234."
 * Rejects: empty, negative, non-numeric, more than two decimal places,
 *          and absurd magnitudes.
 *
 * Sign is deliberately not accepted. Direction is a separate field on the
 * transaction (`type: income | expense`), not a property of the amount — that
 * keeps "is this money in or out" out of the amount's representation, where it
 * would be easy to lose.
 */
export function parseAmount(input: string): Result<Paise> {
  const cleaned = input.replace(/[\s,₹]/g, '');

  if (cleaned.length === 0) {
    return err('VALIDATION', 'Enter an amount');
  }
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') {
    return err('VALIDATION', 'Amount can only contain digits and a decimal point');
  }

  const [rupeeText = '', paiseText] = cleaned.split('.');
  if (paiseText !== undefined && paiseText.length > 2) {
    return err('VALIDATION', 'Amount cannot have more than two decimal places');
  }

  const rupees = rupeeText === '' ? 0 : Number.parseInt(rupeeText, 10);
  const paise =
    paiseText === undefined || paiseText === ''
      ? 0
      : Number.parseInt(paiseText.padEnd(2, '0'), 10);

  const total = rupees * 100 + paise;

  if (!Number.isSafeInteger(total)) {
    return err('VALIDATION', 'That amount is too large');
  }
  if (total > MAX_PAISE) {
    return err('VALIDATION', 'That amount is too large');
  }
  if (total === 0) {
    return err('VALIDATION', 'Amount must be more than zero');
  }

  return ok(total as Paise);
}
