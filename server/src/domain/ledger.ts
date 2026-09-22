/**
 * The ledger view model.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------
 * The workbook stored one row per transaction with two columns, "Money In" and
 * "Money Out", and every report was a `SUMIFS` over those two columns. That works
 * until you record a transfer: the sheet writes a single row (money into GoTyme)
 * with no matching row taking money out of MariBank, so Total Cash silently
 * inflates. The workbook papered over this by excluding the pseudo-category
 * "Internal Transfer" from the Income Statement, but the Balance Sheet — which
 * sums Money In minus Money Out per account — still had no offsetting leg.
 *
 * The web app fixes this at the data model. One user-facing transaction explodes
 * into one or more `LedgerEntry` rows, and a transfer always produces exactly two
 * (plus an optional fee leg). Reports read entries, never transactions. That makes
 * "money moved between your own accounts does not change total cash" a structural
 * property rather than a rule someone has to remember to apply.
 *
 * ---------------------------------------------------------------------------
 * THE INVARIANTS
 * ---------------------------------------------------------------------------
 *  I1. Every entry belongs to exactly one account and one transaction.
 *  I2. INCOME  -> 1 entry,  direction IN,  isInternal = false, category kind INCOME.
 *      EXPENSE -> 1 entry,  direction OUT, isInternal = false, category kind EXPENSE.
 *      TRANSFER-> 2 entries, equal amounts, opposite directions, isInternal = true,
 *                 + optionally 1 FEE entry, direction OUT, isInternal = false,
 *                   category kind EXPENSE ("Transfer Fees").
 *  I3. For any transfer, sum(signed amounts of its internal legs) === 0.
 *      Therefore total cash is invariant under transfers. This is checked by
 *      `checkIntegrity` and by the test suite, not assumed.
 *  I4. Income Statement reads only entries where isInternal === false.
 *  I5. Account balance reads ALL entries for that account, internal included,
 *      plus the account's opening balance.
 *
 * Everything in `domain/engine/*` is a pure function over `LedgerEntryView[]`.
 * No Prisma, no Express, no dates-from-now. That is what makes the accounting
 * testable against the workbook's own numbers.
 */
import type { CategoryKind, Direction, LedgerLeg, TransactionType } from '@pfos/shared';

/** One side of one transaction, as the engine sees it. */
export interface LedgerEntryView {
  id: string;
  transactionId: string;
  /** YYYY-MM-DD, already normalised to the user's timezone. */
  date: string;
  accountId: string;
  accountName: string;
  /** Positive integer, minor units. Sign lives in `direction`, never in the amount. */
  amountMinor: number;
  direction: Direction;
  leg: LedgerLeg;
  /** True for the two legs of a transfer. False for income, expense and fees. */
  isInternal: boolean;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: CategoryKind | null;
  transactionType: TransactionType;
  description: string;
}

/** Minimal account shape the engine needs. */
export interface AccountView {
  id: string;
  name: string;
  role: string;
  type: string;
  openingBalanceMinor: number;
  /** Entries dated before this are still counted; the opening balance is a floor, not a filter. */
  openingBalanceDate: string | null;
  includeInNetWorth: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface LiabilityView {
  id: string;
  name: string;
  balanceMinor: number;
  isSettled: boolean;
  /** Used for point-in-time net worth history. */
  createdDate: string;
}

export interface AdjustmentView {
  id: string;
  date: string;
  amountMinor: number;
  reason: string;
}

/** Signed effect of an entry on its account: IN is +, OUT is -. */
export function effectOf(entry: LedgerEntryView): number {
  return entry.direction === 'IN' ? entry.amountMinor : -entry.amountMinor;
}

/** Inclusive date-window predicate. Dates are lexicographically comparable as YYYY-MM-DD. */
export function inPeriod(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

/** Everything strictly before a date — used for opening balances and beginning net worth. */
export function strictlyBefore(date: string, boundary: string): boolean {
  return date < boundary;
}

/** Everything up to and including a date — used for "as of" balances. */
export function onOrBefore(date: string, boundary: string): boolean {
  return date <= boundary;
}

/**
 * Entries that belong on the Income Statement.
 * Mirrors the workbook's exclusion of the "Internal Transfer" category (I4),
 * but driven by the structural `isInternal` flag instead of a category name.
 */
export function isOperating(entry: LedgerEntryView): boolean {
  if (entry.isInternal) return false;
  if (entry.transactionType === 'CAPITAL') return false;
  if (entry.categoryKind === 'EQUITY') return false;
  if (entry.categoryName === "Owner's Capital") return false;
  return true;
}
