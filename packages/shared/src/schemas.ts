/**
 * Request validation schemas.
 *
 * Single source of truth for input shape. The server validates with these; the
 * React client can reuse the exact same objects for form validation, so a rule
 * can never be enforced on one side only.
 */
import { z } from 'zod';
import {
  AccountRole,
  AccountType,
  BudgetPeriod,
  CategoryKind,
  Frequency,
  PeriodPreset,
  TransactionType,
} from './enums.js';

/**
 * Builds a zod enum from a const object while KEEPING the literal union type.
 * `z.enum(Object.values(x))` alone widens to `string`, which would silently turn
 * every typed enum in the API contract into a plain string.
 */
const enumOf = <T extends Record<string, string>>(obj: T) =>
  z.enum(Object.values(obj) as [T[keyof T], ...T[keyof T][]]);

/**
 * Money on the wire is ALWAYS an integer count of minor units (centavos).
 * `12345` means PHP 123.45. A numeric string is accepted so query parameters
 * work, but a fractional value is REJECTED rather than rounded.
 *
 * This schema deliberately does NOT convert major units to minor. An earlier
 * version multiplied its input by 100, which meant a field named `amountMinor`
 * silently accepted major units and stored 100x the intended amount. Converting
 * what a human typed into minor units is the client's job — use `toMinor()`
 * from `money.ts` in the form layer, and send the integer it returns.
 */
export const amountMinorSchema = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    // Strip grouping separators and currency symbols, keep sign and decimal point
    // so a fractional input is still detected rather than silently truncated.
    const raw =
      typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.\-]/g, ''));

    if (!Number.isFinite(raw)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount must be a number' });
      return z.NEVER;
    }
    if (!Number.isInteger(raw)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Amounts are sent in centavos, so they must be whole numbers (12345 = 123.45)',
      });
      return z.NEVER;
    }
    return raw;
  })
  .pipe(z.number().int());

/** Positive money. Zero and negative amounts are rejected at the edge. */
export const positiveAmountSchema = amountMinorSchema.pipe(
  z.number().int().positive('Amount must be greater than zero'),
);

/** ISO date (YYYY-MM-DD) or full ISO timestamp; normalised to YYYY-MM-DD. */
export const dateOnlySchema = z
  .string()
  .min(8)
  .transform((value, ctx) => {
    const parsed = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
      return z.NEVER;
    }
    return parsed.toISOString().slice(0, 10);
  });

export const cuidLike = z.string().min(1, 'Required');

/* ------------------------------------------------------------------ auth --- */

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Use at least 8 characters'),
  name: z.string().min(1).max(120).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().min(1).optional(),
  /** Create the workbook's default accounts and categories for this user. */
  seedDefaults: z.boolean().default(true),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export const requestPasswordResetSchema = z.object({ email: z.string().email() });

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().min(1).optional(),
  locale: z.string().min(2).optional(),
  weekStartsOn: z.number().int().min(0).max(6).optional(),
});

/* -------------------------------------------------------------- accounts --- */

export const createAccountSchema = z.object({
  name: z.string().min(1).max(80),
  type: enumOf(AccountType),
  role: enumOf(AccountRole).default(AccountRole.OTHER),
  notes: z.string().max(1000).optional(),
  openingBalanceMinor: amountMinorSchema.default(0),
  openingBalanceDate: dateOnlySchema.optional(),
  includeInNetWorth: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});

export const updateAccountSchema = createAccountSchema.partial();

/* ------------------------------------------------------------ categories --- */

export const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
  kind: enumOf(CategoryKind),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(40).optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

/* ----------------------------------------------------------- transactions --- */

const transactionBase = {
  date: dateOnlySchema,
  description: z.string().min(1, 'Describe the transaction').max(200),
  notes: z.string().max(2000).optional(),
  merchant: z.string().max(120).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  externalRef: z.string().max(120).optional(),
  amountMinor: positiveAmountSchema,
};

export const createIncomeSchema = z.object({
  ...transactionBase,
  type: z.literal(TransactionType.INCOME),
  accountId: cuidLike,
  categoryId: cuidLike,
});

export const createExpenseSchema = z.object({
  ...transactionBase,
  type: z.literal(TransactionType.EXPENSE),
  accountId: cuidLike,
  categoryId: cuidLike,
});

/**
 * Kept as a bare ZodObject so it can sit inside a discriminated union — zod
 * rejects union members wrapped in `.refine()`. The same-account rule is applied
 * by `differentAccounts` below, on the object and on the union alike.
 */
export const transferObjectSchema = z.object({
  ...transactionBase,
  type: z.literal(TransactionType.TRANSFER),
  fromAccountId: cuidLike,
  toAccountId: cuidLike,
  /** Optional real cost of moving the money; becomes a Transfer Fees expense. */
  feeMinor: amountMinorSchema.pipe(z.number().int().min(0)).default(0),
  /** Which side pays the fee. Defaults to the source account. */
  feeAccount: z.enum(['FROM', 'TO']).default('FROM'),
});

function differentAccounts(
  value: { type: string; fromAccountId?: string; toAccountId?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.type !== TransactionType.TRANSFER) return;
  if (value.fromAccountId && value.fromAccountId === value.toAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Source and destination must be different accounts',
      path: ['toAccountId'],
    });
  }
}

export const createTransferSchema = transferObjectSchema.superRefine(differentAccounts);

/** Discriminated union: the shape of the payload depends on the type field. */
export const createTransactionSchema = z
  .discriminatedUnion('type', [createIncomeSchema, createExpenseSchema, transferObjectSchema])
  .superRefine(differentAccounts);

/** Updates replace the whole transaction, so the same union applies. */
export const updateTransactionSchema = createTransactionSchema;

export const transactionQuerySchema = z.object({
  search: z.string().max(120).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  type: enumOf(TransactionType).optional(),
  minAmountMinor: amountMinorSchema.optional(),
  maxAmountMinor: amountMinorSchema.optional(),
  tag: z.string().optional(),
  sort: z.enum(['date', 'amount', 'createdAt']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/* ---------------------------------------------------------------- period --- */

export const periodQuerySchema = z
  .object({
    preset: enumOf(PeriodPreset).default(PeriodPreset.THIS_MONTH),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((v) => v.preset !== PeriodPreset.CUSTOM || (v.from && v.to), {
    message: 'Custom periods need both from and to',
    path: ['from'],
  });

/* --------------------------------------------------------------- budgets --- */

export const createBudgetSchema = z.object({
  categoryId: cuidLike,
  amountMinor: positiveAmountSchema,
  period: enumOf(BudgetPeriod).default(BudgetPeriod.MONTHLY),
  /** For MONTHLY budgets: the first day of the month it applies to. */
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.optional(),
  rollover: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

export const updateBudgetSchema = createBudgetSchema.partial();

/* ----------------------------------------------------------------- goals --- */

export const createGoalSchema = z.object({
  name: z.string().min(1).max(80),
  targetAmountMinor: positiveAmountSchema,
  targetDate: dateOnlySchema.optional(),
  /** Progress is read from this account's balance; no manual updating. */
  accountId: cuidLike.optional(),
  /** Used only when no account is linked. */
  manualAmountMinor: amountMinorSchema.default(0),
  notes: z.string().max(500).optional(),
  isArchived: z.boolean().default(false),
});

export const updateGoalSchema = createGoalSchema.partial();

/* ------------------------------------------------------------- recurring --- */

export const createRecurringSchema = z
  .object({
    type: enumOf(TransactionType),
    description: z.string().min(1).max(200),
    amountMinor: positiveAmountSchema,
    categoryId: cuidLike.optional(),
    accountId: cuidLike.optional(),
    fromAccountId: cuidLike.optional(),
    toAccountId: cuidLike.optional(),
    frequency: enumOf(Frequency),
    interval: z.number().int().min(1).max(52).default(1),
    /** Day of month (1-31) for MONTHLY, or weekday (0-6) for WEEKLY. */
    anchorDay: z.number().int().min(0).max(31).optional(),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema.optional(),
    autoPost: z.boolean().default(false),
    isActive: z.boolean().default(true),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (v) =>
      v.type === TransactionType.TRANSFER
        ? Boolean(v.fromAccountId && v.toAccountId && v.fromAccountId !== v.toAccountId)
        : Boolean(v.accountId && v.categoryId),
    { message: 'Recurring rule is missing its accounts or category' },
  );

export const updateRecurringSchema = z.object({
  description: z.string().min(1).max(200).optional(),
  amountMinor: positiveAmountSchema.optional(),
  categoryId: cuidLike.optional(),
  accountId: cuidLike.optional(),
  fromAccountId: cuidLike.optional(),
  toAccountId: cuidLike.optional(),
  frequency: enumOf(Frequency).optional(),
  interval: z.number().int().min(1).max(52).optional(),
  anchorDay: z.number().int().min(0).max(31).optional(),
  endDate: dateOnlySchema.nullable().optional(),
  autoPost: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

/* ----------------------------------------------------------- liabilities --- */

export const createLiabilitySchema = z.object({
  name: z.string().min(1).max(80),
  balanceMinor: amountMinorSchema.pipe(z.number().int().min(0)),
  creditor: z.string().max(120).optional(),
  dueDate: dateOnlySchema.optional(),
  notes: z.string().max(500).optional(),
  isSettled: z.boolean().default(false),
});

export const updateLiabilitySchema = createLiabilitySchema.partial();

/* -------------------------------------------------------- reconciliation --- */

export const createReconciliationSchema = z.object({
  weekOf: dateOnlySchema,
  accountId: cuidLike,
  /** What the bank app actually shows. Ledger side is computed, never entered. */
  actualBalanceMinor: amountMinorSchema,
  notes: z.string().max(500).optional(),
});

export const updateReconciliationSchema = createReconciliationSchema.partial();

/* -------------------------------------------- net worth manual adjustment --- */

export const createAdjustmentSchema = z.object({
  date: dateOnlySchema,
  amountMinor: amountMinorSchema.refine((v) => v !== 0, 'Adjustment cannot be zero'),
  reason: z.string().min(1, 'Explain why this adjustment exists').max(300),
  notes: z.string().max(1000).optional(),
});

/* ---------------------------------------------------------------- import --- */

export const importPreviewSchema = z.object({
  csv: z.string().min(1),
  delimiter: z.string().length(1).default(','),
  hasHeader: z.boolean().default(true),
});

export const importCommitSchema = z.object({
  csv: z.string().min(1),
  delimiter: z.string().length(1).default(','),
  hasHeader: z.boolean().default(true),
  /** Maps a CSV column index to a domain field. */
  mapping: z.object({
    date: z.number().int().min(0),
    description: z.number().int().min(0),
    amount: z.number().int().min(0),
    type: z.number().int().min(0).optional(),
    category: z.number().int().min(0).optional(),
    account: z.number().int().min(0).optional(),
    moneyIn: z.number().int().min(0).optional(),
    moneyOut: z.number().int().min(0).optional(),
    notes: z.number().int().min(0).optional(),
  }),
  defaultAccountId: cuidLike.optional(),
  /** Rows whose fingerprint already exists are skipped rather than duplicated. */
  skipDuplicates: z.boolean().default(true),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;
export type PeriodQuery = z.infer<typeof periodQuerySchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type CreateRecurringInput = z.infer<typeof createRecurringSchema>;
export type CreateLiabilityInput = z.infer<typeof createLiabilitySchema>;
export type CreateReconciliationInput = z.infer<typeof createReconciliationSchema>;
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type ImportCommitInput = z.infer<typeof importCommitSchema>;
