/**
 * Seed script.
 *
 * Creates a demo user holding the workbook's exact sample data, so the running
 * application can be compared against the spreadsheet side by side (section 32).
 * After seeding, the app must report:
 *
 *   Total Income   ₱2,000
 *   Total Expenses ₱1,700
 *   Net Income       ₱300
 *   Physical Wallet  ₱300
 *   Total Cash       ₱300
 *   Net Worth        ₱300
 *
 * The script asserts those figures before exiting. If the engine ever drifts from
 * the workbook, `npm run db:seed` fails loudly instead of quietly seeding
 * wrong numbers.
 *
 * Run: npm run db:seed
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { seedDefaultsForUser } from '../src/services/seedService.js';
import { createTransaction } from '../src/services/transactionService.js';
import { loadFinancialContext } from '../src/repositories/ledgerRepository.js';
import { computeIncomeStatement } from '../src/domain/engine/incomeStatement.js';
import { computeAccountBalances, computeTotalCash } from '../src/domain/engine/balances.js';
import { computeBalanceSheet } from '../src/domain/engine/statements.js';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@pfos.local';
const DEMO_PASSWORD = 'demo1234';

/** General Ledger!A6:H9 of Personal_Financial_Tracker_Fixed.xlsx */
const WORKBOOK_ROWS = [
  {
    date: '2026-09-10',
    description: 'Borrow from uncle, to buy uniform',
    category: 'Allowance',
    account: 'Physical Wallet',
    type: 'INCOME' as const,
    amountMinor: 200_000,
    // The sheet typed this row "Transfer" but categorised it "Allowance", and its
    // Income Statement keys off category — which is how it reaches ₱2,000 income.
    // Money arriving from someone else is income here; a transfer needs two
    // accounts the user owns. See docs/WORKBOOK_MAPPING.md.
  },
  {
    date: '2026-09-11',
    description: 'Class Uniform',
    category: 'Miscellaneous',
    account: 'Physical Wallet',
    type: 'EXPENSE' as const,
    amountMinor: 100_000,
  },
  {
    date: '2026-09-12',
    description: 'PE Uniform',
    category: 'Miscellaneous',
    account: 'Physical Wallet',
    type: 'EXPENSE' as const,
    amountMinor: 60_000,
  },
  {
    date: '2026-09-14',
    description: 'Foods, Snacks',
    category: 'Food',
    account: 'Physical Wallet',
    type: 'EXPENSE' as const,
    amountMinor: 10_000,
  },
];

async function main(): Promise<void> {
  console.log('Seeding Personal Finance OS…');

  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log('  Demo user exists — removing it so the seed is repeatable');
    await prisma.user.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      name: 'Demo',
      currency: 'PHP',
      timezone: 'Asia/Manila',
    },
  });
  console.log(`  Created user ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})`);

  await seedDefaultsForUser(user.id);
  console.log('  Created 6 accounts and 11 categories from the Chart of Accounts');

  const accounts = await prisma.account.findMany({ where: { userId: user.id } });
  const categories = await prisma.category.findMany({ where: { userId: user.id } });
  const accountId = (name: string) => accounts.find((a) => a.name === name)!.id;
  const categoryId = (name: string) => categories.find((c) => c.name === name)!.id;

  for (const row of WORKBOOK_ROWS) {
    await createTransaction(user.id, {
      type: row.type,
      date: row.date,
      description: row.description,
      amountMinor: row.amountMinor,
      accountId: accountId(row.account),
      categoryId: categoryId(row.category),
    });
  }
  console.log(`  Posted ${WORKBOOK_ROWS.length} ledger transactions`);

  // Planning data so every screen has something to render on first run.
  await prisma.goal.createMany({
    data: [
      {
        userId: user.id,
        name: 'Emergency Fund',
        targetAmountMinor: 3_000_000, // ₱30,000
        accountId: accountId('GoTyme - Emergency Fund'),
        targetDate: new Date('2027-09-30T00:00:00.000Z'),
        notes: 'Three months of essentials.',
      },
      {
        userId: user.id,
        name: 'Gadget Fund',
        targetAmountMinor: 4_500_000, // ₱45,000
        accountId: accountId('GoTyme - Gadget Fund'),
        notes: 'Laptop replacement.',
      },
    ],
  });

  await prisma.budget.createMany({
    data: [
      { userId: user.id, categoryId: categoryId('Food'), amountMinor: 250_000, period: 'MONTHLY', startDate: new Date('2026-09-01T00:00:00.000Z') },
      { userId: user.id, categoryId: categoryId('Transportation'), amountMinor: 120_000, period: 'MONTHLY', startDate: new Date('2026-09-01T00:00:00.000Z') },
      { userId: user.id, categoryId: categoryId('Shopping'), amountMinor: 150_000, period: 'MONTHLY', startDate: new Date('2026-09-01T00:00:00.000Z') },
    ],
  });

  await prisma.recurringRule.createMany({
    data: [
      {
        userId: user.id, type: 'INCOME', description: 'Monthly allowance', amountMinor: 200_000,
        categoryId: categoryId('Allowance'), accountId: accountId('MariBank'),
        frequency: 'MONTHLY', anchorDay: 1, startDate: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        userId: user.id, type: 'EXPENSE', description: 'Spotify', amountMinor: 14_900,
        categoryId: categoryId('Load/Subscriptions'), accountId: accountId('MariBank'),
        frequency: 'MONTHLY', anchorDay: 15, startDate: new Date('2026-09-15T00:00:00.000Z'),
      },
      {
        userId: user.id, type: 'EXPENSE', description: 'Internet', amountMinor: 150_000,
        categoryId: categoryId('Load/Subscriptions'), accountId: accountId('MariBank'),
        frequency: 'MONTHLY', anchorDay: 20, startDate: new Date('2026-09-20T00:00:00.000Z'),
      },
    ],
  });
  console.log('  Created goals, budgets and recurring rules');

  await verify(user.id);

  console.log('\nDone. Sign in with demo@pfos.local / demo1234');
}

/** Section 33: the app must reproduce the workbook, not approximate it. */
async function verify(userId: string): Promise<void> {
  const period = { from: '2026-09-01', to: '2026-09-30', label: 'September 2026' };
  const ctx = await loadFinancialContext(userId, { to: period.to });

  const statement = computeIncomeStatement(ctx.entries, ctx.categories, period);
  const balances = computeAccountBalances(ctx.accounts, ctx.entries, period.to);
  const totalCash = computeTotalCash(balances);
  const balanceSheet = computeBalanceSheet(
    ctx.entries, ctx.accounts, ctx.liabilities, ctx.adjustments, ctx.categories,
    period.to, period.from,
  );

  const checks: [string, number, number][] = [
    ['Total Income', statement.totalIncomeMinor, 200_000],
    ['Total Expenses', statement.totalExpensesMinor, 170_000],
    ['Net Income', statement.netIncomeMinor, 30_000],
    ['Physical Wallet', balances.find((b) => b.name === 'Physical Wallet')?.balanceMinor ?? -1, 30_000],
    ['Total Cash', totalCash, 30_000],
    ['Net Worth', balanceSheet.netWorthMinor, 30_000],
  ];

  console.log('\n  Excel parity check (September 2026):');
  let failed = false;
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) failed = true;
    console.log(
      `    ${ok ? '✓' : '✗'} ${label.padEnd(16)} ₱${(actual / 100).toFixed(2).padStart(10)}  (expected ₱${(expected / 100).toFixed(2)})`,
    );
  }

  if (!balanceSheet.reconciliation.matches) {
    failed = true;
    console.log('    ✗ Balance sheet does not reconcile with changes in net worth');
  } else {
    console.log('    ✓ Balance sheet reconciles with changes in net worth');
  }

  if (failed) throw new Error('Seed verification failed: the engine no longer matches the workbook');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
