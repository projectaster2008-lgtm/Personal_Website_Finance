/**
 * API response contracts.
 *
 * Every number ending in `Minor` is an integer count of minor units (centavos).
 * Every field named `date`, `from`, `to`, `weekOf` or `asOf` is a `YYYY-MM-DD`
 * string in the user's timezone. Timestamps (`createdAt`) are full ISO strings.
 */
import type {
  AccountRole,
  AccountType,
  BudgetPeriod,
  CategoryKind,
  Direction,
  Frequency,
  LedgerLeg,
  ReconStatus,
  TransactionType,
} from './enums.js';

/* --------------------------------------------------------------- envelope --- */

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/* --------------------------------------------------------------- entities --- */

export interface UserDto {
  id: string;
  email: string;
  name: string | null;
  currency: string;
  timezone: string;
  locale: string;
  weekStartsOn: number;
  createdAt: string;
}

export interface AuthResponse {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AccountDto {
  id: string;
  name: string;
  type: AccountType;
  role: AccountRole;
  notes: string | null;
  openingBalanceMinor: number;
  openingBalanceDate: string | null;
  /** Derived from ledger entries. Never stored. */
  currentBalanceMinor: number;
  includeInNetWorth: boolean;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface CategoryDto {
  id: string;
  name: string;
  kind: CategoryKind;
  description: string | null;
  color: string | null;
  icon: string | null;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
}

export interface TransactionDto {
  id: string;
  date: string;
  type: TransactionType;
  description: string;
  amountMinor: number;
  notes: string | null;
  merchant: string | null;
  tags: string[];
  externalRef: string | null;
  recurringRuleId: string | null;
  /** Income and expense only. */
  account: { id: string; name: string } | null;
  category: { id: string; name: string; kind: CategoryKind } | null;
  /** Transfers only. */
  fromAccount: { id: string; name: string } | null;
  toAccount: { id: string; name: string } | null;
  feeMinor: number;
  createdAt: string;
  updatedAt: string;
}

/** A transaction as it appears inside one account's register, with running balance. */
export interface AccountLedgerRow extends TransactionDto {
  direction: Direction;
  leg: LedgerLeg;
  /** Signed effect on this account: +in, -out. */
  effectMinor: number;
  /** Balance of this account after this entry, oldest-first. */
  runningBalanceMinor: number;
}

/* ---------------------------------------------------------------- period --- */

export interface ResolvedPeriod {
  from: string;
  to: string;
  label: string;
}

/* --------------------------------------------------------------- reports --- */

export interface CategoryLine {
  categoryId: string | null;
  name: string;
  amountMinor: number;
  /** Share of the section total, 0–100 with one decimal. */
  percent: number;
  transactionCount: number;
}

export interface IncomeStatement {
  period: ResolvedPeriod;
  income: CategoryLine[];
  totalIncomeMinor: number;
  expenses: CategoryLine[];
  totalExpensesMinor: number;
  netIncomeMinor: number;
  /** Excluded from the statement, shown as context so the user trusts the number. */
  internalTransfersMinor: number;
  internalTransferCount: number;
}

export interface CashFlowStatement {
  period: ResolvedPeriod;
  operating: {
    incomeReceivedMinor: number;
    expensesPaidMinor: number;
    netOperatingMinor: number;
  };
  /** Memo section: reallocation between owned accounts, never added to cash. */
  savingActivities: {
    lines: { accountId: string; accountName: string; movedInMinor: number }[];
    totalMovedToSavingsMinor: number;
  };
  netChangeInCashMinor: number;
  openingCashMinor: number;
  closingCashMinor: number;
  explanation: string;
}

export interface BalanceSheet {
  asOf: string;
  assets: { accountId: string; name: string; role: AccountRole; balanceMinor: number }[];
  totalAssetsMinor: number;
  liabilities: { id: string; name: string; balanceMinor: number }[];
  totalLiabilitiesMinor: number;
  netWorthMinor: number;
  /** Cross-check against the Statement of Changes in Net Worth. */
  reconciliation: {
    balanceSheetNetWorthMinor: number;
    statementNetWorthMinor: number;
    differenceMinor: number;
    matches: boolean;
  };
}

export interface ChangesInNetWorth {
  period: ResolvedPeriod;
  beginningNetWorthMinor: number;
  netIncomeMinor: number;
  adjustmentsMinor: number;
  adjustments: { id: string; date: string; amountMinor: number; reason: string }[];
  endingNetWorthMinor: number;
}

export interface TrendPoint {
  month: string; // YYYY-MM
  label: string; // "Sep 2026"
  incomeMinor: number;
  expensesMinor: number;
  netMinor: number;
  cashMinor: number;
  liabilitiesMinor: number;
  netWorthMinor: number;
}

export interface NetWorthHistory {
  months: TrendPoint[];
  rangeMonths: number;
}

/* ------------------------------------------------------------- dashboard --- */

export interface DashboardSummary {
  period: ResolvedPeriod;
  totalCashMinor: number;
  totalLiabilitiesMinor: number;
  netWorthMinor: number;
  incomeMinor: number;
  expensesMinor: number;
  netIncomeMinor: number;
  expenseBreakdown: CategoryLine[];
  incomeSources: CategoryLine[];
  accounts: { id: string; name: string; role: AccountRole; balanceMinor: number }[];
  recentTransactions: TransactionDto[];
  trend: TrendPoint[];
  alerts: IntegrityIssue[];
}

/* --------------------------------------------------------------- budgets --- */

export interface BudgetProgress {
  id: string;
  categoryId: string;
  categoryName: string;
  period: BudgetPeriod;
  from: string;
  to: string;
  budgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  percentUsed: number;
  /** Even spend needed per remaining day to stay inside the budget. */
  dailyPaceMinor: number;
  daysRemaining: number;
  status: 'ON_TRACK' | 'WARNING' | 'OVER_BUDGET';
}

/* ----------------------------------------------------------------- goals --- */

export interface GoalProgress {
  id: string;
  name: string;
  targetAmountMinor: number;
  currentAmountMinor: number;
  remainingMinor: number;
  percentComplete: number;
  targetDate: string | null;
  daysRemaining: number | null;
  /** Monthly saving needed to land on the target date. Null without a date. */
  requiredMonthlyMinor: number | null;
  linkedAccount: { id: string; name: string } | null;
  notes: string | null;
  isArchived: boolean;
}

/* ------------------------------------------------------------- recurring --- */

export interface RecurringRuleDto {
  id: string;
  type: TransactionType;
  description: string;
  amountMinor: number;
  frequency: Frequency;
  interval: number;
  anchorDay: number | null;
  startDate: string;
  endDate: string | null;
  nextOccurrence: string | null;
  autoPost: boolean;
  isActive: boolean;
  category: { id: string; name: string } | null;
  account: { id: string; name: string } | null;
  fromAccount: { id: string; name: string } | null;
  toAccount: { id: string; name: string } | null;
  notes: string | null;
}

export interface UpcomingOccurrence {
  ruleId: string;
  description: string;
  type: TransactionType;
  amountMinor: number;
  date: string;
  accountName: string | null;
  categoryName: string | null;
}

/* -------------------------------------------------------- reconciliation --- */

export interface ReconciliationDto {
  id: string;
  weekOf: string;
  account: { id: string; name: string };
  /** Computed from the ledger as of the end of that week. */
  ledgerBalanceMinor: number;
  actualBalanceMinor: number;
  differenceMinor: number;
  status: ReconStatus;
  notes: string | null;
  createdAt: string;
}

/* ----------------------------------------------------------- integrity --- */

export interface IntegrityIssue {
  code:
    | 'NET_WORTH_MISMATCH'
    | 'CASH_FLOW_MISMATCH'
    | 'UNBALANCED_TRANSFER'
    | 'ORPHAN_ENTRY'
    | 'NEGATIVE_BALANCE'
    | 'CATEGORY_KIND_MISMATCH'
    | 'RECONCILIATION_DRIFT';
  severity: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  detail?: Record<string, unknown>;
}

export interface IntegrityReport {
  checkedAt: string;
  ok: boolean;
  issues: IntegrityIssue[];
}

/* ---------------------------------------------------------------- import --- */

export interface ImportPreviewRow {
  rowNumber: number;
  raw: string[];
  parsed: {
    date: string | null;
    description: string | null;
    amountMinor: number | null;
    type: TransactionType | null;
    categoryName: string | null;
    accountName: string | null;
  };
  issues: string[];
  isDuplicate: boolean;
}

export interface ImportPreview {
  columns: string[];
  rows: ImportPreviewRow[];
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  suggestedMapping: Record<string, number>;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: { rowNumber: number; reason: string }[];
}
