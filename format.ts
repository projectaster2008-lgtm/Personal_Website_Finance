/**
 * Display formatting.
 *
 * The one rule: nothing here does arithmetic on money beyond converting minor
 * units for display. Every figure arrives pre-computed from the API.
 */
import { formatMoney, type FormatMoneyOptions } from '@pfos/shared';

export { formatMoney };

/** Money formatted for the current user, with the sign shown when it matters. */
export function money(
  minor: number,
  currency = 'PHP',
  options: Omit<FormatMoneyOptions, 'currency'> = {},
): string {
  return formatMoney(minor, { currency, ...options });
}

/** Money with an explicit + or − so a change reads unambiguously. */
export function signedMoney(minor: number, currency = 'PHP'): string {
  const body = formatMoney(Math.abs(minor), { currency });
  if (minor > 0) return `+${body}`;
  if (minor < 0) return `−${body}`;
  return body;
}

/** "14 Sep 2026" — never a raw ISO string in the UI. */
export function formatDate(date: string, locale = 'en-PH'): string {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Today" / "Yesterday" / a date, for transaction lists. */
export function friendlyDate(date: string, today: string, locale = 'en-PH'): string {
  if (date === today) return 'Today';
  const yesterday = new Date(`${today}T00:00:00.000Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return formatDate(date, locale);
}

/** Today in the user's timezone, as YYYY-MM-DD. Use this to default date inputs. */
export function todayFor(timezone = 'Asia/Manila'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function percent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Colour token for a transaction type, used consistently across the app. */
export function typeColor(type: 'INCOME' | 'EXPENSE' | 'TRANSFER'): string {
  return type === 'INCOME' ? 'text-income' : type === 'EXPENSE' ? 'text-expense' : 'text-transfer';
}

/** Colour token for a budget or goal status. */
export function statusColor(status: 'ON_TRACK' | 'WARNING' | 'OVER_BUDGET'): string {
  return status === 'OVER_BUDGET'
    ? 'bg-red-500'
    : status === 'WARNING'
      ? 'bg-amber-500'
      : 'bg-emerald-500';
}
