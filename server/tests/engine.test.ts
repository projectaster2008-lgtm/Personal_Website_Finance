/**
 * Excel parity + acceptance tests.
 *
 * These are the tests that matter. Section 33 of the brief names the numbers the
 * workbook currently produces, and section 44 names a six-step sequence the app
 * must survive. Both are encoded here against the real engine, with no mocking of
 * the financial logic, so a regression in posting rules or report maths fails the
 * build rather than reaching a user's net worth.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPostings,
  postingsBalance,
} from '../src/domain/engine/postings.js';
import { computeAccountBalances, computeTotalCash, computeAccountActivity } from '../src/domain/engine/balances.js';
import { computeIncomeStatement, type CategoryRef } from '../src/domain/engine/incomeStatement.js';
import {
  computeBalanceSheet,
  computeCashFlow,
  computeChangesInNetWorth,
  computeTrend,
  monthRange,
} from '../src/domain/engine/statements.js';
import { checkIntegrity } from '../src/domain/engine/integrity.js';
import { computeBudgetProgress, computeGoalProgress, nextOccurrence } from '../src/domain/engine/planning.js';
import { resolvePeriod } from '../src/domain/engine/period.js';
import type { AccountView, LedgerEntryView } from '../src/domain/ledger.js';

/* ------------------------------------------------------------- fixtures --- */

const ACCOUNTS: AccountView[] = [
  acc('mari', 'MariBank', 'CONVENIENCE_WALLET', 'BANK', 0),
  acc('union', 'UnionBank', 'PROFESSIONAL_ANCHOR', 'BANK', 1),
  acc('gcash', 'GCash', 'TRANSIT_STATION', 'EWALLET', 2),
  acc('efund', 'GoTyme - Emergency Fund', 'VAULT', 'SAVINGS', 3),
  acc('gadget', 'GoTyme - Gadget Fund', 'VAULT', 'SAVINGS', 4),
  acc('wallet', 'Physical Wallet', 'DAILY_WALLET', 'CASH', 5),
];

const CATEGORIES: CategoryRef[] = [
  cat('allowance', 'Allowance', 'INCOME', 0),
  cat('freelance', 'Freelance/Side Income', 'INCOME', 1),
  cat('gifts', 'Gifts Received/Scholarships', 'INCOME', 2),
  cat('interest', 'Interest Earned', 'INCOME', 3),
  cat('food', 'Food', 'EXPENSE', 0),
  cat('transport', 'Transportation', 'EXPENSE', 1),
  cat('load', 'Load/Subscriptions', 'EXPENSE', 2),
  cat('shopping', 'Shopping', 'EXPENSE', 3),
  cat('misc', 'Miscellaneous', 'EXPENSE', 4),
  cat('fees', 'Transfer Fees', 'EXPENSE', 5),
];

const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30', label: 'September 2026' };

/**
 * The workbook's four seeded rows, General Ledger!A6:H9.
 *
 * Note on row 6: the sheet typed it "Transfer" but categorised it "Allowance",
 * and its Income Statement keys off CATEGORY, so the sheet counts it as ₱2,000 of
 * Allowance income — which is how it arrives at Total Income ₱2,000. We preserve
 * the sheet's arithmetic by modelling it as income, because "borrowed from uncle"
 * is money entering the user's control from outside, not a move between two
 * accounts the user already owns. (A true internal transfer has two owned
 * endpoints; this has one.)
 */
function workbookEntries(): LedgerEntryView[] {
  return [
    income('e1', '2026-09-10', 'wallet', 'allowance', 200_000, 'Borrow from uncle, to buy uniform'),
    expense('e2', '2026-09-11', 'wallet', 'misc', 100_000, 'Class Uniform'),
    expense('e3', '2026-09-12', 'wallet', 'misc', 60_000, 'PE Uniform'),
    expense('e4', '2026-09-14', 'wallet', 'food', 10_000, 'Foods, Snacks'),
  ];
}

/* --------------------------------------------------- section 33: parity --- */

describe('Excel parity — workbook seed data', () => {
  const entries = workbookEntries();

  it('reproduces Income Statement!B13, B23 and B25', () => {
    const statement = computeIncomeStatement(entries, CATEGORIES, SEPTEMBER);
    expect(statement.totalIncomeMinor).toBe(200_000); // ₱2,000
    expect(statement.totalExpensesMinor).toBe(170_000); // ₱1,700
    expect(statement.netIncomeMinor).toBe(30_000); // ₱300
  });

  it('reproduces the per-category Income Statement rows', () => {
    const s = computeIncomeStatement(entries, CATEGORIES, SEPTEMBER);
    expect(line(s.income, 'Allowance')).toBe(200_000);
    expect(line(s.income, 'Freelance/Side Income')).toBe(0);
    expect(line(s.expenses, 'Food')).toBe(10_000); // ₱100
    expect(line(s.expenses, 'Miscellaneous')).toBe(160_000); // ₱1,600
    expect(line(s.expenses, 'Transportation')).toBe(0);
    expect(line(s.expenses, 'Transfer Fees')).toBe(0);
  });

  it('reproduces Personal Balance Sheet!B8:B14 — only the wallet holds money', () => {
    const balances = computeAccountBalances(ACCOUNTS, entries, '2026-09-30');
    expect(byName(balances, 'Physical Wallet')).toBe(30_000); // ₱300
    expect(byName(balances, 'MariBank')).toBe(0);
    expect(byName(balances, 'GCash')).toBe(0);
    expect(computeTotalCash(balances)).toBe(30_000);
  });

  it('reproduces Changes in Net Worth!B7:B10', () => {
    const changes = computeChangesInNetWorth(entries, ACCOUNTS, [], [], CATEGORIES, SEPTEMBER);
    expect(changes.beginningNetWorthMinor).toBe(0);
    expect(changes.netIncomeMinor).toBe(30_000);
    expect(changes.adjustmentsMinor).toBe(0);
    expect(changes.endingNetWorthMinor).toBe(30_000);
  });

  it('reproduces Cash Flow!B10 and B18, and the ✓ match indicator', () => {
    const cf = computeCashFlow(entries, ACCOUNTS, CATEGORIES, SEPTEMBER);
    expect(cf.operating.incomeReceivedMinor).toBe(200_000);
    expect(cf.operating.expensesPaidMinor).toBe(-170_000);
    expect(cf.operating.netOperatingMinor).toBe(30_000);
    expect(cf.netChangeInCashMinor).toBe(30_000);
    expect(cf.closingCashMinor - cf.openingCashMinor).toBe(cf.netChangeInCashMinor);
  });

  it('reproduces Balance Sheet!A20 — net worth reconciles with the statement', () => {
    const bs = computeBalanceSheet(
      entries, ACCOUNTS, [], [], CATEGORIES, '2026-09-30', '2026-09-01',
    );
    expect(bs.netWorthMinor).toBe(30_000);
    expect(bs.reconciliation.matches).toBe(true);
    expect(bs.reconciliation.differenceMinor).toBe(0);
  });

  it('reproduces the Dashboard 12-month trend row for Sep 2026', () => {
    const months = monthRange('2027-06', 12);
    const trend = computeTrend(entries, ACCOUNTS, [], months);
    const sep = trend.find((t) => t.month === '2026-09')!;
    expect(sep.incomeMinor).toBe(200_000);
    expect(sep.expensesMinor).toBe(170_000);
    expect(sep.netMinor).toBe(30_000);
    expect(sep.netWorthMinor).toBe(30_000);
    // Later months carry the balance forward with no new activity, as E47:E55 do.
    expect(trend.find((t) => t.month === '2027-01')!.netWorthMinor).toBe(30_000);
    expect(trend.find((t) => t.month === '2026-08')!.netWorthMinor).toBe(0);
  });

  it('passes every integrity check on the seed data', () => {
    const report = runIntegrity(entries, '2026-09-30', SEPTEMBER);
    expect(report.ok).toBe(true);
    expect(report.issues.filter((i) => i.severity === 'ERROR')).toHaveLength(0);
  });
});

/* ------------------------------------------- section 44: final test flow --- */

describe('Acceptance — section 44 sequence', () => {
  const TEST_BANK: AccountView = acc('testbank', 'Test Bank', 'CONVENIENCE_WALLET', 'BANK', 9);
  const accounts = [...ACCOUNTS, TEST_BANK];
  const period = { from: '2026-10-01', to: '2026-10-31', label: 'October 2026' };

  const step2 = income('t1', '2026-10-01', 'testbank', 'allowance', 1_000_000, 'Allowance');
  const step3 = expense('t2', '2026-10-02', 'testbank', 'food', 200_000, 'Groceries');
  const transferOut = transfer('t3a', '2026-10-03', 'testbank', 300_000, 'OUT', 'TRANSFER_OUT', 't3');
  const transferIn = transfer('t3b', '2026-10-03', 'efund', 300_000, 'IN', 'TRANSFER_IN', 't3');
  const step5 = expense('t4', '2026-10-04', 'testbank', 'food', 50_000, 'Snacks');

  it('steps 2-3: income and expense land on the right account and totals', () => {
    const entries = [step2, step3];
    const balances = computeAccountBalances(accounts, entries, period.to);
    expect(byName(balances, 'Test Bank')).toBe(800_000); // ₱8,000

    const s = computeIncomeStatement(entries, CATEGORIES, period);
    expect(s.totalIncomeMinor).toBe(1_000_000);
    expect(s.totalExpensesMinor).toBe(200_000);
    expect(s.netIncomeMinor).toBe(800_000);
  });

  it('step 4: a transfer moves the balance but not total cash or net worth', () => {
    const before = [step2, step3];
    const after = [...before, transferOut, transferIn];

    const cashBefore = computeTotalCash(computeAccountBalances(accounts, before, period.to));
    const cashAfter = computeTotalCash(computeAccountBalances(accounts, after, period.to));
    expect(cashAfter).toBe(cashBefore); // THE invariant

    const balances = computeAccountBalances(accounts, after, period.to);
    expect(byName(balances, 'Test Bank')).toBe(500_000); // ₱5,000
    expect(byName(balances, 'GoTyme - Emergency Fund')).toBe(300_000); // +₱3,000

    // And it stays out of the income statement entirely.
    const s = computeIncomeStatement(after, CATEGORIES, period);
    expect(s.netIncomeMinor).toBe(800_000);
    expect(s.internalTransfersMinor).toBe(300_000);
    expect(s.internalTransferCount).toBe(1);

    const bsBefore = computeBalanceSheet(before, accounts, [], [], CATEGORIES, period.to, period.from);
    const bsAfter = computeBalanceSheet(after, accounts, [], [], CATEGORIES, period.to, period.from);
    expect(bsAfter.netWorthMinor).toBe(bsBefore.netWorthMinor);
  });

  it('step 5: a further expense moves every derived number together', () => {
    const entries = [step2, step3, transferOut, transferIn, step5];
    const s = computeIncomeStatement(entries, CATEGORIES, period);
    expect(line(s.expenses, 'Food')).toBe(250_000); // ₱2,500
    expect(s.netIncomeMinor).toBe(750_000); // ₱7,500
    expect(byName(computeAccountBalances(accounts, entries, period.to), 'Test Bank')).toBe(450_000);

    const cf = computeCashFlow(entries, accounts, CATEGORIES, period);
    expect(cf.netChangeInCashMinor).toBe(750_000);
    expect(cf.savingActivities.totalMovedToSavingsMinor).toBe(300_000);
    // The memo line is NOT added to cash — workbook Cash Flow!B18 = B10.
    expect(cf.closingCashMinor - cf.openingCashMinor).toBe(750_000);

    const budget = computeBudgetProgress(
      { id: 'b1', categoryId: 'food', categoryName: 'Food', period: 'MONTHLY', amountMinor: 300_000, startDate: '2026-10-01', endDate: null },
      entries, '2026-10-05',
    );
    expect(budget.spentMinor).toBe(250_000);
    expect(budget.remainingMinor).toBe(50_000);
    expect(budget.status).toBe('WARNING'); // 83.3% used
  });

  it('step 6: deleting the transaction reverts everything exactly', () => {
    const withIt = [step2, step3, transferOut, transferIn, step5];
    const without = withIt.filter((e) => e.transactionId !== step5.transactionId);

    const s = computeIncomeStatement(without, CATEGORIES, period);
    expect(s.netIncomeMinor).toBe(800_000);
    expect(line(s.expenses, 'Food')).toBe(200_000);
    expect(byName(computeAccountBalances(accounts, without, period.to), 'Test Bank')).toBe(500_000);

    const budget = computeBudgetProgress(
      { id: 'b1', categoryId: 'food', categoryName: 'Food', period: 'MONTHLY', amountMinor: 300_000, startDate: '2026-10-01', endDate: null },
      without, '2026-10-05',
    );
    expect(budget.spentMinor).toBe(200_000);
    expect(budget.status).toBe('ON_TRACK');
  });
});

/* ---------------------------------------------------------- posting rules --- */

describe('Posting rules', () => {
  it('produces one leg for income and expense', () => {
    expect(buildPostings({ type: 'INCOME', amountMinor: 100, accountId: 'a', categoryId: 'c' })).toHaveLength(1);
    expect(buildPostings({ type: 'EXPENSE', amountMinor: 100, accountId: 'a', categoryId: 'c' })).toHaveLength(1);
  });

  it('produces two balanced legs for a transfer', () => {
    const postings = buildPostings({ type: 'TRANSFER', amountMinor: 200_000, fromAccountId: 'a', toAccountId: 'b' });
    expect(postings).toHaveLength(2);
    expect(postingsBalance(postings)).toBe(true);
    expect(postings.every((p) => p.isInternal)).toBe(true);
  });

  it('adds a non-internal expense leg for a transfer fee', () => {
    const postings = buildPostings({
      type: 'TRANSFER', amountMinor: 200_000, fromAccountId: 'a', toAccountId: 'b',
      feeMinor: 1_500, transferFeeCategoryId: 'fees',
    });
    expect(postings).toHaveLength(3);
    expect(postingsBalance(postings)).toBe(true); // fee is excluded from the internal pair
    const fee = postings.find((p) => p.leg === 'FEE')!;
    expect(fee.isInternal).toBe(false);
    expect(fee.categoryId).toBe('fees');
  });

  it('rejects same-account transfers and non-positive amounts', () => {
    expect(() => buildPostings({ type: 'TRANSFER', amountMinor: 100, fromAccountId: 'a', toAccountId: 'a' })).toThrow();
    expect(() => buildPostings({ type: 'EXPENSE', amountMinor: 0, accountId: 'a', categoryId: 'c' })).toThrow();
    expect(() => buildPostings({ type: 'EXPENSE', amountMinor: -100, accountId: 'a', categoryId: 'c' })).toThrow();
  });
});

/* ------------------------------------------------------- integrity alarms --- */

describe('Integrity checks catch broken ledgers', () => {
  it('flags a transfer whose legs do not cancel', () => {
    const broken = [
      transfer('x1', '2026-09-05', 'mari', 200_000, 'OUT', 'TRANSFER_OUT', 'x1'),
      transfer('x1b', '2026-09-05', 'efund', 150_000, 'IN', 'TRANSFER_IN', 'x1'),
    ];
    const report = runIntegrity(broken, '2026-09-30', SEPTEMBER);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === 'UNBALANCED_TRANSFER')).toBe(true);
  });

  it('warns when money is filed under the wrong kind of category', () => {
    const wrong = [income('w1', '2026-09-05', 'mari', 'food', 5_000, 'Refund filed as Food')];
    const report = runIntegrity(wrong, '2026-09-30', SEPTEMBER);
    expect(report.issues.some((i) => i.code === 'CATEGORY_KIND_MISMATCH')).toBe(true);
  });

  it('warns on a negative account balance', () => {
    const overdrawn = [expense('o1', '2026-09-05', 'mari', 'food', 5_000, 'Spent money it does not have')];
    const report = runIntegrity(overdrawn, '2026-09-30', SEPTEMBER);
    expect(report.issues.some((i) => i.code === 'NEGATIVE_BALANCE')).toBe(true);
  });
});

/* -------------------------------------------------------------- planning --- */

describe('Goals track a linked account automatically', () => {
  it('moves with transfers into the linked savings account', () => {
    const entries = [
      income('g0', '2026-10-01', 'mari', 'allowance', 1_000_000, 'Allowance'),
      transfer('g1', '2026-10-02', 'mari', 800_000, 'OUT', 'TRANSFER_OUT', 'g1'),
      transfer('g1b', '2026-10-02', 'efund', 800_000, 'IN', 'TRANSFER_IN', 'g1'),
    ];
    const goal = computeGoalProgress(
      { id: 'goal1', name: 'Emergency Fund', targetAmountMinor: 3_000_000, targetDate: '2027-10-01', accountId: 'efund', manualAmountMinor: 0, notes: null, isArchived: false },
      ACCOUNTS, entries, '2026-10-05',
    );
    expect(goal.currentAmountMinor).toBe(800_000); // ₱8,000
    expect(goal.percentComplete).toBe(26.7); // matches the brief's worked example
    expect(goal.remainingMinor).toBe(2_200_000);
  });
});

describe('Recurring schedules survive month-end', () => {
  const base = {
    id: 'r1', description: 'Allowance', type: 'INCOME' as const, amountMinor: 200_000,
    interval: 1, endDate: null, isActive: true, lastPostedDate: null,
    accountName: 'MariBank', categoryName: 'Allowance',
  };

  it('fires on the 1st of each month', () => {
    const rule = { ...base, frequency: 'MONTHLY' as const, anchorDay: 1, startDate: '2026-09-01' };
    expect(nextOccurrence(rule, '2026-09-01')).toBe('2026-10-01');
    expect(nextOccurrence(rule, '2026-10-15')).toBe('2026-11-01');
  });

  it('clamps a 31st anchor to short months instead of skipping them', () => {
    const rule = { ...base, frequency: 'MONTHLY' as const, anchorDay: 31, startDate: '2027-01-31' };
    expect(nextOccurrence(rule, '2027-01-31')).toBe('2027-02-28');
    expect(nextOccurrence(rule, '2027-02-28')).toBe('2027-03-31');
  });

  it('stops after the end date', () => {
    const rule = { ...base, frequency: 'MONTHLY' as const, anchorDay: 15, startDate: '2026-09-15', endDate: '2026-11-01' };
    expect(nextOccurrence(rule, '2026-10-16')).toBeNull();
  });
});

describe('Account activity block', () => {
  it('separates income, expenses and transfer sides', () => {
    const entries = [
      income('a1', '2026-10-01', 'mari', 'allowance', 500_000, 'Allowance'),
      expense('a2', '2026-10-02', 'mari', 'food', 342_000, 'Food'),
      transfer('a3', '2026-10-03', 'mari', 100_000, 'OUT', 'TRANSFER_OUT', 'a3'),
      transfer('a3b', '2026-10-03', 'efund', 100_000, 'IN', 'TRANSFER_IN', 'a3'),
      transfer('a4', '2026-10-04', 'gcash', 50_000, 'OUT', 'TRANSFER_OUT', 'a4'),
      transfer('a4b', '2026-10-04', 'mari', 50_000, 'IN', 'TRANSFER_IN', 'a4'),
    ];
    const activity = computeAccountActivity('mari', entries, '2026-10-01', '2026-10-31');
    expect(activity.incomeMinor).toBe(500_000);
    expect(activity.expensesMinor).toBe(342_000);
    expect(activity.transfersInMinor).toBe(50_000);
    expect(activity.transfersOutMinor).toBe(100_000);
    expect(activity.netChangeMinor).toBe(108_000);
  });
});

describe('Period resolution', () => {
  it('resolves presets in the user timezone', () => {
    const now = new Date('2026-09-17T15:30:00Z'); // 23:30 in Manila
    expect(resolvePeriod({ preset: 'THIS_MONTH', timezone: 'Asia/Manila', now })).toMatchObject({
      from: '2026-09-01', to: '2026-09-30',
    });
    expect(resolvePeriod({ preset: 'LAST_MONTH', timezone: 'Asia/Manila', now })).toMatchObject({
      from: '2026-08-01', to: '2026-08-31',
    });
    expect(resolvePeriod({ preset: 'THIS_YEAR', timezone: 'Asia/Manila', now })).toMatchObject({
      from: '2026-01-01', to: '2026-12-31',
    });
  });

  it('keeps a late-night Manila transaction inside the same day', () => {
    // 2026-09-30 23:30 Manila is 15:30 UTC on the 30th; naive UTC would also say
    // the 30th here, but 2026-10-01 07:30 Manila is 23:30 UTC on Sep 30 — the case
    // that breaks month boundaries if you resolve periods in UTC.
    const now = new Date('2026-09-30T23:30:00Z'); // 07:30 Oct 1 in Manila
    expect(resolvePeriod({ preset: 'THIS_MONTH', timezone: 'Asia/Manila', now }).from).toBe('2026-10-01');
    expect(resolvePeriod({ preset: 'THIS_MONTH', timezone: 'UTC', now }).from).toBe('2026-09-01');
  });
});

/* ---------------------------------------------------------------- helpers --- */

function acc(id: string, name: string, role: string, type: string, sortOrder: number): AccountView {
  return {
    id, name, role, type, openingBalanceMinor: 0, openingBalanceDate: null,
    includeInNetWorth: true, isActive: true, sortOrder,
  };
}

function cat(id: string, name: string, kind: string, sortOrder: number): CategoryRef {
  return { id, name, kind, sortOrder, isActive: true };
}

function income(id: string, date: string, accountId: string, categoryId: string, amountMinor: number, description: string): LedgerEntryView {
  return base(id, date, accountId, amountMinor, description, {
    direction: 'IN', leg: 'PRIMARY', isInternal: false, categoryId,
    categoryKind: kindOf(categoryId), transactionType: 'INCOME',
  });
}

function expense(id: string, date: string, accountId: string, categoryId: string, amountMinor: number, description: string): LedgerEntryView {
  return base(id, date, accountId, amountMinor, description, {
    direction: 'OUT', leg: 'PRIMARY', isInternal: false, categoryId,
    categoryKind: kindOf(categoryId), transactionType: 'EXPENSE',
  });
}

function transfer(
  id: string, date: string, accountId: string, amountMinor: number,
  direction: 'IN' | 'OUT', leg: 'TRANSFER_IN' | 'TRANSFER_OUT', transactionId: string,
): LedgerEntryView {
  const entry = base(id, date, accountId, amountMinor, 'Transfer', {
    direction, leg, isInternal: true, categoryId: null, categoryKind: null, transactionType: 'TRANSFER',
  });
  // Both legs of one transfer must share a transaction id, exactly as the
  // database enforces. Getting this wrong is what the balance check catches.
  entry.transactionId = transactionId;
  return entry;
}

function base(
  id: string, date: string, accountId: string, amountMinor: number, description: string,
  rest: Pick<LedgerEntryView, 'direction' | 'leg' | 'isInternal' | 'categoryId' | 'categoryKind' | 'transactionType'>,
): LedgerEntryView {
  return {
    id, transactionId: id, date, accountId,
    accountName: ACCOUNTS.find((a) => a.id === accountId)?.name ?? 'Test Bank',
    categoryName: CATEGORIES.find((c) => c.id === rest.categoryId)?.name ?? null,
    amountMinor, description, ...rest,
  };
}

function kindOf(categoryId: string): 'INCOME' | 'EXPENSE' {
  return (CATEGORIES.find((c) => c.id === categoryId)?.kind as 'INCOME' | 'EXPENSE') ?? 'EXPENSE';
}

function line(lines: { name: string; amountMinor: number }[], name: string): number {
  return lines.find((l) => l.name === name)?.amountMinor ?? -1;
}

function byName(balances: { name: string; balanceMinor: number }[], name: string): number {
  return balances.find((b) => b.name === name)?.balanceMinor ?? -1;
}

function runIntegrity(entries: LedgerEntryView[], asOf: string, period: { from: string; to: string; label: string }) {
  const accounts = ACCOUNTS;
  return checkIntegrity({
    entries,
    accounts,
    incomeStatement: computeIncomeStatement(entries, CATEGORIES, period),
    cashFlow: computeCashFlow(entries, accounts, CATEGORIES, period),
    balanceSheet: computeBalanceSheet(entries, accounts, [], [], CATEGORIES, asOf, period.from),
    currency: 'PHP',
    asOf,
  });
}
