/**
 * Date helpers.
 *
 * The database stores DATE columns; Prisma hands them back as `Date` objects at
 * UTC midnight. These two functions are the only place that conversion happens,
 * so a timezone bug has exactly one home.
 */

/** DATE column -> "YYYY-MM-DD". */
export function toDateString(value: Date | string): string {
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" -> a Date safe to store in a DATE column. */
export function toDateColumn(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function todayInTimezone(timezone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
