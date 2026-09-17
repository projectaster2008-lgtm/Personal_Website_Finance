/**
 * Money handling.
 *
 * RULE: money never exists as a float in this codebase. Every amount is an
 * integer number of minor units (centavos for PHP). The database stores
 * `amountMinor: Int`, the API transports `amountMinor: number`, and only the
 * formatting layer ever produces a decimal string.
 *
 * Why: `0.1 + 0.2 !== 0.3`. A budgeting app that drifts by a centavo per
 * transaction fails reconciliation, which is the one thing this product promises.
 */

export const MINOR_UNITS_PER_MAJOR = 100;

/** Parse user input ("1,234.50", "₱1234.5", 1234.5) into minor units. */
export function toMinor(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Amount is not a finite number');
    return Math.round(input * MINOR_UNITS_PER_MAJOR);
  }
  const cleaned = input.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') throw new Error('Amount is empty');
  const value = Number(cleaned);
  if (!Number.isFinite(value)) throw new Error(`Cannot parse amount: ${input}`);
  return Math.round(value * MINOR_UNITS_PER_MAJOR);
}

/** Convert minor units back to a major-unit number. Presentation only. */
export function toMajor(minor: number): number {
  return minor / MINOR_UNITS_PER_MAJOR;
}

/** Sum a list of minor-unit amounts without float drift. */
export function sumMinor(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * Percentage of `part` against `whole`, rounded to one decimal.
 * Returns 0 when `whole` is 0 so callers never divide by zero.
 */
export function percentOf(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export interface FormatMoneyOptions {
  currency?: string;
  locale?: string;
  /** Render 0 as "—" the way a financial statement would. */
  dashOnZero?: boolean;
  /** Wrap negatives in parentheses instead of a minus sign. */
  accounting?: boolean;
  /** Hide the decimal part for compact displays. */
  compactDecimals?: boolean;
}

/** Format minor units for display. Shared so server exports and UI agree. */
export function formatMoney(minor: number, options: FormatMoneyOptions = {}): string {
  const {
    currency = 'PHP',
    locale = 'en-PH',
    dashOnZero = false,
    accounting = false,
    compactDecimals = false,
  } = options;

  if (minor === 0 && dashOnZero) return '—';

  const abs = Math.abs(toMajor(minor));
  const body = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: compactDecimals ? 0 : 2,
    maximumFractionDigits: compactDecimals ? 0 : 2,
  }).format(abs);

  if (minor < 0) return accounting ? `(${body})` : `-${body}`;
  return body;
}

/** Signed helper used by ledger maths: IN is positive, OUT is negative. */
export function signed(direction: 'IN' | 'OUT', amountMinor: number): number {
  return direction === 'IN' ? amountMinor : -amountMinor;
}
