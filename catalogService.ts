/**
 * Accounts and categories.
 *
 * Deletion policy is the interesting part. A category or account with history
 * cannot be deleted, because deleting it would silently rewrite past reports —
 * last September's Food total would change because you tidied up a list today.
 * The app deactivates instead, which hides it from pickers while leaving every
 * historical statement intact.
 */
import type { AccountDto, CategoryDto } from '@pfos/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { conflict, notFound } from '../lib/errors.js';
import { toDateColumn, toDateString, todayInTimezone } from '../lib/date.js';
import { loadAccounts, loadEntries } from '../repositories/ledgerRepository.js';
import {
  computeAccountActivity,
  computeAccountBalances,
  withRunningBalance,
} from '../domain/engine/balances.js';

/* -------------------------------------------------------------- accounts --- */

export async function listAccounts(
  userId: string,
  timezone: string,
  includeInactive = false,
): Promise<AccountDto[]> {
  const asOf = todayInTimezone(timezone);
  const [rows, entries, accountViews] = await Promise.all([
    prisma.account.findMany({
      where: { userId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    loadEntries(userId, { to: asOf }),
    loadAccounts(userId),
  ]);

  const balances = computeAccountBalances(accountViews, entries, asOf);
  const balanceById = new Map(balances.map((b) => [b.accountId, b.balanceMinor]));

  return rows.map((row) => toAccountDto(row, balanceById.get(row.id) ?? row.openingBalanceMinor));
}

export async function getAccountDetail(
  userId: string,
  accountId: string,
  timezone: string,
  period: { from: string; to: string },
) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw notFound('Account');

  const asOf = todayInTimezone(timezone);
  const [entries, accountViews] = await Promise.all([
    loadEntries(userId, { to: asOf }),
    loadAccounts(userId),
  ]);

  const view = accountViews.find((a) => a.id === accountId)!;
  const balances = computeAccountBalances(accountViews, entries, asOf);
  const register = withRunningBalance(view, entries);

  return {
    account: toAccountDto(account, balances.find((b) => b.accountId === accountId)?.balanceMinor ?? 0),
    activity: computeAccountActivity(accountId, entries, period.from, period.to),
    period,
    register: register
      .slice()
      .reverse() // newest first for display; the running balance is already correct
      .slice(0, 200)
      .map(({ entry, runningBalanceMinor }) => ({
        entryId: entry.id,
        transactionId: entry.transactionId,
        date: entry.date,
        description: entry.description,
        categoryName: entry.categoryName,
        direction: entry.direction,
        leg: entry.leg,
        amountMinor: entry.amountMinor,
        effectMinor: entry.direction === 'IN' ? entry.amountMinor : -entry.amountMinor,
        runningBalanceMinor,
      })),
  };
}

export async function createAccount(
  userId: string,
  input: Prisma.AccountUncheckedCreateInput & { openingBalanceDate?: string },
): Promise<AccountDto> {
  const count = await prisma.account.count({ where: { userId } });
  const account = await prisma.account.create({
    data: {
      ...input,
      userId,
      sortOrder: input.sortOrder ?? count,
      openingBalanceDate: input.openingBalanceDate ? toDateColumn(input.openingBalanceDate) : null,
    },
  });
  return toAccountDto(account, account.openingBalanceMinor);
}

export async function updateAccount(
  userId: string,
  id: string,
  input: Partial<Prisma.AccountUncheckedUpdateInput> & { openingBalanceDate?: string },
): Promise<AccountDto> {
  const existing = await prisma.account.findFirst({ where: { id, userId } });
  if (!existing) throw notFound('Account');

  const account = await prisma.account.update({
    where: { id },
    data: {
      ...input,
      openingBalanceDate: input.openingBalanceDate
        ? toDateColumn(input.openingBalanceDate)
        : undefined,
    },
  });

  const entries = await loadEntries(userId, { to: todayInTimezone('UTC') });
  const views = await loadAccounts(userId);
  const balance = computeAccountBalances(views, entries, todayInTimezone('UTC')).find(
    (b) => b.accountId === id,
  );

  return toAccountDto(account, balance?.balanceMinor ?? account.openingBalanceMinor);
}

export async function deleteAccount(userId: string, id: string): Promise<void> {
  const account = await prisma.account.findFirst({ where: { id, userId } });
  if (!account) throw notFound('Account');

  const entryCount = await prisma.ledgerEntry.count({ where: { accountId: id, userId } });
  if (entryCount > 0) {
    throw conflict(
      `${account.name} has ${entryCount} ledger entries. Deactivate it instead so your past reports stay accurate.`,
      { entryCount, suggestion: 'DEACTIVATE' },
    );
  }

  await prisma.account.delete({ where: { id } });
}

/* ------------------------------------------------------------ categories --- */

export async function listCategories(
  userId: string,
  includeInactive = false,
): Promise<CategoryDto[]> {
  const rows = await prisma.category.findMany({
    where: { userId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toCategoryDto);
}

export async function createCategory(
  userId: string,
  input: Prisma.CategoryUncheckedCreateInput,
): Promise<CategoryDto> {
  const count = await prisma.category.count({ where: { userId, kind: input.kind } });
  const category = await prisma.category.create({
    data: { ...input, userId, sortOrder: input.sortOrder ?? count },
  });
  return toCategoryDto(category);
}

export async function updateCategory(
  userId: string,
  id: string,
  input: Partial<Prisma.CategoryUncheckedUpdateInput>,
): Promise<CategoryDto> {
  const existing = await prisma.category.findFirst({ where: { id, userId } });
  if (!existing) throw notFound('Category');

  // Changing a category's kind would move historical money between the income
  // and expense sections of every past statement. Refuse once it has history.
  if (input.kind && input.kind !== existing.kind) {
    const used = await prisma.ledgerEntry.count({ where: { categoryId: id, userId } });
    if (used > 0) {
      throw conflict(
        'This category is already used by transactions, so its type cannot change. Create a new category instead.',
        { entryCount: used },
      );
    }
  }

  return toCategoryDto(await prisma.category.update({ where: { id }, data: input }));
}

export async function deleteCategory(userId: string, id: string): Promise<void> {
  const category = await prisma.category.findFirst({ where: { id, userId } });
  if (!category) throw notFound('Category');

  const used = await prisma.ledgerEntry.count({ where: { categoryId: id, userId } });
  if (used > 0) {
    throw conflict(
      `${category.name} is used by ${used} entries. Deactivate it instead so your past reports stay accurate.`,
      { entryCount: used, suggestion: 'DEACTIVATE' },
    );
  }

  await prisma.category.delete({ where: { id } });
}

/* ------------------------------------------------------------- mappers --- */

type AccountRow = Awaited<ReturnType<typeof prisma.account.findFirstOrThrow>>;
type CategoryRow = Awaited<ReturnType<typeof prisma.category.findFirstOrThrow>>;

export function toAccountDto(row: AccountRow, currentBalanceMinor: number): AccountDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    role: row.role,
    notes: row.notes,
    openingBalanceMinor: row.openingBalanceMinor,
    openingBalanceDate: row.openingBalanceDate ? toDateString(row.openingBalanceDate) : null,
    currentBalanceMinor,
    includeInNetWorth: row.includeInNetWorth,
    isActive: row.isActive,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCategoryDto(row: CategoryRow): CategoryDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    color: row.color,
    icon: row.icon,
    isActive: row.isActive,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
  };
}
