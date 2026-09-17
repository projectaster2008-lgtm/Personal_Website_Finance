/**
 * Planning layer: budgets, goals, recurring schedules and weekly reconciliation.
 *
 * None of these introduce new money. They read the same ledger entries as the
 * statements, which is what keeps "budget spent" and "income statement expenses"
 * from ever disagreeing (a classic failure in budget apps that keep a second tally).
 */
import { percentOf } from '@pfos/shared';
import type {
  BudgetProgress,
  GoalProgress,
  ReconciliationDto,
  UpcomingOccurrence,
} from '@pfos/shared';
import type { AccountView, LedgerEntryView } from '../ledger.js';
import { inPeriod } from '../ledger.js';
import { computeAccountBalance } from './balances.js';

/* --------------------------------------------------------------- budgets --- */

export interface BudgetRow {
  id: string;
  categoryId: string;
  categoryName: string;
  period: 'MONTHLY' | 'CUSTOM';
  amountMinor: number;
  startDate: string;
  endDate: string | null;
}

/**
 * Spent is read from actual EXPENSE entries in the window — never from a stored
 * counter. Section 14 of the brief: budgets sit on top of the accounting, they do
 * not replace it. Internal transfer legs are excluded, so moving ₱2,000 into
 * savings does not eat a Shopping budget.
 */
export function computeBudgetProgress(
  budget: BudgetRow,
  entries: readonly LedgerEntryView[],
  today: string,
): BudgetProgress {
  const { from, to } = budgetWindow(budget);

  let spentMinor = 0;
  for (const entry of entries) {
    if (entry.isInternal) continue;
    if (entry.direction !== 'OUT') continue;
    if (entry.categoryId !== budget.categoryId) continue;
    if (!inPeriod(entry.date, from, to)) continue;
    spentMinor += entry.amountMinor;
  }

  const remainingMinor = budget.amountMinor - spentMinor;
  const percentUsed = percentOf(spentMinor, budget.amountMinor);
  const daysRemaining = Math.max(0, daysBetween(clampToWindow(today, from, to), to) + 1);
  const dailyPaceMinor = daysRemaining > 0 ? Math.floor(Math.max(0, remainingMinor) / daysRemaining) : 0;

  let status: BudgetProgress['status'] = 'ON_TRACK';
  if (remainingMinor < 0) status = 'OVER_BUDGET';
  else if (percentUsed >= 80) status = 'WARNING';

  return {
    id: budget.id,
    categoryId: budget.categoryId,
    categoryName: budget.categoryName,
    period: budget.period,
    from,
    to,
    budgetMinor: budget.amountMinor,
    spentMinor,
    remainingMinor,
    percentUsed,
    dailyPaceMinor,
    daysRemaining,
    status,
  };
}

function budgetWindow(budget: BudgetRow): { from: string; to: string } {
  if (budget.period === 'CUSTOM' && budget.endDate) {
    return { from: budget.startDate, to: budget.endDate };
  }
  const month = budget.startDate.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: last };
}

function clampToWindow(date: string, from: string, to: string): string {
  if (date < from) return from;
  if (date > to) return to;
  return date;
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/* ----------------------------------------------------------------- goals --- */

export interface GoalRow {
  id: string;
  name: string;
  targetAmountMinor: number;
  targetDate: string | null;
  accountId: string | null;
  manualAmountMinor: number;
  notes: string | null;
  isArchived: boolean;
}

/**
 * A goal linked to an account reads that account's live balance, so transferring
 * into GoTyme - Emergency Fund moves the progress bar with zero extra input.
 * That is section 13 of the brief, and it is the reason goals store no amount.
 */
export function computeGoalProgress(
  goal: GoalRow,
  accounts: readonly AccountView[],
  entries: readonly LedgerEntryView[],
  today: string,
): GoalProgress {
  const account = goal.accountId ? accounts.find((a) => a.id === goal.accountId) ?? null : null;

  const currentAmountMinor = account
    ? computeAccountBalance(account, entries, today)
    : goal.manualAmountMinor;

  const remainingMinor = Math.max(0, goal.targetAmountMinor - currentAmountMinor);
  const daysRemaining = goal.targetDate ? Math.max(0, daysBetween(today, goal.targetDate)) : null;

  let requiredMonthlyMinor: number | null = null;
  if (goal.targetDate && remainingMinor > 0) {
    const months = Math.max(1, Math.ceil((daysRemaining ?? 0) / 30));
    requiredMonthlyMinor = Math.ceil(remainingMinor / months);
  }

  return {
    id: goal.id,
    name: goal.name,
    targetAmountMinor: goal.targetAmountMinor,
    currentAmountMinor,
    remainingMinor,
    percentComplete: Math.min(100, percentOf(currentAmountMinor, goal.targetAmountMinor)),
    targetDate: goal.targetDate,
    daysRemaining,
    requiredMonthlyMinor,
    linkedAccount: account ? { id: account.id, name: account.name } : null,
    notes: goal.notes,
    isArchived: goal.isArchived,
  };
}

/* -------------------------------------------------------- reconciliation --- */

export interface ReconciliationRow {
  id: string;
  weekOf: string;
  accountId: string;
  actualBalanceMinor: number;
  notes: string | null;
  createdAt: string;
}

/**
 * Workbook equivalent — Weekly Reconciliation (Week Of | Ledger Balance | Bank App
 * Balance | Match? | Notes). The sheet made the user type the ledger balance by
 * hand, which is exactly the number a ledger should be able to produce. Here it is
 * computed as of the end of the reconciliation week, so the only human input is
 * what the bank app says.
 */
export function computeReconciliation(
  row: ReconciliationRow,
  accounts: readonly AccountView[],
  entries: readonly LedgerEntryView[],
): ReconciliationDto {
  const account = accounts.find((a) => a.id === row.accountId);
  const asOf = endOfWeek(row.weekOf);
  const ledgerBalanceMinor = account ? computeAccountBalance(account, entries, asOf) : 0;
  const differenceMinor = row.actualBalanceMinor - ledgerBalanceMinor;

  return {
    id: row.id,
    weekOf: row.weekOf,
    account: { id: row.accountId, name: account?.name ?? 'Unknown account' },
    ledgerBalanceMinor,
    actualBalanceMinor: row.actualBalanceMinor,
    differenceMinor,
    status: differenceMinor === 0 ? 'MATCHED' : 'NEEDS_REVIEW',
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

/** Reconciliation weeks run Monday→Sunday; `weekOf` is the Monday. */
export function endOfWeek(weekOf: string): string {
  const d = new Date(`${weekOf}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(date: string, weekStartsOn = 1): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const shift = (d.getUTCDay() - weekStartsOn + 7) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------- recurring --- */

export interface RecurringRow {
  id: string;
  description: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amountMinor: number;
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  interval: number;
  anchorDay: number | null;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  lastPostedDate: string | null;
  accountName: string | null;
  categoryName: string | null;
}

/**
 * Next occurrence strictly after `after`.
 *
 * Month-end is handled the way a bank does it: a rule anchored on the 31st fires
 * on the 28th/29th/30th in shorter months rather than skipping them. Naive date
 * arithmetic (`setMonth(+1)` on Jan 31) rolls into March and silently drops a
 * month's allowance, which is the bug this function exists to avoid.
 */
export function nextOccurrence(rule: RecurringRow, after: string): string | null {
  if (!rule.isActive) return null;

  let cursor = rule.startDate > after ? rule.startDate : after;
  let candidate = rule.startDate;
  let guard = 0;

  while (candidate <= cursor && guard < 1000) {
    candidate = advance(candidate, rule, guard + 1);
    guard += 1;
  }

  if (guard >= 1000) return null;
  if (rule.endDate && candidate > rule.endDate) return null;
  return candidate;
}

function advance(_current: string, rule: RecurringRow, step: number): string {
  const start = new Date(`${rule.startDate}T00:00:00.000Z`);
  const n = step * rule.interval;

  switch (rule.frequency) {
    case 'DAILY': {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    }
    case 'WEEKLY': {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + n * 7);
      return d.toISOString().slice(0, 10);
    }
    case 'BIWEEKLY': {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + n * 14);
      return d.toISOString().slice(0, 10);
    }
    case 'MONTHLY':
      return addMonthsClamped(start, n, rule.anchorDay);
    case 'QUARTERLY':
      return addMonthsClamped(start, n * 3, rule.anchorDay);
    case 'YEARLY':
      return addMonthsClamped(start, n * 12, rule.anchorDay);
  }
}

/** Adds months while clamping the day to the target month's length. */
export function addMonthsClamped(from: Date, months: number, anchorDay: number | null): string {
  const desiredDay = anchorDay && anchorDay >= 1 ? anchorDay : from.getUTCDate();
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const daysInTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(desiredDay, daysInTarget);
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Every occurrence of every active rule inside a window, for "Upcoming". */
export function upcomingOccurrences(
  rules: readonly RecurringRow[],
  from: string,
  to: string,
  limit = 50,
): UpcomingOccurrence[] {
  const out: UpcomingOccurrence[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;
    let cursor = previousDayOf(from);
    for (let i = 0; i < 60; i += 1) {
      const next = nextOccurrence(rule, cursor);
      if (!next || next > to) break;
      out.push({
        ruleId: rule.id,
        description: rule.description,
        type: rule.type,
        amountMinor: rule.amountMinor,
        date: next,
        accountName: rule.accountName,
        categoryName: rule.categoryName,
      });
      cursor = next;
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, limit);
}

function previousDayOf(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
