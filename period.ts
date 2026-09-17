/**
 * Period resolution.
 *
 * The workbook had two hard-coded cells (Income Statement!B4/B5) that every other
 * sheet pointed at. The app replaces them with a resolver, but keeps the same
 * discipline: ONE resolved period flows into every report in a request, so the
 * dashboard, statements and charts can never be looking at different windows.
 *
 * All dates are computed in the USER'S timezone (default Asia/Manila), then
 * flattened to YYYY-MM-DD. A user in Manila adding a transaction at 11pm must see
 * it in "this month", not next month's, which is what naive UTC maths would do.
 */
import type { PeriodPreset, ResolvedPeriod } from '@pfos/shared';

/** "Now" as a YYYY-MM-DD string in the given IANA timezone. */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA already yields YYYY-MM-DD
}

export interface ResolvePeriodOptions {
  preset: PeriodPreset;
  from?: string;
  to?: string;
  timezone?: string;
  weekStartsOn?: number;
  locale?: string;
  now?: Date;
}

export function resolvePeriod(options: ResolvePeriodOptions): ResolvedPeriod {
  const {
    preset,
    from,
    to,
    timezone = 'Asia/Manila',
    weekStartsOn = 1,
    locale = 'en-PH',
    now = new Date(),
  } = options;

  const today = todayIn(timezone, now);

  switch (preset) {
    case 'THIS_WEEK': {
      const start = startOfWeek(today, weekStartsOn);
      const end = addDays(start, 6);
      return { from: start, to: end, label: 'This week' };
    }
    case 'THIS_MONTH': {
      const month = today.slice(0, 7);
      return { from: `${month}-01`, to: endOfMonth(month), label: labelMonth(month, locale) };
    }
    case 'LAST_MONTH': {
      const month = shiftMonth(today.slice(0, 7), -1);
      return { from: `${month}-01`, to: endOfMonth(month), label: labelMonth(month, locale) };
    }
    case 'THIS_YEAR': {
      const year = today.slice(0, 4);
      return { from: `${year}-01-01`, to: `${year}-12-31`, label: year };
    }
    case 'CUSTOM': {
      if (!from || !to) throw new Error('Custom period requires from and to');
      const [a, b] = from <= to ? [from, to] : [to, from];
      return { from: a, to: b, label: `${a} → ${b}` };
    }
  }
}

export function startOfWeek(date: string, weekStartsOn = 1): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const shift = (d.getUTCDay() - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function labelMonth(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
