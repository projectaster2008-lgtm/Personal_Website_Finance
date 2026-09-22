/**
 * Cash Flow Statement, Personal Balance Sheet, Changes in Net Worth, and the
 * 12-month trend. These four reports must agree with each other; the cross-checks
 * live in `integrity.ts` and run on every dashboard load.
 */
import type {
  BalanceSheet,
  CashFlowStatement,
  ChangesInNetWorth,
  IncomeStatement,
  ResolvedPeriod,
  TrendPoint,
} from '@pfos/shared';
import type { AccountView, AdjustmentView, LedgerEntryView, LiabilityView } from '../ledger.js';
import { effectOf, inPeriod, isOperating, onOrBefore, strictlyBefore } from '../ledger.js';
import { computeAccountBalances, computeTotalCash } from './balances.js';
import { computeIncomeStatement, type CategoryRef } from './incomeStatement.js';

/* ------------------------------------------------------------- cash flow --- */

/**
 * Workbook equivalent — Cash Flow Statement:
 *   B8  = Income Statement!B13                       (income received)
 *   B9  = -Income Statement!B23                      (expenses paid)
 *   B10 = B8 + B9                                    (net operating)
 *   B13 = SUMIFS(MoneyIn, Account, "GoTyme - Emergency Fund", Type, "Transfer", ...)
 *   B18 = B10                                        (net change in total cash)
 *
 * Note B18 = B10 exactly: savings movement is a memo line and is deliberately NOT
 * added. We preserve that, and additionally prove it by computing opening and
 * closing cash independently — if `closing - opening !== netChange`, the
 * integrity check fires rather than the number quietly being wrong.
 */
export function computeCashFlow(
  entries: readonly LedgerEntryView[],
  accounts: readonly AccountView[],
  categories: readonly CategoryRef[],
  period: ResolvedPeriod,
): CashFlowStatement {
  const statement = computeIncomeStatement(entries, categories, period);

  const savingsAccounts = accounts.filter((a) => a.role === 'VAULT' || a.type === 'SAVINGS');
  const lines = savingsAccounts.map((account) => {
    let movedInMinor = 0;
    for (const entry of entries) {
      if (entry.accountId !== account.id) continue;
      if (entry.leg !== 'TRANSFER_IN') continue;
      if (!inPeriod(entry.date, period.from, period.to)) continue;
      movedInMinor += entry.amountMinor;
    }
    return { accountId: account.id, accountName: account.name, movedInMinor };
  });

  const openingBalances = computeAccountBalances(accounts, entries, previousDay(period.from));
  const closingBalances = computeAccountBalances(accounts, entries, period.to);
  const openingCashMinor = computeTotalCash(openingBalances);
  const closingCashMinor = computeTotalCash(closingBalances);

  // Capital contributed or withdrawn during the current period:
  const capitalInPeriod = entries
    .filter((e) => (e.transactionType === 'CAPITAL' || e.categoryName === "Owner's Capital") && inPeriod(e.date, period.from, period.to))
    .reduce((s, e) => s + (e.direction === 'IN' ? e.amountMinor : -e.amountMinor), 0);

  const totalMovedToSavingsMinor = lines.reduce((s, l) => s + l.movedInMinor, 0);

  return {
    period,
    operating: {
      incomeReceivedMinor: statement.totalIncomeMinor,
      expensesPaidMinor: -statement.totalExpensesMinor,
      netOperatingMinor: statement.netIncomeMinor,
    },
    savingActivities: { lines, totalMovedToSavingsMinor },
    netChangeInCashMinor: statement.netIncomeMinor + capitalInPeriod,
    openingCashMinor,
    closingCashMinor,
    explanation:
      totalMovedToSavingsMinor > 0
        ? 'Money moved into your savings pockets is shown as a memo. Your account balances changed, but your total cash did not, because the money is still yours.'
        : 'Net change in total cash equals your net income for this period. Transfers between your own accounts never change this number.',
  };
}

/* --------------------------------------------------------- balance sheet --- */

/**
 * Workbook equivalent — Personal Balance Sheet:
 *   B8:B13 per-account SUMIFS as of the period end
 *   B14    = SUM(B8:B13)
 *   B17    = manual liabilities
 *   B19    = B14 - B17
 *   A20    = IF(ROUND(B19,2)=ROUND('Changes in Net Worth'!B10,2), "✓ Matches", "⚠ ...")
 *
 * The ✓/⚠ indicator is preserved as a structured `reconciliation` object so the UI
 * can render it as a badge and the integrity endpoint can surface it as an alert.
 */
export function computeBalanceSheet(
  entries: readonly LedgerEntryView[],
  accounts: readonly AccountView[],
  liabilities: readonly LiabilityView[],
  adjustments: readonly AdjustmentView[],
  categories: readonly CategoryRef[],
  asOf: string,
  periodStart: string,
): BalanceSheet {
  const balances = computeAccountBalances(accounts, entries, asOf);

  const assets = balances
    .filter((b) => b.includeInNetWorth)
    .map((b) => ({
      accountId: b.accountId,
      name: b.name,
      role: b.role as BalanceSheet['assets'][number]['role'],
      balanceMinor: b.balanceMinor,
    }));

  const totalAssetsMinor = assets.reduce((s, a) => s + a.balanceMinor, 0);

  const openLiabilities = liabilities.filter((l) => !l.isSettled && l.createdDate <= asOf);
  const totalLiabilitiesMinor = openLiabilities.reduce((s, l) => s + l.balanceMinor, 0);
  const netWorthMinor = totalAssetsMinor - totalLiabilitiesMinor;

  const changes = computeChangesInNetWorth(
    entries,
    accounts,
    liabilities,
    adjustments,
    categories,
    { from: periodStart, to: asOf, label: 'reconciliation' },
  );

  const differenceMinor = netWorthMinor - changes.endingNetWorthMinor;

  return {
    asOf,
    assets,
    totalAssetsMinor,
    liabilities: openLiabilities.map((l) => ({
      id: l.id,
      name: l.name,
      balanceMinor: l.balanceMinor,
    })),
    totalLiabilitiesMinor,
    netWorthMinor,
    reconciliation: {
      balanceSheetNetWorthMinor: netWorthMinor,
      statementNetWorthMinor: changes.endingNetWorthMinor,
      differenceMinor,
      matches: differenceMinor === 0,
    },
  };
}

/* --------------------------------------------------- changes in net worth --- */

/**
 * Workbook equivalent — Changes in Net Worth:
 *   B7  = SUMIFS(MoneyIn, Date, "<"&Start) - SUMIFS(MoneyOut, Date, "<"&Start)
 *   B8  = Income Statement!B25
 *   B9  = manual adjustment
 *   B10 = B7 + B8 + B9
 *
 * The sheet's B7 summed ALL rows including transfer rows, which is only correct
 * because a spreadsheet transfer had a single leg. With true two-leg transfers the
 * internal legs cancel, so the same formula stays correct and now also survives
 * transfers being recorded properly. We additionally subtract opening liabilities
 * so beginning net worth is net worth, not just cash.
 */
export function computeChangesInNetWorth(
  entries: readonly LedgerEntryView[],
  accounts: readonly AccountView[],
  liabilities: readonly LiabilityView[],
  adjustments: readonly AdjustmentView[],
  categories: readonly CategoryRef[],
  period: ResolvedPeriod,
): ChangesInNetWorth {
  const openingBalances = computeAccountBalances(accounts, entries, previousDay(period.from));
  const openingCash = computeTotalCash(openingBalances);

  const openingLiabilities = liabilities
    .filter((l) => !l.isSettled && strictlyBefore(l.createdDate, period.from))
    .reduce((s, l) => s + l.balanceMinor, 0);

  // Adjustments booked before the period are already part of the opening picture.
  const priorAdjustments = adjustments
    .filter((a) => strictlyBefore(a.date, period.from))
    .reduce((s, a) => s + a.amountMinor, 0);

  const beginningNetWorthMinor = openingCash - openingLiabilities + priorAdjustments;

  // Capital contributed or withdrawn during the current period:
  const capitalInPeriod = entries
    .filter((e) => (e.transactionType === 'CAPITAL' || e.categoryName === "Owner's Capital") && inPeriod(e.date, period.from, period.to))
    .reduce((s, e) => s + (e.direction === 'IN' ? e.amountMinor : -e.amountMinor), 0);

  const statement = computeIncomeStatement(entries, categories, period);

  const periodAdjustments = adjustments.filter((a) => inPeriod(a.date, period.from, period.to));
  const adjustmentsMinor = periodAdjustments.reduce((s, a) => s + a.amountMinor, 0);

  // New debts taken on during the period reduce net worth without touching income.
  const newLiabilities = liabilities
    .filter((l) => !l.isSettled && inPeriod(l.createdDate, period.from, period.to))
    .reduce((s, l) => s + l.balanceMinor, 0);

  return {
    period,
    beginningNetWorthMinor,
    netIncomeMinor: statement.netIncomeMinor,
    adjustmentsMinor: adjustmentsMinor - newLiabilities + capitalInPeriod,
    adjustments: periodAdjustments.map((a) => ({
      id: a.id,
      date: a.date,
      amountMinor: a.amountMinor,
      reason: a.reason,
    })),
    endingNetWorthMinor:
      beginningNetWorthMinor + statement.netIncomeMinor + capitalInPeriod + adjustmentsMinor - newLiabilities,
  };
}

/* ----------------------------------------------------------------- trend --- */

/**
 * Workbook equivalent — Dashboard!A44:E55. The sheet computed each month's income
 * as `SUMIFS(MoneyIn, month) - SUMIFS(MoneyIn, Category="Internal Transfer", month)`,
 * i.e. total inflow minus internal inflow. Structurally that is the same as
 * "sum of non-internal IN legs", which is what we do — with far fewer passes.
 */
export function computeTrend(
  entries: readonly LedgerEntryView[],
  accounts: readonly AccountView[],
  liabilities: readonly LiabilityView[],
  months: readonly string[], // ["2026-07", ...] oldest first
  locale = 'en-PH',
): TrendPoint[] {
  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const month of months) byMonth.set(month, { income: 0, expenses: 0 });

  for (const entry of entries) {
    if (!isOperating(entry)) continue;
    const month = entry.date.slice(0, 7);
    const bucket = byMonth.get(month);
    if (!bucket) continue;
    if (entry.direction === 'IN') bucket.income += entry.amountMinor;
    else bucket.expenses += entry.amountMinor;
  }

  return months.map((month) => {
    const bucket = byMonth.get(month) ?? { income: 0, expenses: 0 };
    const monthEnd = endOfMonth(month);

    const balances = computeAccountBalances(accounts, entries, monthEnd);
    const cashMinor = computeTotalCash(balances);
    const liabilitiesMinor = liabilities
      .filter((l) => !l.isSettled && onOrBefore(l.createdDate, monthEnd))
      .reduce((s, l) => s + l.balanceMinor, 0);

    return {
      month,
      label: monthLabel(month, locale),
      incomeMinor: bucket.income,
      expensesMinor: bucket.expenses,
      netMinor: bucket.income - bucket.expenses,
      cashMinor,
      liabilitiesMinor,
      netWorthMinor: cashMinor - liabilitiesMinor,
    };
  });
}

/* ----------------------------------------------------------------- utils --- */

/** Sum of signed effects over a window. Used by tests and integrity checks. */
export function netMovement(
  entries: readonly LedgerEntryView[],
  from: string,
  to: string,
): number {
  let total = 0;
  for (const entry of entries) {
    if (!inPeriod(entry.date, from, to)) continue;
    total += effectOf(entry);
  }
  return total;
}

export function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function endOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export function monthLabel(month: string, locale = 'en-PH'): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The N months ending with `endMonth`, oldest first. */
export function monthRange(endMonth: string, count: number): string[] {
  const [y, m] = endMonth.split('-').map(Number);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}
