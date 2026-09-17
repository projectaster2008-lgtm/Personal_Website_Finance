/**
 * Balances.
 *
 * Workbook equivalent — Personal Balance Sheet!B8:B13:
 *   SUMIFS(MoneyIn, Account, "MariBank", Date, "<="&AsOf)
 * - SUMIFS(MoneyOut, Account, "MariBank", Date, "<="&AsOf)
 *
 * We keep that exact semantic and add the opening balance the spreadsheet had no
 * place for. Internal transfer legs ARE included here (invariant I5): moving money
 * changes where it sits, which is precisely what an account balance measures.
 */
import type { AccountView, LedgerEntryView } from '../ledger.js';
import { effectOf, onOrBefore } from '../ledger.js';

export interface AccountBalance {
  accountId: string;
  name: string;
  role: string;
  balanceMinor: number;
  includeInNetWorth: boolean;
}

/**
 * Balance of every account as of `asOf` (inclusive).
 * Accounts with no entries still appear, carrying their opening balance.
 */
export function computeAccountBalances(
  accounts: readonly AccountView[],
  entries: readonly LedgerEntryView[],
  asOf: string,
): AccountBalance[] {
  const movement = new Map<string, number>();

  for (const entry of entries) {
    if (!onOrBefore(entry.date, asOf)) continue;
    movement.set(entry.accountId, (movement.get(entry.accountId) ?? 0) + effectOf(entry));
  }

  return accounts
    .map((account) => ({
      accountId: account.id,
      name: account.name,
      role: account.role,
      includeInNetWorth: account.includeInNetWorth,
      balanceMinor: openingApplicable(account, asOf) + (movement.get(account.id) ?? 0),
    }))
    .sort((a, b) => sortAccounts(accounts, a.accountId, b.accountId));
}

/**
 * An opening balance only counts once its date has arrived. When no date is set
 * the balance is treated as always-present (the account existed before the ledger).
 */
function openingApplicable(account: AccountView, asOf: string): number {
  if (!account.openingBalanceDate) return account.openingBalanceMinor;
  return account.openingBalanceDate <= asOf ? account.openingBalanceMinor : 0;
}

function sortAccounts(accounts: readonly AccountView[], a: string, b: string): number {
  const ia = accounts.findIndex((x) => x.id === a);
  const ib = accounts.findIndex((x) => x.id === b);
  const sa = accounts[ia]?.sortOrder ?? 0;
  const sb = accounts[ib]?.sortOrder ?? 0;
  return sa === sb ? ia - ib : sa - sb;
}

/** Balance of one account as of a date. */
export function computeAccountBalance(
  account: AccountView,
  entries: readonly LedgerEntryView[],
  asOf: string,
): number {
  let total = openingApplicable(account, asOf);
  for (const entry of entries) {
    if (entry.accountId !== account.id) continue;
    if (!onOrBefore(entry.date, asOf)) continue;
    total += effectOf(entry);
  }
  return total;
}

/**
 * Total cash = sum of asset-account balances flagged into net worth.
 *
 * Because every transfer contributes +x and -x (invariant I3), this number is
 * mathematically unchanged by internal movement. That is the guarantee section 17
 * of the brief asks the UI to explain to the user.
 */
export function computeTotalCash(balances: readonly AccountBalance[]): number {
  return balances.reduce((sum, b) => (b.includeInNetWorth ? sum + b.balanceMinor : sum), 0);
}

export interface AccountActivity {
  incomeMinor: number;
  expensesMinor: number;
  transfersInMinor: number;
  transfersOutMinor: number;
  feesMinor: number;
  netChangeMinor: number;
}

/** The per-account "This Month" block from section 12 of the brief. */
export function computeAccountActivity(
  accountId: string,
  entries: readonly LedgerEntryView[],
  from: string,
  to: string,
): AccountActivity {
  const activity: AccountActivity = {
    incomeMinor: 0,
    expensesMinor: 0,
    transfersInMinor: 0,
    transfersOutMinor: 0,
    feesMinor: 0,
    netChangeMinor: 0,
  };

  for (const entry of entries) {
    if (entry.accountId !== accountId) continue;
    if (entry.date < from || entry.date > to) continue;

    activity.netChangeMinor += effectOf(entry);

    switch (entry.leg) {
      case 'PRIMARY':
        if (entry.direction === 'IN') activity.incomeMinor += entry.amountMinor;
        else activity.expensesMinor += entry.amountMinor;
        break;
      case 'TRANSFER_IN':
        activity.transfersInMinor += entry.amountMinor;
        break;
      case 'TRANSFER_OUT':
        activity.transfersOutMinor += entry.amountMinor;
        break;
      case 'FEE':
        activity.feesMinor += entry.amountMinor;
        activity.expensesMinor += entry.amountMinor;
        break;
    }
  }

  return activity;
}

/**
 * Running balance for one account's register, oldest entry first.
 *
 * Workbook equivalent — General Ledger!H6:
 *   IF(D6="","",SUMIFS($F$6:F6,$D$6:D6,D6)-SUMIFS($G$6:G6,$D$6:D6,D6))
 * i.e. a per-account running total, not a per-sheet one. Same behaviour here,
 * computed in one pass instead of O(n²) SUMIFS.
 */
export function withRunningBalance(
  account: AccountView,
  entries: readonly LedgerEntryView[],
): { entry: LedgerEntryView; runningBalanceMinor: number }[] {
  const mine = entries
    .filter((e) => e.accountId === account.id)
    .slice()
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));

  let running = account.openingBalanceMinor;
  return mine.map((entry) => {
    running += effectOf(entry);
    return { entry, runningBalanceMinor: running };
  });
}
