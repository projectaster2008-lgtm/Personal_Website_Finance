/**
 * The boundary between Prisma and the pure engine.
 *
 * Everything below `domain/` works on plain objects. This file is the only place
 * that knows both worlds, which is what makes the financial logic testable
 * without a database and swappable without touching the maths.
 *
 * Performance note: reports load entries for a window, not the whole ledger.
 * `loadEntries` always takes a date bound, and every query it issues is covered
 * by one of the `ledger_entries` indexes in schema.prisma. Section 36 of the
 * brief ("thousands of transactions per user") is handled by never doing an
 * unbounded `findMany` on this table.
 */
import { prisma } from '../lib/prisma.js';
import { toDateString } from '../lib/date.js';
import type {
  AccountView,
  AdjustmentView,
  LedgerEntryView,
  LiabilityView,
} from '../domain/ledger.js';
import type { CategoryRef } from '../domain/engine/incomeStatement.js';

export interface EntryWindow {
  /** Inclusive lower bound. Omit to load from the beginning of time. */
  from?: string;
  /** Inclusive upper bound. */
  to: string;
}

/**
 * Loads ledger entries with their account and category denormalised.
 *
 * Reports that need opening balances (cash flow, net worth) pass no `from`, so
 * the whole history up to `to` is loaded. For a personal-finance workload that is
 * bounded by the user's own lifetime of transactions; if a user ever grows past
 * that comfortably, the migration path is a monthly `account_balance_snapshots`
 * rollup read instead of replaying history. The engine signature does not change.
 */
export async function loadEntries(
  userId: string,
  window: EntryWindow,
): Promise<LedgerEntryView[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: {
      userId,
      date: {
        ...(window.from ? { gte: new Date(`${window.from}T00:00:00.000Z`) } : {}),
        lte: new Date(`${window.to}T00:00:00.000Z`),
      },
    },
    select: {
      id: true,
      transactionId: true,
      date: true,
      accountId: true,
      amountMinor: true,
      direction: true,
      leg: true,
      isInternal: true,
      categoryId: true,
      account: { select: { name: true } },
      category: { select: { name: true, kind: true } },
      transaction: { select: { type: true, description: true } },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    transactionId: row.transactionId,
    date: toDateString(row.date),
    accountId: row.accountId,
    accountName: row.account.name,
    amountMinor: row.amountMinor,
    direction: row.direction,
    leg: row.leg,
    isInternal: row.isInternal,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    categoryKind: row.category?.kind ?? null,
    transactionType: row.transaction.type,
    description: row.transaction.description,
  }));
}

export async function loadAccounts(userId: string): Promise<AccountView[]> {
  const rows = await prisma.account.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    type: row.type,
    openingBalanceMinor: row.openingBalanceMinor,
    openingBalanceDate: row.openingBalanceDate ? toDateString(row.openingBalanceDate) : null,
    includeInNetWorth: row.includeInNetWorth,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  }));
}

export async function loadCategories(userId: string): Promise<CategoryRef[]> {
  const rows = await prisma.category.findMany({
    where: { userId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  }));
}

export async function loadLiabilities(userId: string): Promise<LiabilityView[]> {
  const rows = await prisma.liability.findMany({ where: { userId } });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    balanceMinor: row.balanceMinor,
    isSettled: row.isSettled,
    createdDate: toDateString(row.createdAt),
  }));
}

export async function loadAdjustments(userId: string): Promise<AdjustmentView[]> {
  const rows = await prisma.netWorthAdjustment.findMany({
    where: { userId },
    orderBy: { date: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    date: toDateString(row.date),
    amountMinor: row.amountMinor,
    reason: row.reason,
  }));
}

/**
 * Everything the report layer needs, in four parallel queries instead of four
 * sequential round trips.
 */
export async function loadFinancialContext(userId: string, window: EntryWindow) {
  const [entries, accounts, categories, liabilities, adjustments] = await Promise.all([
    loadEntries(userId, window),
    loadAccounts(userId),
    loadCategories(userId),
    loadLiabilities(userId),
    loadAdjustments(userId),
  ]);
  return { entries, accounts, categories, liabilities, adjustments };
}

export type FinancialContext = Awaited<ReturnType<typeof loadFinancialContext>>;
