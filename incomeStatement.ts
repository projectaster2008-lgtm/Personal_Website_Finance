/**
 * Income Statement.
 *
 * Workbook equivalent — Income Statement!B9 (one row per category):
 *   SUMIFS('General Ledger'!F:F, Category, "Allowance", Date, ">="&Start, Date, "<="&End)
 * and B23 = SUM(expense rows), B25 = B13 - B23.
 *
 * Two deliberate differences from the sheet:
 *
 * 1. The sheet hard-coded one formula row per category, so a user-created
 *    category would silently never appear. Here every category with activity in
 *    the period is listed, and categories with zero activity are still emitted so
 *    the statement keeps a stable shape month to month.
 *
 * 2. The sheet decided income vs expense by which column (F or G) it summed.
 *    Here it is decided by `categoryKind`, and internal legs are dropped entirely
 *    (invariant I4). A transfer can therefore never land in either section, no
 *    matter what category a user picks.
 */
import { percentOf } from '@pfos/shared';
import type { CategoryLine, IncomeStatement, ResolvedPeriod } from '@pfos/shared';
import type { LedgerEntryView } from '../ledger.js';
import { inPeriod, isOperating } from '../ledger.js';

export interface CategoryRef {
  id: string;
  name: string;
  kind: string;
  sortOrder: number;
  isActive: boolean;
}

interface Bucket {
  amountMinor: number;
  count: number;
}

export function computeIncomeStatement(
  entries: readonly LedgerEntryView[],
  categories: readonly CategoryRef[],
  period: ResolvedPeriod,
): IncomeStatement {
  const incomeBuckets = new Map<string, Bucket>();
  const expenseBuckets = new Map<string, Bucket>();

  let internalTransfersMinor = 0;
  const internalTransactionIds = new Set<string>();

  for (const entry of entries) {
    if (!inPeriod(entry.date, period.from, period.to)) continue;

    if (!isOperating(entry)) {
      // Internal legs are excluded from the statement. We still measure them so
      // the UI can say "₱X moved between your accounts and was not counted".
      // Only the OUT leg is counted, otherwise every transfer would double.
      if (entry.direction === 'OUT') internalTransfersMinor += entry.amountMinor;
      internalTransactionIds.add(entry.transactionId);
      continue;
    }

    const key = entry.categoryId ?? '__uncategorised__';
    const target =
      entry.direction === 'IN' ? incomeBuckets : expenseBuckets;
    const bucket = target.get(key) ?? { amountMinor: 0, count: 0 };
    bucket.amountMinor += entry.amountMinor;
    bucket.count += 1;
    target.set(key, bucket);
  }

  const income = buildLines(incomeBuckets, categories, 'INCOME');
  const expenses = buildLines(expenseBuckets, categories, 'EXPENSE');

  const totalIncomeMinor = income.reduce((s, l) => s + l.amountMinor, 0);
  const totalExpensesMinor = expenses.reduce((s, l) => s + l.amountMinor, 0);

  return {
    period,
    income: withPercent(income, totalIncomeMinor),
    totalIncomeMinor,
    expenses: withPercent(expenses, totalExpensesMinor),
    totalExpensesMinor,
    netIncomeMinor: totalIncomeMinor - totalExpensesMinor,
    internalTransfersMinor,
    internalTransferCount: internalTransactionIds.size,
  };
}

/**
 * Emits one line per category of the requested kind, in the user's own ordering,
 * including zero lines. Any bucket whose category no longer exists (deleted, or
 * a legacy import) is appended as "Uncategorised" rather than being dropped —
 * losing money because a category row went missing is the failure mode we refuse.
 */
function buildLines(
  buckets: Map<string, Bucket>,
  categories: readonly CategoryRef[],
  kind: 'INCOME' | 'EXPENSE',
): CategoryLine[] {
  const lines: CategoryLine[] = [];
  const seen = new Set<string>();

  for (const category of categories.filter((c) => c.kind === kind).sort(byOrder)) {
    const bucket = buckets.get(category.id);
    seen.add(category.id);
    // Keep an inactive category only when it actually has activity this period.
    if (!category.isActive && !bucket) continue;
    lines.push({
      categoryId: category.id,
      name: category.name,
      amountMinor: bucket?.amountMinor ?? 0,
      percent: 0,
      transactionCount: bucket?.count ?? 0,
    });
  }

  let orphanMinor = 0;
  let orphanCount = 0;
  for (const [key, bucket] of buckets) {
    if (seen.has(key)) continue;
    orphanMinor += bucket.amountMinor;
    orphanCount += bucket.count;
  }
  if (orphanMinor > 0 || orphanCount > 0) {
    lines.push({
      categoryId: null,
      name: 'Uncategorised',
      amountMinor: orphanMinor,
      percent: 0,
      transactionCount: orphanCount,
    });
  }

  return lines;
}

function withPercent(lines: CategoryLine[], total: number): CategoryLine[] {
  return lines.map((line) => ({ ...line, percent: percentOf(line.amountMinor, total) }));
}

function byOrder(a: CategoryRef, b: CategoryRef): number {
  return a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder;
}

/** Expense lines sorted biggest-first, for the dashboard donut. */
export function rankedBreakdown(lines: readonly CategoryLine[]): CategoryLine[] {
  return lines
    .filter((l) => l.amountMinor !== 0)
    .slice()
    .sort((a, b) => b.amountMinor - a.amountMinor);
}
