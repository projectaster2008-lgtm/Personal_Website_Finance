/**
 * Budgets, goals, recurring rules, liabilities, reconciliation and net-worth
 * adjustments. All of these read the same ledger the statements read.
 */
import type {
  BudgetProgress,
  GoalProgress,
  ReconciliationDto,
  RecurringRuleDto,
  UpcomingOccurrence,
} from '@pfos/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound } from '../lib/errors.js';
import { toDateColumn, toDateString, todayInTimezone } from '../lib/date.js';
import { loadAccounts, loadEntries } from '../repositories/ledgerRepository.js';
import {
  computeBudgetProgress,
  computeGoalProgress,
  computeReconciliation,
  nextOccurrence,
  startOfWeek,
  upcomingOccurrences,
  type RecurringRow,
} from '../domain/engine/planning.js';
import { addDays } from '../domain/engine/period.js';
import { createTransaction } from './transactionService.js';

/* --------------------------------------------------------------- budgets --- */

export async function listBudgets(
  userId: string,
  timezone: string,
  month?: string,
): Promise<BudgetProgress[]> {
  const today = todayInTimezone(timezone);
  const targetMonth = month ?? today.slice(0, 7);

  const [budgets, entries] = await Promise.all([
    prisma.budget.findMany({
      where: {
        userId,
        OR: [
          { period: 'MONTHLY', startDate: toDateColumn(`${targetMonth}-01`) },
          { period: 'CUSTOM' },
        ],
      },
      include: { category: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    loadEntries(userId, { to: `${targetMonth}-31` }),
  ]);

  return budgets.map((budget) =>
    computeBudgetProgress(
      {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category.name,
        period: budget.period,
        amountMinor: budget.amountMinor,
        startDate: toDateString(budget.startDate),
        endDate: budget.endDate ? toDateString(budget.endDate) : null,
      },
      entries,
      today,
    ),
  );
}

export async function upsertBudget(
  userId: string,
  input: {
    categoryId: string;
    amountMinor: number;
    period: 'MONTHLY' | 'CUSTOM';
    startDate: string;
    endDate?: string;
    rollover?: boolean;
    notes?: string;
  },
) {
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, userId },
    select: { id: true },
  });
  if (!category) throw notFound('Category');

  return prisma.budget.upsert({
    where: {
      userId_categoryId_startDate: {
        userId,
        categoryId: input.categoryId,
        startDate: toDateColumn(input.startDate),
      },
    },
    create: {
      userId,
      categoryId: input.categoryId,
      amountMinor: input.amountMinor,
      period: input.period,
      startDate: toDateColumn(input.startDate),
      endDate: input.endDate ? toDateColumn(input.endDate) : null,
      rollover: input.rollover ?? false,
      notes: input.notes ?? null,
    },
    update: {
      amountMinor: input.amountMinor,
      endDate: input.endDate ? toDateColumn(input.endDate) : null,
      rollover: input.rollover ?? false,
      notes: input.notes ?? null,
    },
  });
}

export async function deleteBudget(userId: string, id: string): Promise<void> {
  const found = await prisma.budget.findFirst({ where: { id, userId } });
  if (!found) throw notFound('Budget');
  await prisma.budget.delete({ where: { id } });
}

/* ----------------------------------------------------------------- goals --- */

export async function listGoals(
  userId: string,
  timezone: string,
  includeArchived = false,
): Promise<GoalProgress[]> {
  const today = todayInTimezone(timezone);
  const [goals, accounts, entries] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: { createdAt: 'asc' },
    }),
    loadAccounts(userId),
    loadEntries(userId, { to: today }),
  ]);

  return goals.map((goal) =>
    computeGoalProgress(
      {
        id: goal.id,
        name: goal.name,
        targetAmountMinor: goal.targetAmountMinor,
        targetDate: goal.targetDate ? toDateString(goal.targetDate) : null,
        accountId: goal.accountId,
        manualAmountMinor: goal.manualAmountMinor,
        notes: goal.notes,
        isArchived: goal.isArchived,
      },
      accounts,
      entries,
      today,
    ),
  );
}

export async function createGoal(userId: string, input: Prisma.GoalUncheckedCreateInput & { targetDate?: string }) {
  return prisma.goal.create({
    data: { ...input, userId, targetDate: input.targetDate ? toDateColumn(input.targetDate) : null },
  });
}

export async function updateGoal(
  userId: string,
  id: string,
  input: Partial<Prisma.GoalUncheckedUpdateInput> & { targetDate?: string },
) {
  const found = await prisma.goal.findFirst({ where: { id, userId } });
  if (!found) throw notFound('Goal');
  return prisma.goal.update({
    where: { id },
    data: { ...input, targetDate: input.targetDate ? toDateColumn(input.targetDate) : undefined },
  });
}

export async function deleteGoal(userId: string, id: string): Promise<void> {
  const found = await prisma.goal.findFirst({ where: { id, userId } });
  if (!found) throw notFound('Goal');
  await prisma.goal.delete({ where: { id } });
}

/* ------------------------------------------------------------- recurring --- */

export async function listRecurring(
  userId: string,
  timezone: string,
): Promise<RecurringRuleDto[]> {
  const today = todayInTimezone(timezone);
  const rules = await prisma.recurringRule.findMany({
    where: { userId },
    include: {
      category: { select: { id: true, name: true } },
      account: { select: { id: true, name: true } },
      fromAccount: { select: { id: true, name: true } },
      toAccount: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return rules.map((rule) => ({
    id: rule.id,
    type: rule.type,
    description: rule.description,
    amountMinor: rule.amountMinor,
    frequency: rule.frequency,
    interval: rule.interval,
    anchorDay: rule.anchorDay,
    startDate: toDateString(rule.startDate),
    endDate: rule.endDate ? toDateString(rule.endDate) : null,
    nextOccurrence: nextOccurrence(toRecurringRow(rule), today),
    autoPost: rule.autoPost,
    isActive: rule.isActive,
    category: rule.category,
    account: rule.account,
    fromAccount: rule.fromAccount,
    toAccount: rule.toAccount,
    notes: rule.notes,
  }));
}

export async function listUpcoming(
  userId: string,
  timezone: string,
  days = 30,
): Promise<UpcomingOccurrence[]> {
  const today = todayInTimezone(timezone);
  const rules = await prisma.recurringRule.findMany({
    where: { userId, isActive: true },
    include: {
      category: { select: { name: true } },
      account: { select: { name: true } },
    },
  });

  return upcomingOccurrences(rules.map(toRecurringRow), today, addDays(today, days));
}

/**
 * Posts every due occurrence of every auto-post rule.
 *
 * Idempotent by design: `lastPostedDate` advances inside the same loop, so
 * running this twice in a day — or a cron firing twice — cannot double-charge
 * an allowance. Call it from a scheduled job, or lazily on login.
 */
export async function materialiseDueRecurring(
  userId: string,
  timezone: string,
): Promise<{ posted: number }> {
  const today = todayInTimezone(timezone);
  const rules = await prisma.recurringRule.findMany({
    where: { userId, isActive: true, autoPost: true },
  });

  let posted = 0;

  for (const rule of rules) {
    let cursor = rule.lastPostedDate ? toDateString(rule.lastPostedDate) : previousDay(toDateString(rule.startDate));

    for (let guard = 0; guard < 60; guard += 1) {
      const due = nextOccurrence(toRecurringRow(rule), cursor);
      if (!due || due > today) break;

      await createTransaction(userId, {
        type: rule.type,
        date: due,
        description: rule.description,
        amountMinor: rule.amountMinor,
        accountId: rule.accountId ?? undefined,
        categoryId: rule.categoryId ?? undefined,
        fromAccountId: rule.fromAccountId ?? undefined,
        toAccountId: rule.toAccountId ?? undefined,
        recurringRuleId: rule.id,
      });

      await prisma.recurringRule.update({
        where: { id: rule.id },
        data: { lastPostedDate: toDateColumn(due) },
      });

      cursor = due;
      posted += 1;
    }
  }

  return { posted };
}

function previousDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

type RuleRow = {
  id: string;
  description: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amountMinor: number;
  frequency: RecurringRow['frequency'];
  interval: number;
  anchorDay: number | null;
  startDate: Date;
  endDate: Date | null;
  isActive: boolean;
  lastPostedDate: Date | null;
  account?: { name: string } | null;
  category?: { name: string } | null;
};

function toRecurringRow(rule: RuleRow): RecurringRow {
  return {
    id: rule.id,
    description: rule.description,
    type: rule.type,
    amountMinor: rule.amountMinor,
    frequency: rule.frequency,
    interval: rule.interval,
    anchorDay: rule.anchorDay,
    startDate: toDateString(rule.startDate),
    endDate: rule.endDate ? toDateString(rule.endDate) : null,
    isActive: rule.isActive,
    lastPostedDate: rule.lastPostedDate ? toDateString(rule.lastPostedDate) : null,
    accountName: rule.account?.name ?? null,
    categoryName: rule.category?.name ?? null,
  };
}

/* -------------------------------------------------------- reconciliation --- */

export async function listReconciliations(
  userId: string,
  timezone: string,
  weeks = 8,
): Promise<ReconciliationDto[]> {
  const today = todayInTimezone(timezone);
  const [rows, accounts, entries] = await Promise.all([
    prisma.reconciliation.findMany({
      where: { userId },
      orderBy: [{ weekOf: 'desc' }, { createdAt: 'desc' }],
      take: weeks * 10,
    }),
    loadAccounts(userId),
    loadEntries(userId, { to: today }),
  ]);

  return rows.map((row) =>
    computeReconciliation(
      {
        id: row.id,
        weekOf: toDateString(row.weekOf),
        accountId: row.accountId,
        actualBalanceMinor: row.actualBalanceMinor,
        notes: row.notes,
        createdAt: row.createdAt.toISOString(),
      },
      accounts,
      entries,
    ),
  );
}

export async function upsertReconciliation(
  userId: string,
  input: { weekOf: string; accountId: string; actualBalanceMinor: number; notes?: string },
  weekStartsOn = 1,
) {
  const account = await prisma.account.findFirst({
    where: { id: input.accountId, userId },
    select: { id: true },
  });
  if (!account) throw notFound('Account');

  // Normalise to the start of the week so two entries for the same week collide
  // on the unique index instead of creating duplicates.
  const weekOf = startOfWeek(input.weekOf, weekStartsOn);

  return prisma.reconciliation.upsert({
    where: {
      userId_accountId_weekOf: { userId, accountId: input.accountId, weekOf: toDateColumn(weekOf) },
    },
    create: {
      userId,
      accountId: input.accountId,
      weekOf: toDateColumn(weekOf),
      actualBalanceMinor: input.actualBalanceMinor,
      notes: input.notes ?? null,
    },
    update: { actualBalanceMinor: input.actualBalanceMinor, notes: input.notes ?? null },
  });
}

export async function deleteReconciliation(userId: string, id: string): Promise<void> {
  const found = await prisma.reconciliation.findFirst({ where: { id, userId } });
  if (!found) throw notFound('Reconciliation');
  await prisma.reconciliation.delete({ where: { id } });
}

/* ---------------------------------------------- liabilities & adjustments --- */

export async function listLiabilities(userId: string) {
  return prisma.liability.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

export async function createLiability(userId: string, input: Prisma.LiabilityUncheckedCreateInput & { dueDate?: string }) {
  return prisma.liability.create({
    data: { ...input, userId, dueDate: input.dueDate ? toDateColumn(input.dueDate) : null },
  });
}

export async function updateLiability(
  userId: string,
  id: string,
  input: Partial<Prisma.LiabilityUncheckedUpdateInput> & { dueDate?: string },
) {
  const found = await prisma.liability.findFirst({ where: { id, userId } });
  if (!found) throw notFound('Liability');
  return prisma.liability.update({
    where: { id },
    data: { ...input, dueDate: input.dueDate ? toDateColumn(input.dueDate) : undefined },
  });
}

export async function deleteLiability(userId: string, id: string): Promise<void> {
  const found = await prisma.liability.findFirst({ where: { id, userId } });
  if (!found) throw notFound('Liability');
  await prisma.liability.delete({ where: { id } });
}

export async function listAdjustments(userId: string) {
  return prisma.netWorthAdjustment.findMany({ where: { userId }, orderBy: { date: 'desc' } });
}

export async function createAdjustment(
  userId: string,
  input: { date: string; amountMinor: number; reason: string; notes?: string },
) {
  return prisma.netWorthAdjustment.create({
    data: {
      userId,
      date: toDateColumn(input.date),
      amountMinor: input.amountMinor,
      reason: input.reason,
      notes: input.notes ?? null,
    },
  });
}

export async function deleteAdjustment(userId: string, id: string): Promise<void> {
  const found = await prisma.netWorthAdjustment.findFirst({ where: { id, userId } });
  if (!found) throw notFound('Adjustment');
  await prisma.netWorthAdjustment.delete({ where: { id } });
}
