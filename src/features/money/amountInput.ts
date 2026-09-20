/**
 * Keypad input state machine.
 *
 * Pure string transitions, deliberately separated from the keypad component so
 * the rules are unit-testable without rendering anything. Every edge case here
 * is one a user will hit within a week of real use.
 *
 * The buffer is the amount exactly as typed — `''`, `'42'`, `'42.'`, `'42.5'`.
 * It is intentionally NOT normalised while typing: showing `42.00` the moment
 * someone types `42.` would be wrong, because they are mid-way through entering
 * paise.
 */

/** Digits before the decimal point. ~₹100 crore, far past any real entry. */
const MAX_WHOLE_DIGITS = 9;
const MAX_FRACTION_DIGITS = 2;

export type AmountKey =
  | '0' | '1' | '2' | '3' | '4'
  | '5' | '6' | '7' | '8' | '9'
  | '.' | 'backspace';

export function applyAmountKey(buffer: string, key: AmountKey): string {
  if (key === 'backspace') return buffer.slice(0, -1);
  if (key === '.') return appendDecimalPoint(buffer);
  return appendDigit(buffer, key);
}

function appendDecimalPoint(buffer: string): string {
  // A second decimal point is a no-op rather than an error. Silently ignoring
  // an impossible keypress is less disruptive than flashing a validation message.
  if (buffer.includes('.')) return buffer;
  // Leading '.' becomes '0.' so the display never reads as a bare fraction.
  return buffer === '' ? '0.' : `${buffer}.`;
}

function appendDigit(buffer: string, digit: string): string {
  const dotIndex = buffer.indexOf('.');

  if (dotIndex === -1) {
    // Suppress leading zeros: '0' then '5' should give '5', not '05'.
    if (buffer === '0') return digit;
    if (buffer.length >= MAX_WHOLE_DIGITS) return buffer;
    return buffer + digit;
  }

  const fraction = buffer.slice(dotIndex + 1);
  if (fraction.length >= MAX_FRACTION_DIGITS) return buffer;
  return buffer + digit;
}

/**
 * Whether the buffer represents a saveable amount.
 *
 * `''`, `'0'`, `'0.'` and `'0.00'` are all "nothing entered yet" and must not
 * enable the save button — a zero-rupee transaction is never intentional.
 */
export function isSaveableAmount(buffer: string): boolean {
  if (buffer === '') return false;
  const numeric = Number.parseFloat(buffer);
  return Number.isFinite(numeric) && numeric > 0;
}
