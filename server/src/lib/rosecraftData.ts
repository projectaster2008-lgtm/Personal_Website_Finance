import bcrypt from 'bcryptjs';
import type { InMemoryDatabase } from './inMemoryPrisma.js';

export function seedRoseCraftUser(
  db: InMemoryDatabase,
  userId: string,
  email: string,
  name: string,
) {
  const now = new Date('2026-08-15T00:00:00.000Z');

  // 1. User
  db.user.items.push({
    id: userId,
    email,
    passwordHash: bcrypt.hashSync('demo1234', 10),
    name,
    currency: 'PHP',
    timezone: 'Asia/Manila',
    locale: 'en-PH',
    weekStartsOn: 1,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Chart of Accounts (3 accounts)
  const accountsData = [
    {
      id: `acc_rc_gcash_${userId}`,
      name: 'GCash Business',
      type: 'EWALLET',
      role: 'DAILY_WALLET',
      notes: 'Main digital wallet — Facebook orders, supplier payments, ads, courier fees.',
      openingBalanceMinor: 0,
      isSystem: true,
      sortOrder: 0,
    },
    {
      id: `acc_rc_shopee_${userId}`,
      name: 'Shopee Wallet',
      type: 'EWALLET',
      role: 'CONVENIENCE_WALLET',
      notes: 'Shopee marketplace deposits, net of nothing — commission recorded as a separate expense.',
      openingBalanceMinor: 0,
      isSystem: true,
      sortOrder: 1,
    },
    {
      id: `acc_rc_cash_${userId}`,
      name: 'Cash on Hand',
      type: 'CASH',
      role: 'DAILY_WALLET',
      notes: 'Market-day sales and collected COD payments.',
      openingBalanceMinor: 0,
      isSystem: true,
      sortOrder: 2,
    },
  ];

  for (const acc of accountsData) {
    db.account.items.push({
      ...acc,
      userId,
      includeInNetWorth: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 3. Categories (Revenue, COGS, Operating Expenses, Owner Capital)
  const categoriesData = [
    { id: `cat_rc_fb_${userId}`, name: 'Product Sales - Facebook', kind: 'INCOME', description: 'Orders taken directly through the Facebook Page.', color: '#16a34a', sortOrder: 0 },
    { id: `cat_rc_shopee_${userId}`, name: 'Product Sales - Shopee', kind: 'INCOME', description: 'Orders through the Shopee marketplace listing.', color: '#0d9488', sortOrder: 1 },
    { id: `cat_rc_walkin_${userId}`, name: 'Product Sales - Market/Walk-in', kind: 'INCOME', description: 'Cash sales at local markets / walk-in customers.', color: '#0891b2', sortOrder: 2 },
    { id: `cat_rc_raw_${userId}`, name: 'Raw Materials', kind: 'EXPENSE', description: 'Blank tumblers, vinyl, ink — physical product cost.', color: '#ea580c', sortOrder: 3 },
    { id: `cat_rc_packaging_${userId}`, name: 'Packaging Materials', kind: 'EXPENSE', description: 'Boxes, bubble wrap, stickers used to ship orders.', color: '#d97706', sortOrder: 4 },
    { id: `cat_rc_shopee_fees_${userId}`, name: 'Shopee Platform Fees', kind: 'EXPENSE', description: 'Shopee commission deducted per order.', color: '#7c3aed', sortOrder: 5 },
    { id: `cat_rc_shipping_${userId}`, name: 'Shipping Cost Paid', kind: 'EXPENSE', description: 'Courier fees paid by the shop.', color: '#db2777', sortOrder: 6 },
    { id: `cat_rc_marketing_${userId}`, name: 'Marketing/Ads', kind: 'EXPENSE', description: 'Facebook boosts / paid promotion.', color: '#2563eb', sortOrder: 7 },
    { id: `cat_rc_supplies_${userId}`, name: 'Supplies', kind: 'EXPENSE', description: 'Non-product business supplies such as printer ink and labels.', color: '#64748b', sortOrder: 8 },
    { id: `cat_rc_misc_${userId}`, name: 'Miscellaneous', kind: 'EXPENSE', description: 'Other expenses that do not fit another category.', color: '#94a3b8', sortOrder: 9 },
    { id: `cat_rc_capital_${userId}`, name: "Owner's Capital", kind: 'EQUITY', description: 'Money contributed by the owner. Not revenue and excluded from the Income Statement.', color: '#4f46e5', sortOrder: 10 },
    { id: `cat_rc_internal_${userId}`, name: 'Internal Transfer', kind: 'INTERNAL', description: 'Money moving between own accounts.', color: '#475569', sortOrder: 11 },
  ];

  for (const cat of categoriesData) {
    db.category.items.push({
      ...cat,
      userId,
      isActive: true,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 4. Ledger movements: Exactly the 22 transactions from RoseCraft dataset
  const gcashAcc = `acc_rc_gcash_${userId}`;
  const shopeeAcc = `acc_rc_shopee_${userId}`;
  const cashAcc = `acc_rc_cash_${userId}`;

  const catFb = `cat_rc_fb_${userId}`;
  const catShopee = `cat_rc_shopee_${userId}`;
  const catWalkin = `cat_rc_walkin_${userId}`;
  const catRaw = `cat_rc_raw_${userId}`;
  const catPkg = `cat_rc_packaging_${userId}`;
  const catFees = `cat_rc_shopee_fees_${userId}`;
  const catShip = `cat_rc_shipping_${userId}`;
  const catMkt = `cat_rc_marketing_${userId}`;
  const catSup = `cat_rc_supplies_${userId}`;
  const catCapital = `cat_rc_capital_${userId}`;

  const transactions = [
    { date: '2026-08-15', desc: "Owner's initial capital to start the shop", merchant: null, cat: catCapital, acc: gcashAcc, type: 'CAPITAL', amountMinor: 15000_00, dir: 'IN' },
    { date: '2026-08-18', desc: '5 customized tumblers — FB order', merchant: 'Maria Santos', cat: catFb, acc: gcashAcc, type: 'INCOME', amountMinor: 1750_00, dir: 'IN' },
    { date: '2026-08-19', desc: '50 blank tumblers, bulk order', merchant: 'Cebu Tumbler Supply', cat: catRaw, acc: gcashAcc, type: 'EXPENSE', amountMinor: 7500_00, dir: 'OUT' },
    { date: '2026-08-20', desc: 'Shopee Order #1044 — 8 units', merchant: 'Shopee Order #1044', cat: catShopee, acc: shopeeAcc, type: 'INCOME', amountMinor: 3200_00, dir: 'IN' },
    { date: '2026-08-20', desc: 'Shopee commission — Order #1044', merchant: 'Shopee', cat: catFees, acc: shopeeAcc, type: 'EXPENSE', amountMinor: 320_00, dir: 'OUT' },
    { date: '2026-08-21', desc: 'Boxes, bubble wrap, stickers', merchant: 'National Bookstore', cat: catPkg, acc: gcashAcc, type: 'EXPENSE', amountMinor: 850_00, dir: 'OUT' },
    { date: '2026-08-22', desc: 'Facebook Ads boost', merchant: 'Meta Ads', cat: catMkt, acc: gcashAcc, type: 'EXPENSE', amountMinor: 500_00, dir: 'OUT' },
    { date: '2026-08-24', desc: '6 customized tumblers — FB order', merchant: 'Jenny Cruz', cat: catFb, acc: gcashAcc, type: 'INCOME', amountMinor: 2100_00, dir: 'IN' },
    { date: '2026-08-26', desc: 'Courier fee, 6 orders shipped', merchant: 'J&T Express', cat: catShip, acc: gcashAcc, type: 'EXPENSE', amountMinor: 480_00, dir: 'OUT' },
    { date: '2026-08-27', desc: 'Shopee Order #1058 — 5 units', merchant: 'Shopee Order #1058', cat: catShopee, acc: shopeeAcc, type: 'INCOME', amountMinor: 2000_00, dir: 'IN' },
    { date: '2026-08-27', desc: 'Shopee commission — Order #1058', merchant: 'Shopee', cat: catFees, acc: shopeeAcc, type: 'EXPENSE', amountMinor: 200_00, dir: 'OUT' },
    { date: '2026-08-29', desc: '4 tumblers, market day, walk-in', merchant: 'Walk-in', cat: catWalkin, acc: cashAcc, type: 'INCOME', amountMinor: 1400_00, dir: 'IN' },
    { date: '2026-09-01', desc: 'Vinyl sheets + ink refill', merchant: 'Cebu Tumbler Supply', cat: catRaw, acc: gcashAcc, type: 'EXPENSE', amountMinor: 1200_00, dir: 'OUT' },
    { date: '2026-09-02', desc: 'COD payment collected — 3 units (Aug 30 order)', merchant: 'Rina Bautista', cat: catFb, acc: cashAcc, type: 'INCOME', amountMinor: 1050_00, dir: 'IN' },
    { date: '2026-09-03', desc: 'Shopee Order #1071 — 10 units', merchant: 'Shopee Order #1071', cat: catShopee, acc: shopeeAcc, type: 'INCOME', amountMinor: 4000_00, dir: 'IN' },
    { date: '2026-09-03', desc: 'Shopee commission — Order #1071', merchant: 'Shopee', cat: catFees, acc: shopeeAcc, type: 'EXPENSE', amountMinor: 400_00, dir: 'OUT' },
    { date: '2026-09-05', desc: 'Printer ink for shipping labels', merchant: 'SM Office Supplies', cat: catSup, acc: gcashAcc, type: 'EXPENSE', amountMinor: 350_00, dir: 'OUT' },
    { date: '2026-09-08', desc: '7 customized tumblers — FB order', merchant: 'Anna Lopez', cat: catFb, acc: gcashAcc, type: 'INCOME', amountMinor: 2450_00, dir: 'IN' },
    { date: '2026-09-10', desc: 'Courier fee, 7 orders shipped', merchant: 'J&T Express', cat: catShip, acc: gcashAcc, type: 'EXPENSE', amountMinor: 560_00, dir: 'OUT' },
    { date: '2026-09-12', desc: 'Facebook Ads boost', merchant: 'Meta Ads', cat: catMkt, acc: gcashAcc, type: 'EXPENSE', amountMinor: 600_00, dir: 'OUT' },
    { date: '2026-09-14', desc: 'Shopee Order #1089 — 6 units', merchant: 'Shopee Order #1089', cat: catShopee, acc: shopeeAcc, type: 'INCOME', amountMinor: 2400_00, dir: 'IN' },
    { date: '2026-09-14', desc: 'Shopee commission — Order #1089', merchant: 'Shopee', cat: catFees, acc: shopeeAcc, type: 'EXPENSE', amountMinor: 240_00, dir: 'OUT' },
  ];

  transactions.forEach((item, index) => {
    const txId = `tx_rc_${userId}_${index + 1}`;
    const txDate = new Date(`${item.date}T00:00:00.000Z`);
    db.transaction.items.push({
      id: txId,
      userId,
      date: txDate,
      type: item.type,
      description: item.desc,
      amountMinor: item.amountMinor,
      accountId: item.acc,
      categoryId: item.cat,
      merchant: item.merchant,
      feeMinor: 0,
      createdAt: txDate,
      updatedAt: txDate,
    });

    db.ledgerEntry.items.push({
      id: `entry_rc_${userId}_${index + 1}`,
      userId,
      transactionId: txId,
      accountId: item.acc,
      categoryId: item.cat,
      date: txDate,
      amountMinor: item.amountMinor,
      direction: item.dir,
      leg: 'PRIMARY',
      isInternal: false,
      createdAt: txDate,
    });
  });

  // 5. Budgets
  db.budget.items.push(
    {
      id: `budget_rc_raw_${userId}`,
      userId,
      categoryId: catRaw,
      amountMinor: 10000_00,
      period: 'MONTHLY',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `budget_rc_mkt_${userId}`,
      userId,
      categoryId: catMkt,
      amountMinor: 2000_00,
      period: 'MONTHLY',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `budget_rc_ship_${userId}`,
      userId,
      categoryId: catShip,
      amountMinor: 2000_00,
      period: 'MONTHLY',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `budget_rc_sup_${userId}`,
      userId,
      categoryId: catSup,
      amountMinor: 1000_00,
      period: 'MONTHLY',
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
  );

  // 6. Goals
  db.goal.items.push(
    {
      id: `goal_rc_restock_${userId}`,
      userId,
      name: 'Holiday Bulk Inventory Restock',
      targetAmountMinor: 50000_00,
      accountId: gcashAcc,
      targetDate: new Date('2026-11-15T00:00:00.000Z'),
      notes: 'Prepare blank tumblers and festive packaging for Q4 peak orders.',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `goal_rc_laser_${userId}`,
      userId,
      name: 'Rotary Laser Engraver Upgrade',
      targetAmountMinor: 75000_00,
      accountId: gcashAcc,
      targetDate: new Date('2027-01-31T00:00:00.000Z'),
      notes: 'High-speed rotary fiber laser for 360-degree cylindrical engravings.',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
  );

  // 7. Accounts Receivable (COD tracking outside cash)
  db.accountsReceivable.items.push(
    {
      id: `ar_rc_${userId}_1`,
      userId,
      orderDate: '2026-08-30',
      customer: 'Rina Bautista',
      units: 3,
      amountMinor: 1050_00,
      status: 'Collected',
      note: 'Payment collected Sep 2 — logged in General Ledger.',
      createdAt: new Date('2026-08-30T00:00:00.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    },
    {
      id: `ar_rc_${userId}_2`,
      userId,
      orderDate: '2026-09-11',
      customer: 'Mark Delgado',
      units: 4,
      amountMinor: 1400_00,
      status: 'Pending',
      note: 'COD — awaiting rider settlement.',
      createdAt: new Date('2026-09-11T00:00:00.000Z'),
      updatedAt: new Date('2026-09-11T00:00:00.000Z'),
    },
  );
}
