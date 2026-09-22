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
    name: 'GCash Business',
    type: 'EWALLET',
    role: 'DAILY_WALLET',
    notes: 'Main digital wallet — Facebook orders, supplier payments, ads, courier fees.',
  },
  {
    name: 'Shopee Wallet',
    type: 'EWALLET',
    role: 'CONVENIENCE_WALLET',
    notes: 'Shopee marketplace deposits, net of nothing — commission recorded as a separate expense.',
  },
  {
    name: 'Cash on Hand',
    type: 'CASH',
    role: 'DAILY_WALLET',
    notes: 'Market-day sales and collected COD payments.',
  },
];

interface CategorySeed {
  name: string;
  kind: CategoryKind;
  description: string;
  color: string;
}

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: 'Product Sales - Facebook', kind: 'INCOME', description: 'Orders taken directly through the Facebook Page.', color: '#16a34a' },
  { name: 'Product Sales - Shopee', kind: 'INCOME', description: 'Orders through the Shopee marketplace listing.', color: '#0d9488' },
  { name: 'Product Sales - Market/Walk-in', kind: 'INCOME', description: 'Cash sales at local markets / walk-in customers.', color: '#0891b2' },
  { name: 'Raw Materials', kind: 'EXPENSE', description: 'Blank tumblers, vinyl, ink — physical product cost.', color: '#ea580c' },
  { name: 'Packaging Materials', kind: 'EXPENSE', description: 'Boxes, bubble wrap, stickers used to ship orders.', color: '#d97706' },
  { name: 'Shopee Platform Fees', kind: 'EXPENSE', description: 'Shopee commission deducted per order.', color: '#7c3aed' },
  { name: 'Shipping Cost Paid', kind: 'EXPENSE', description: 'Courier fees paid by the shop.', color: '#db2777' },
  { name: 'Marketing/Ads', kind: 'EXPENSE', description: 'Facebook boosts / paid promotion.', color: '#2563eb' },
  { name: 'Supplies', kind: 'EXPENSE', description: 'Non-product business supplies such as printer ink and labels.', color: '#64748b' },
  { name: 'Miscellaneous', kind: 'EXPENSE', description: 'Other expenses that do not fit another category.', color: '#94a3b8' },
  { name: "Owner's Capital", kind: 'EQUITY', description: 'Money contributed by the owner. Not revenue and excluded from the Income Statement.', color: '#4f46e5' },
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
