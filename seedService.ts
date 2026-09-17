/**
 * Default setup for a new user.
 *
 * These six accounts and eleven categories are copied verbatim from
 * "Chart of Accounts" in the workbook, including the role descriptions, which
 * are not decoration — they tell the user what each account is FOR, which is the
 * whole point of that sheet.
 *
 * They are marked `isSystem` so the UI can protect them from deletion while
 * still allowing renames, and so section 3's "preserve these initial accounts"
 * survives a user tidying up their category list.
 */
import type { AccountRole, AccountType, CategoryKind } from '@pfos/shared';
import { prisma } from '../lib/prisma.js';

interface AccountSeed {
  name: string;
  type: AccountType;
  role: AccountRole;
  notes: string;
}

/** Chart of Accounts!A6:C11 */
export const DEFAULT_ACCOUNTS: AccountSeed[] = [
  {
    name: 'MariBank',
    type: 'BANK',
    role: 'CONVENIENCE_WALLET',
    notes:
      'Primary account (digital version). Short-term holding and daily spending. Earns daily interest. Fully liquid.',
  },
  {
    name: 'UnionBank',
    type: 'BANK',
    role: 'PROFESSIONAL_ANCHOR',
    notes: 'Kept clean for future payroll, freelance income, and formal transactions.',
  },
  {
    name: 'GCash',
    type: 'EWALLET',
    role: 'TRANSIT_STATION',
    notes: 'Bridge only, for physical-store payments and cash-ins. Money should not sit here.',
  },
  {
    name: 'GoTyme - Emergency Fund',
    type: 'SAVINGS',
    role: 'VAULT',
    notes: 'Go Save Pocket. Strict savings, not for daily spending.',
  },
  {
    name: 'GoTyme - Gadget Fund',
    type: 'SAVINGS',
    role: 'VAULT',
    notes: 'Go Save Pocket. Strict savings, not for daily spending.',
  },
  {
    name: 'Physical Wallet',
    type: 'CASH',
    role: 'DAILY_WALLET',
    notes: 'Primary account (physical version).',
  },
];

interface CategorySeed {
  name: string;
  kind: CategoryKind;
  description: string;
  color: string;
}

/** Chart of Accounts!A14:B17 and A21:B26 */
export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Allowance', kind: 'INCOME', description: 'Regular allowance from family.', color: '#16a34a' },
  { name: 'Freelance/Side Income', kind: 'INCOME', description: 'Freelance or gig payments.', color: '#0d9488' },
  { name: 'Gifts Received/Scholarships', kind: 'INCOME', description: 'Cash gifts.', color: '#0891b2' },
  { name: 'Interest Earned', kind: 'INCOME', description: 'Daily or monthly interest credited by a digital bank.', color: '#2563eb' },
  { name: 'Food', kind: 'EXPENSE', description: 'Meals and groceries.', color: '#ea580c' },
  { name: 'Transportation', kind: 'EXPENSE', description: 'Fares, fuel, tolls.', color: '#d97706' },
  { name: 'Load/Subscriptions', kind: 'EXPENSE', description: 'Mobile load, app and streaming subscriptions.', color: '#7c3aed' },
  { name: 'Shopping', kind: 'EXPENSE', description: 'Shopee and other online or offline purchases.', color: '#db2777' },
  { name: 'Miscellaneous', kind: 'EXPENSE', description: "Anything that doesn't fit another category.", color: '#64748b' },
  {
    name: 'Transfer Fees',
    kind: 'EXPENSE',
    description: 'Fees paid to move money between your own accounts.',
    color: '#b91c1c',
  },
];

/**
 * The workbook's "Internal Transfer" row.
 *
 * Kept as a real category for one reason only: CSV files exported from the
 * spreadsheet contain it, and the importer needs somewhere to map those rows.
 * Nothing in the app files new entries under it — transfers are identified by
 * `isInternal` on the ledger entry, not by category name.
 */
export const INTERNAL_CATEGORY: CategorySeed = {
  name: 'Internal Transfer',
  kind: 'INTERNAL',
  description:
    'Money moving between your own accounts or pockets. Not income or expense — excluded from the Income Statement.',
  color: '#475569',
};

export async function seedDefaultsForUser(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.account.createMany({
      data: DEFAULT_ACCOUNTS.map((account, index) => ({
        userId,
        name: account.name,
        type: account.type,
        role: account.role,
        notes: account.notes,
        openingBalanceMinor: 0,
        isSystem: true,
        sortOrder: index,
      })),
      skipDuplicates: true,
    }),
    prisma.category.createMany({
      data: [...DEFAULT_CATEGORIES, INTERNAL_CATEGORY].map((category, index) => ({
        userId,
        name: category.name,
        kind: category.kind,
        description: category.description,
        color: category.color,
        isSystem: true,
        sortOrder: index,
      })),
      skipDuplicates: true,
    }),
  ]);
}
