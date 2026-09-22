/**
 * Posting rules: how one user-facing transaction becomes ledger entries.
 *
 * This is the single place in the codebase where that decision is made. Section
 * 26 of the brief ("never duplicate financial formulas across components") is
 * enforced by keeping this function pure and calling it from exactly one service.
 *
 * It is also where the workbook's biggest modelling gap is closed: a transfer
 * produces TWO balanced legs, so `sum(effects) === 0` and total cash cannot move.
 */
import type { Direction, LedgerLeg, TransactionType } from '@pfos/shared';

export interface PostingDraft {
  accountId: string;
  amountMinor: number;
  direction: Direction;
  leg: LedgerLeg;
  categoryId: string | null;
  isInternal: boolean;
}

export interface PostingInput {
  type: TransactionType;
  amountMinor: number;
  /** Income / expense. */
  accountId?: string | null;
  categoryId?: string | null;
  /** Transfer. */
  fromAccountId?: string | null;
  toAccountId?: string | null;
  feeMinor?: number;
  feeAccount?: 'FROM' | 'TO';
  /** Id of the user's "Transfer Fees" category; required only when feeMinor > 0. */
  transferFeeCategoryId?: string | null;
}

export class PostingError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'PostingError';
  }
}

export function buildPostings(input: PostingInput): PostingDraft[] {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new PostingError('Amount must be greater than zero', 'amountMinor');
  }

  switch (input.type) {
    case 'INCOME': {
      requireAccount(input.accountId, 'accountId');
      requireCategory(input.categoryId);
      return [
        {
          accountId: input.accountId!,
          amountMinor: input.amountMinor,
          direction: 'IN',
          leg: 'PRIMARY',
          categoryId: input.categoryId!,
          isInternal: false,
        },
      ];
    }

    case 'EXPENSE': {
      requireAccount(input.accountId, 'accountId');
      requireCategory(input.categoryId);
      return [
        {
          accountId: input.accountId!,
          amountMinor: input.amountMinor,
          direction: 'OUT',
          leg: 'PRIMARY',
          categoryId: input.categoryId!,
          isInternal: false,
        },
      ];
    }

    case 'CAPITAL': {
      requireAccount(input.accountId, 'accountId');
      return [
        {
          accountId: input.accountId!,
          amountMinor: input.amountMinor,
          direction: 'IN',
          leg: 'PRIMARY',
          categoryId: input.categoryId ?? null,
          isInternal: false,
        },
      ];
    }

    case 'TRANSFER': {
      requireAccount(input.fromAccountId, 'fromAccountId');
      requireAccount(input.toAccountId, 'toAccountId');
      if (input.fromAccountId === input.toAccountId) {
        throw new PostingError('Source and destination must be different accounts', 'toAccountId');
      }

      const postings: PostingDraft[] = [
        {
          accountId: input.fromAccountId!,
          amountMinor: input.amountMinor,
          direction: 'OUT',
          leg: 'TRANSFER_OUT',
          categoryId: null,
          isInternal: true,
        },
        {
          accountId: input.toAccountId!,
          amountMinor: input.amountMinor,
          direction: 'IN',
          leg: 'TRANSFER_IN',
          categoryId: null,
          isInternal: true,
        },
      ];

      const feeMinor = input.feeMinor ?? 0;
      if (feeMinor > 0) {
        if (!input.transferFeeCategoryId) {
          throw new PostingError('A transfer fee needs a Transfer Fees category', 'feeMinor');
        }
        // A fee is real money leaving your control, so it is an expense leg —
        // not internal. This is why the workbook kept "Transfer Fees" as an
        // expense category rather than folding it into the transfer itself.
        postings.push({
          accountId: (input.feeAccount === 'TO' ? input.toAccountId : input.fromAccountId)!,
          amountMinor: feeMinor,
          direction: 'OUT',
          leg: 'FEE',
          categoryId: input.transferFeeCategoryId,
          isInternal: false,
        });
      }

      return postings;
    }
  }
}

function requireAccount(value: string | null | undefined, field: string): void {
  if (!value) throw new PostingError('An account is required', field);
}

function requireCategory(value: string | null | undefined): void {
  if (!value) throw new PostingError('A category is required', 'categoryId');
}

/** Assertion used by tests and the integrity checker. */
export function postingsBalance(postings: readonly PostingDraft[]): boolean {
  const internal = postings.filter((p) => p.isInternal);
  if (internal.length === 0) return true;
  const net = internal.reduce(
    (sum, p) => sum + (p.direction === 'IN' ? p.amountMinor : -p.amountMinor),
    0,
  );
  return net === 0;
}
