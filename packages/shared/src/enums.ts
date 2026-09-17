/**
 * Domain enums.
 *
 * These are the vocabulary of the whole system. They are derived directly from
 * `Personal_Financial_Tracker_Fixed.xlsx` (see docs/WORKBOOK_MAPPING.md) and are
 * kept in the shared package so the API, the database layer and the React client
 * can never drift from each other.
 */

/** Transaction type. The workbook's "Type" column allowed Income/Expense/Transfer/Fee. */
export const TransactionType = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  TRANSFER: 'TRANSFER',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

/**
 * Category kind.
 *
 * INTERNAL exists because the workbook used a pseudo-category called
 * "Internal Transfer" to mark rows that must be excluded from the Income
 * Statement. We keep the concept but make it structural rather than a magic string.
 */
export const CategoryKind = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  INTERNAL: 'INTERNAL',
} as const;
export type CategoryKind = (typeof CategoryKind)[keyof typeof CategoryKind];

/** Physical/logical nature of an account. */
export const AccountType = {
  BANK: 'BANK',
  EWALLET: 'EWALLET',
  SAVINGS: 'SAVINGS',
  CASH: 'CASH',
  OTHER: 'OTHER',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

/**
 * The behavioural role of an account. This is the workbook's "Role" column and it
 * is *not* cosmetic: roles drive cash-flow classification and UI warnings.
 *
 *  - CONVENIENCE_WALLET  fully liquid, everyday spending          (MariBank)
 *  - PROFESSIONAL_ANCHOR kept clean for payroll/formal money      (UnionBank)
 *  - TRANSIT_STATION     bridge only, money should not sit here   (GCash)
 *  - VAULT               strict savings pocket, not for spending  (GoTyme funds)
 *  - DAILY_WALLET        physical cash                            (Physical Wallet)
 */
export const AccountRole = {
  CONVENIENCE_WALLET: 'CONVENIENCE_WALLET',
  PROFESSIONAL_ANCHOR: 'PROFESSIONAL_ANCHOR',
  TRANSIT_STATION: 'TRANSIT_STATION',
  VAULT: 'VAULT',
  DAILY_WALLET: 'DAILY_WALLET',
  OTHER: 'OTHER',
} as const;
export type AccountRole = (typeof AccountRole)[keyof typeof AccountRole];

/** Human labels for roles, reused by the UI so wording stays consistent. */
export const ACCOUNT_ROLE_LABEL: Record<AccountRole, string> = {
  CONVENIENCE_WALLET: 'Convenience Wallet',
  PROFESSIONAL_ANCHOR: 'Professional Anchor',
  TRANSIT_STATION: 'Transit Station',
  VAULT: 'The Vault',
  DAILY_WALLET: 'Daily Wallet',
  OTHER: 'Other',
};

/**
 * A ledger entry leg. Every transaction explodes into one or more legs; legs are
 * the only thing reports ever read.
 *
 *  - PRIMARY       the single leg of an income or expense
 *  - TRANSFER_OUT  money leaving the source account of a transfer
 *  - TRANSFER_IN   money arriving in the destination account of a transfer
 *  - FEE           a real expense charged while performing a transfer
 */
export const LedgerLeg = {
  PRIMARY: 'PRIMARY',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  FEE: 'FEE',
} as const;
export type LedgerLeg = (typeof LedgerLeg)[keyof typeof LedgerLeg];

/** Direction of a ledger entry against its account. Mirrors Money In / Money Out. */
export const Direction = {
  IN: 'IN',
  OUT: 'OUT',
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

/** Budget period granularity. */
export const BudgetPeriod = {
  MONTHLY: 'MONTHLY',
  CUSTOM: 'CUSTOM',
} as const;
export type BudgetPeriod = (typeof BudgetPeriod)[keyof typeof BudgetPeriod];

/** Recurrence frequency for recurring rules. */
export const Frequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY',
} as const;
export type Frequency = (typeof Frequency)[keyof typeof Frequency];

/** Dashboard / report period presets. */
export const PeriodPreset = {
  THIS_WEEK: 'THIS_WEEK',
  THIS_MONTH: 'THIS_MONTH',
  LAST_MONTH: 'LAST_MONTH',
  THIS_YEAR: 'THIS_YEAR',
  CUSTOM: 'CUSTOM',
} as const;
export type PeriodPreset = (typeof PeriodPreset)[keyof typeof PeriodPreset];

/** Reconciliation outcome. */
export const ReconStatus = {
  MATCHED: 'MATCHED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
} as const;
export type ReconStatus = (typeof ReconStatus)[keyof typeof ReconStatus];

export const DEFAULT_CURRENCY = 'PHP';
export const DEFAULT_TIMEZONE = 'Asia/Manila';
export const DEFAULT_LOCALE = 'en-PH';

/** Category name the workbook used to flag internal money movement. */
export const INTERNAL_TRANSFER_CATEGORY = 'Internal Transfer';
/** Category the workbook used for fees paid to move your own money. */
export const TRANSFER_FEE_CATEGORY = 'Transfer Fees';
