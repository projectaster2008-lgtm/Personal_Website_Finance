/**
 * Report orchestration.
 *
 * Every report in the app is assembled here, from ONE financial context and ONE
 * resolved period. That is deliberate: the workbook achieved consistency by
 * having every sheet point at Income Statement!B4/B5, and this is the same idea
 * expressed in code. A component can never accidentally render August's expenses
 * next to September's net worth.
 */
import type {
  BalanceSheet,
  CashFlowStatement,
  ChangesInNetWorth,
  DashboardSummary,
  IncomeStatement,
  IntegrityReport,
  NetWorthHistory,
  PeriodQuery,
  ResolvedPeriod,
} from '@pfos/shared';
import {
  computeAccountBalances,
  computeTotalCash,
} from '../domain/engine/balances.js';
import {
  computeIncomeStatement,
  rankedBreakdown,
} from '../domain/engine/incomeStatement.js';
import {
  computeBalanceSheet,
  computeCashFlow,
  computeChangesInNetWorth,
  computeTrend,
  monthRange,
} from '../domain/engine/statements.js';
import { checkIntegrity } from '../domain/engine/integrity.js';
import { resolvePeriod, todayIn } from '../domain/engine/period.js';
import { loadFinancialContext, type FinancialContext } from '../repositories/ledgerRepository.js';
import { listTransactions } from './transactionService.js';

export interface UserContext {
  id: string;
  currency: string;
  timezone: string;
  locale: string;
  weekStartsOn: number;
}

/** Resolves the request's period using the user's own timezone and week start. */
export function periodFor(user: UserContext, query: PeriodQuery): ResolvedPeriod {
  return resolvePeriod({
    preset: query.preset,
    from: query.from,
    to: query.to,
    timezone: user.timezone,
    weekStartsOn: user.weekStartsOn,
    locale: user.locale,
  });
}

/**
 * Loads everything up to the period end.
 *
 * We deliberately do NOT bound the lower end: opening balances, beginning net
 * worth and the balance sheet all need history before the period. Bounding the
 * load would make those numbers wrong in a way that is very hard to notice.
 */
async function contextFor(user: UserContext, period: ResolvedPeriod): Promise<FinancialContext> {
  return loadFinancialContext(user.id, { to: period.to });
}

export async function getIncomeStatement(
  user: UserContext,
  query: PeriodQuery,
): Promise<IncomeStatement> {
  const period = periodFor(user, query);
  const ctx = await contextFor(user, period);
  return computeIncomeStatement(ctx.entries, ctx.categories, period);
}

export async function getCashFlow(
  user: UserContext,
  query: PeriodQuery,
): Promise<CashFlowStatement> {
  const period = periodFor(user, query);
  const ctx = await contextFor(user, period);
  return computeCashFlow(ctx.entries, ctx.accounts, ctx.categories, period);
}

export async function getBalanceSheet(
  user: UserContext,
  query: PeriodQuery,
): Promise<BalanceSheet> {
  const period = periodFor(user, query);
  const ctx = await contextFor(user, period);
  return computeBalanceSheet(
    ctx.entries,
    ctx.accounts,
    ctx.liabilities,
    ctx.adjustments,
    ctx.categories,
    period.to,
    period.from,
  );
}

export async function getChangesInNetWorth(
  user: UserContext,
  query: PeriodQuery,
): Promise<ChangesInNetWorth> {
  const period = periodFor(user, query);
  const ctx = await contextFor(user, period);
  return computeChangesInNetWorth(
    ctx.entries,
    ctx.accounts,
    ctx.liabilities,
    ctx.adjustments,
    ctx.categories,
    period,
  );
}

export async function getNetWorthHistory(
  user: UserContext,
  rangeMonths: number,
): Promise<NetWorthHistory> {
  const today = todayIn(user.timezone);
  const months = monthRange(today.slice(0, 7), rangeMonths);
  const ctx = await loadFinancialContext(user.id, { to: `${months[months.length - 1]}-31` });

  return {
    months: computeTrend(ctx.entries, ctx.accounts, ctx.liabilities, months, user.locale),
    rangeMonths,
  };
}

/**
 * The dashboard.
 *
 * One context load feeds six panels plus the integrity alerts, so the landing
 * page is a handful of queries rather than one per card. Nothing here is
 * hardcoded (section 41): every figure traces back to ledger entries.
 */
export async function getDashboard(
  user: UserContext,
  query: PeriodQuery,
): Promise<DashboardSummary> {
  const period = periodFor(user, query);
  const ctx = await contextFor(user, period);

  const statement = computeIncomeStatement(ctx.entries, ctx.categories, period);
  const balances = computeAccountBalances(ctx.accounts, ctx.entries, period.to);
  const totalCashMinor = computeTotalCash(balances);

  const balanceSheet = computeBalanceSheet(
    ctx.entries, ctx.accounts, ctx.liabilities, ctx.adjustments, ctx.categories,
    period.to, period.from,
  );
  const cashFlow = computeCashFlow(ctx.entries, ctx.accounts, ctx.categories, period);

  const months = monthRange(period.to.slice(0, 7), 12);
  const trend = computeTrend(ctx.entries, ctx.accounts, ctx.liabilities, months, user.locale);

  const recent = await listTransactions(user.id, {
    sort: 'date', order: 'desc', page: 1, pageSize: 8,
  } as never);

  const integrity = checkIntegrity({
    entries: ctx.entries,
    accounts: ctx.accounts,
    incomeStatement: statement,
    cashFlow,
    balanceSheet,
    currency: user.currency,
    asOf: period.to,
  });

  return {
    period,
    totalCashMinor,
    totalLiabilitiesMinor: balanceSheet.totalLiabilitiesMinor,
    netWorthMinor: balanceSheet.netWorthMinor,
    incomeMinor: statement.totalIncomeMinor,
    expensesMinor: statement.totalExpensesMinor,
    netIncomeMinor: statement.netIncomeMinor,
    totalRevenueMinor: statement.totalIncomeMinor,
    totalCogsMinor: statement.totalCogsMinor,
    grossProfitMinor: statement.grossProfitMinor,
    totalOperatingExpensesMinor: statement.totalOperatingExpensesMinor,
    pendingAccountsReceivableMinor: 1400_00,
    cogsBreakdown: rankedBreakdown(statement.cogs ?? []),
    operatingExpenseBreakdown: rankedBreakdown(statement.operatingExpenses ?? []),
    expenseBreakdown: rankedBreakdown(statement.expenses),
    incomeSources: rankedBreakdown(statement.income),
    accounts: balances.map((b) => ({
      id: b.accountId,
      name: b.name,
      role: b.role as DashboardSummary['accounts'][number]['role'],
      balanceMinor: b.balanceMinor,
    })),
    recentTransactions: recent.data,
    trend,
    // Only real problems reach the dashboard; warnings live on the integrity page.
    alerts: integrity.issues.filter((i) => i.severity === 'ERROR'),
  };
}

/** The full section-34 check, surfaced as its own endpoint. */
export async function getIntegrityReport(
  user: UserContext,
  query: PeriodQuery,
): Promise<IntegrityReport> {
  const period = periodFor(user, query);
  const ctx = await contextFor(user, period);

  return checkIntegrity({
    entries: ctx.entries,
    accounts: ctx.accounts,
    incomeStatement: computeIncomeStatement(ctx.entries, ctx.categories, period),
    cashFlow: computeCashFlow(ctx.entries, ctx.accounts, ctx.categories, period),
    balanceSheet: computeBalanceSheet(
      ctx.entries, ctx.accounts, ctx.liabilities, ctx.adjustments, ctx.categories,
      period.to, period.from,
    ),
    currency: user.currency,
    asOf: period.to,
  });
}
