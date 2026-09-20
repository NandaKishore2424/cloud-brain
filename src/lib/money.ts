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
  // Multiplying then rounding is safe here: the product is within 2^53 for any
  // realistic amount, and rounding collapses the float error before it is stored.
  const scaled = rupees * 100;
  const rounded = scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
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
