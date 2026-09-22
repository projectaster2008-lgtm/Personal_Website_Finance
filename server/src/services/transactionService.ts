/**
 * Transaction service.
 *
 * THE central invariant of this application lives here: a transaction and its
 * ledger entries are written, rewritten and deleted inside a single database
 * transaction, and entries are ALWAYS regenerated from `buildPostings` rather
 * than patched. There is no code path that edits an entry in place.
 *
 * That is what makes section 27 of the brief true by construction. When a user
 * changes an expense from ₱1,000 to ₱1,500, we do not hunt down and adjust an
 * account balance, a category total, a budget counter and a net worth figure —
 * none of those are stored. We rewrite two rows and every derived number moves
 * on the next read.
 */
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { Paginated, TransactionDto, TransactionQuery, TransactionType } from '@pfos/shared';
import { TRANSFER_FEE_CATEGORY } from '@pfos/shared';
import { prisma } from '../lib/prisma.js';
import { badRequest, notFound, unprocessable } from '../lib/errors.js';
import { toDateColumn, toDateString } from '../lib/date.js';
import { buildPostings, type PostingInput } from '../domain/engine/postings.js';

export interface WriteTransactionInput {
  type: TransactionType;
  date: string;
  description: string;
  amountMinor: number;
  notes?: string;
  merchant?: string;
  tags?: string[];
  externalRef?: string;
  accountId?: string;
  categoryId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  feeMinor?: number;
  feeAccount?: 'FROM' | 'TO';
  recurringRuleId?: string;
  importFingerprint?: string;
}

const TX_INCLUDE = {
  account: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, kind: true } },
  fromAccount: { select: { id: true, name: true } },
  toAccount: { select: { id: true, name: true } },
} satisfies Prisma.TransactionInclude;

/* ----------------------------------------------------------------- read --- */

export async function listTransactions(
  userId: string,
  query: TransactionQuery,
): Promise<Paginated<TransactionDto>> {
  const where = buildWhere(userId, query);

  const orderBy: Prisma.TransactionOrderByWithRelationInput[] =
    query.sort === 'amount'
      ? [{ amountMinor: query.order }, { date: 'desc' }]
      : query.sort === 'createdAt'
        ? [{ createdAt: query.order }]
        : [{ date: query.order }, { createdAt: query.order }];

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: TX_INCLUDE,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    data: rows.map(toDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getTransaction(userId: string, id: string): Promise<TransactionDto> {
  const row = await prisma.transaction.findFirst({ where: { id, userId }, include: TX_INCLUDE });
  if (!row) throw notFound('Transaction');
  return toDto(row);
}

function buildWhere(userId: string, query: TransactionQuery): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = { userId };

  if (query.from || query.to) {
    where.date = {
      ...(query.from ? { gte: toDateColumn(query.from) } : {}),
      ...(query.to ? { lte: toDateColumn(query.to) } : {}),
    };
  }
  if (query.type) where.type = query.type as any;
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.tag) where.tags = { has: query.tag };

  if (query.minAmountMinor != null || query.maxAmountMinor != null) {
    where.amountMinor = {
      ...(query.minAmountMinor != null ? { gte: query.minAmountMinor } : {}),
      ...(query.maxAmountMinor != null ? { lte: query.maxAmountMinor } : {}),
    };
  }

  // An account filter must catch transfers too, where the account sits in
  // fromAccountId / toAccountId rather than accountId.
  if (query.accountId) {
    where.OR = [
      { accountId: query.accountId },
      { fromAccountId: query.accountId },
      { toAccountId: query.accountId },
    ];
  }

  if (query.search) {
    const search = query.search.trim();
    const textMatch: Prisma.TransactionWhereInput[] = [
      { description: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
      { merchant: { contains: search, mode: 'insensitive' } },
    ];
    // Combine with any account filter using AND so both constraints apply.
    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), { OR: textMatch }];
  }

  return where;
}

/* ---------------------------------------------------------------- write --- */

export async function createTransaction(
  userId: string,
  input: WriteTransactionInput,
): Promise<TransactionDto> {
  await assertReferencesBelongToUser(userId, input);
  const postings = await resolvePostings(userId, input);

  const created = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId,
        date: toDateColumn(input.date),
        type: input.type,
        description: input.description,
        amountMinor: input.amountMinor,
        notes: input.notes ?? null,
        merchant: input.merchant ?? null,
        tags: input.tags ?? [],
        externalRef: input.externalRef ?? null,
        accountId: input.type === 'TRANSFER' ? null : (input.accountId ?? null),
        categoryId: input.type === 'TRANSFER' ? null : (input.categoryId ?? null),
        fromAccountId: input.type === 'TRANSFER' ? (input.fromAccountId ?? null) : null,
        toAccountId: input.type === 'TRANSFER' ? (input.toAccountId ?? null) : null,
        feeMinor: input.type === 'TRANSFER' ? (input.feeMinor ?? 0) : 0,
        recurringRuleId: input.recurringRuleId ?? null,
        importFingerprint: input.importFingerprint ?? null,
      },
      include: TX_INCLUDE,
    });

    await tx.ledgerEntry.createMany({
      data: postings.map((posting) => ({
        userId,
        transactionId: transaction.id,
        accountId: posting.accountId,
        categoryId: posting.categoryId,
        date: toDateColumn(input.date),
        amountMinor: posting.amountMinor,
        direction: posting.direction,
        leg: posting.leg,
        isInternal: posting.isInternal,
      })),
    });

    return transaction;
  });

  return toDto(created);
}

/**
 * Update = delete every entry and re-post. Slightly more writes than patching,
 * and worth every one of them: a partial update is how a ledger ends up with a
 * transfer whose legs no longer agree.
 */
export async function updateTransaction(
  userId: string,
  id: string,
  input: WriteTransactionInput,
): Promise<TransactionDto> {
  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw notFound('Transaction');

  await assertReferencesBelongToUser(userId, input);
  const postings = await resolvePostings(userId, input);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { transactionId: id, userId } });

    const transaction = await tx.transaction.update({
      where: { id },
      data: {
        date: toDateColumn(input.date),
        type: input.type,
        description: input.description,
        amountMinor: input.amountMinor,
        notes: input.notes ?? null,
        merchant: input.merchant ?? null,
        tags: input.tags ?? [],
        externalRef: input.externalRef ?? null,
        accountId: input.type === 'TRANSFER' ? null : (input.accountId ?? null),
        categoryId: input.type === 'TRANSFER' ? null : (input.categoryId ?? null),
        fromAccountId: input.type === 'TRANSFER' ? (input.fromAccountId ?? null) : null,
        toAccountId: input.type === 'TRANSFER' ? (input.toAccountId ?? null) : null,
        feeMinor: input.type === 'TRANSFER' ? (input.feeMinor ?? 0) : 0,
      },
      include: TX_INCLUDE,
    });

    await tx.ledgerEntry.createMany({
      data: postings.map((posting) => ({
        userId,
        transactionId: id,
        accountId: posting.accountId,
        categoryId: posting.categoryId,
        date: toDateColumn(input.date),
        amountMinor: posting.amountMinor,
        direction: posting.direction,
        leg: posting.leg,
        isInternal: posting.isInternal,
      })),
    });

    return transaction;
  });

  return toDto(updated);
}

/**
 * Deletes a transaction and its entries, so every derived total reverts.
 *
 * The entries are removed EXPLICITLY rather than by relying on the database's
 * ON DELETE CASCADE. Postgres would cascade correctly, but an orphaned ledger
 * entry is the worst failure mode this system has — it keeps moving balances
 * with no transaction left to explain or undo it — so cleanup is never
 * delegated to the storage layer. It also keeps the behaviour identical when
 * running against a non-cascading store.
 */
export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const existing = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!existing) throw notFound('Transaction');

  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { transactionId: id, userId } });
    await tx.transaction.delete({ where: { id } });
  });
}

/** Copies a transaction to today, which is how most repeat spending gets entered. */
export async function duplicateTransaction(
  userId: string,
  id: string,
  date: string,
): Promise<TransactionDto> {
  const source = await prisma.transaction.findFirst({ where: { id, userId } });
  if (!source) throw notFound('Transaction');

  return createTransaction(userId, {
    type: source.type,
    date,
    description: source.description,
    amountMinor: source.amountMinor,
    notes: source.notes ?? undefined,
    merchant: source.merchant ?? undefined,
    tags: source.tags,
    accountId: source.accountId ?? undefined,
    categoryId: source.categoryId ?? undefined,
    fromAccountId: source.fromAccountId ?? undefined,
    toAccountId: source.toAccountId ?? undefined,
    feeMinor: source.feeMinor,
  });
}

/* ------------------------------------------------------------- internals --- */

/**
 * Ownership check.
 *
 * Every id in the payload is verified to belong to the caller BEFORE any write.
 * Without this, a user could post a transaction into another user's account by
 * guessing an id — the foreign key alone would happily accept it.
 */
async function assertReferencesBelongToUser(
  userId: string,
  input: WriteTransactionInput,
): Promise<void> {
  const accountIds = [input.accountId, input.fromAccountId, input.toAccountId].filter(
    (value): value is string => Boolean(value),
  );

  if (accountIds.length > 0) {
    const count = await prisma.account.count({ where: { id: { in: accountIds }, userId } });
    if (count !== new Set(accountIds).size) throw notFound('Account');
  }

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, userId },
      select: { kind: true },
    });
    if (!category) throw notFound('Category');

    // A category's kind must match the direction of the money. Enforced here so
    // bad data cannot enter the ledger at all, rather than being flagged later.
    if (input.type === 'INCOME' && category.kind !== 'INCOME') {
      throw unprocessable('Pick an income category for money coming in');
    }
    if (input.type === 'EXPENSE' && category.kind !== 'EXPENSE') {
      throw unprocessable('Pick an expense category for money going out');
    }
  }

  if (input.type === 'TRANSFER' && input.fromAccountId === input.toAccountId) {
    throw badRequest('Source and destination must be different accounts');
  }
}

/** Resolves the Transfer Fees category id lazily — only a fee needs it. */
async function resolvePostings(userId: string, input: WriteTransactionInput) {
  let transferFeeCategoryId: string | null = null;

  if (input.type === 'TRANSFER' && (input.feeMinor ?? 0) > 0) {
    const category = await prisma.category.findFirst({
      where: { userId, name: TRANSFER_FEE_CATEGORY, kind: 'EXPENSE' },
      select: { id: true },
    });
    if (!category) {
      throw unprocessable(
        `Create an expense category called "${TRANSFER_FEE_CATEGORY}" before recording transfer fees`,
      );
    }
    transferFeeCategoryId = category.id;
  }

  const postingInput: PostingInput = {
    type: input.type,
    amountMinor: input.amountMinor,
    accountId: input.accountId,
    categoryId: input.categoryId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    feeMinor: input.feeMinor,
    feeAccount: input.feeAccount,
    transferFeeCategoryId,
  };

  return buildPostings(postingInput);
}

/** Deterministic fingerprint so re-importing the same CSV is a no-op. */
export function fingerprint(input: {
  date: string;
  amountMinor: number;
  description: string;
  accountId?: string;
}): string {
  return createHash('sha256')
    .update([input.date, input.amountMinor, input.description.trim().toLowerCase(), input.accountId ?? ''].join('|'))
    .digest('hex')
    .slice(0, 32);
}

type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof TX_INCLUDE }>;

export function toDto(row: TransactionRow): TransactionDto {
  return {
    id: row.id,
    date: toDateString(row.date),
    type: row.type,
    description: row.description,
    amountMinor: row.amountMinor,
    notes: row.notes,
    merchant: row.merchant,
    tags: row.tags,
    externalRef: row.externalRef,
    recurringRuleId: row.recurringRuleId,
    account: row.account,
    category: row.category,
    fromAccount: row.fromAccount,
    toAccount: row.toAccount,
    feeMinor: row.feeMinor,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
