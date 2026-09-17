import bcrypt from 'bcryptjs';

let idCounter = 1000;
function nextId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

function matchesCondition(val: any, cond: any): boolean {
  if (cond === undefined) return true;
  if (cond === null) return val === null;

  if (typeof cond === 'object' && cond !== null) {
    if (cond instanceof Date) {
      const vTime = val instanceof Date ? val.getTime() : new Date(val).getTime();
      return vTime === cond.getTime();
    }
    if ('in' in cond && Array.isArray(cond.in)) {
      return cond.in.includes(val);
    }
    if ('notIn' in cond && Array.isArray(cond.notIn)) {
      return !cond.notIn.includes(val);
    }
    if ('not' in cond) {
      return val !== cond.not;
    }
    let matched = true;
    const v =
      val instanceof Date
        ? val.getTime()
        : typeof val === 'number'
        ? val
        : val
        ? new Date(val).getTime()
        : NaN;

    if ('gte' in cond) {
      const c =
        cond.gte instanceof Date
          ? cond.gte.getTime()
          : typeof cond.gte === 'number'
          ? cond.gte
          : new Date(cond.gte).getTime();
      if (!(v >= c)) matched = false;
    }
    if ('lte' in cond) {
      const c =
        cond.lte instanceof Date
          ? cond.lte.getTime()
          : typeof cond.lte === 'number'
          ? cond.lte
          : new Date(cond.lte).getTime();
      if (!(v <= c)) matched = false;
    }
    if ('gt' in cond) {
      const c =
        cond.gt instanceof Date
          ? cond.gt.getTime()
          : typeof cond.gt === 'number'
          ? cond.gt
          : new Date(cond.gt).getTime();
      if (!(v > c)) matched = false;
    }
    if ('lt' in cond) {
      const c =
        cond.lt instanceof Date
          ? cond.lt.getTime()
          : typeof cond.lt === 'number'
          ? cond.lt
          : new Date(cond.lt).getTime();
      if (!(v < c)) matched = false;
    }
    if ('contains' in cond && typeof val === 'string') {
      const mode = cond.mode;
      const haystack = mode === 'insensitive' ? val.toLowerCase() : val;
      const needle =
        mode === 'insensitive'
          ? String(cond.contains).toLowerCase()
          : String(cond.contains);
      if (!haystack.includes(needle)) matched = false;
    }
    return matched;
  }

  return val === cond;
}

function filterItem(item: any, where?: any): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'OR' && Array.isArray(cond)) {
      if (!cond.some((subWhere) => filterItem(item, subWhere))) return false;
      continue;
    }
    if (key === 'AND' && Array.isArray(cond)) {
      if (!cond.every((subWhere) => filterItem(item, subWhere))) return false;
      continue;
    }
    if (key === 'NOT') {
      if (filterItem(item, cond)) return false;
      continue;
    }
    if (!matchesCondition(item[key], cond)) return false;
  }
  return true;
}

function sortItems(items: any[], orderBy?: any): any[] {
  if (!orderBy) return items;
  const orderEntries = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...items].sort((a, b) => {
    for (const order of orderEntries) {
      for (const [key, dir] of Object.entries(order)) {
        const valA = a[key];
        const valB = b[key];
        if (valA === valB) continue;
        const asc = (dir as string).toLowerCase() === 'asc';
        if (valA instanceof Date && valB instanceof Date) {
          return asc ? valA.getTime() - valB.getTime() : valB.getTime() - valA.getTime();
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return asc ? valA - valB : valB - valA;
        }
        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
      }
    }
    return 0;
  });
}

export class InMemoryCollection<T extends { id: string }> {
  public items: T[] = [];
  private name: string;
  private db: InMemoryDatabase;

  constructor(name: string, db: InMemoryDatabase) {
    this.name = name;
    this.db = db;
  }

  private getRelation(item: any, rel: string): any {
    if (this.name === 'transaction') {
      if (rel === 'account') return this.db.account.items.find((a) => a.id === item.accountId) || null;
      if (rel === 'category') return this.db.category.items.find((c) => c.id === item.categoryId) || null;
      if (rel === 'fromAccount') return this.db.account.items.find((a) => a.id === item.fromAccountId) || null;
      if (rel === 'toAccount') return this.db.account.items.find((a) => a.id === item.toAccountId) || null;
      if (rel === 'entries') return this.db.ledgerEntry.items.filter((e: any) => e.transactionId === item.id);
    } else if (this.name === 'ledgerEntry') {
      if (rel === 'account') return this.db.account.items.find((a) => a.id === item.accountId) || null;
      if (rel === 'category') return this.db.category.items.find((c) => c.id === item.categoryId) || null;
      if (rel === 'transaction') return this.db.transaction.items.find((t) => t.id === item.transactionId) || null;
    } else if (this.name === 'budget') {
      if (rel === 'category') return this.db.category.items.find((c) => c.id === item.categoryId) || null;
    } else if (this.name === 'goal') {
      if (rel === 'account') return this.db.account.items.find((a) => a.id === item.accountId) || null;
    } else if (this.name === 'recurringRule') {
      if (rel === 'account') return this.db.account.items.find((a) => a.id === item.accountId) || null;
      if (rel === 'category') return this.db.category.items.find((c) => c.id === item.categoryId) || null;
      if (rel === 'fromAccount') return this.db.account.items.find((a) => a.id === item.fromAccountId) || null;
      if (rel === 'toAccount') return this.db.account.items.find((a) => a.id === item.toAccountId) || null;
    } else if (this.name === 'reconciliation') {
      if (rel === 'account') return this.db.account.items.find((a) => a.id === item.accountId) || null;
    } else if (this.name === 'refreshToken') {
      if (rel === 'user') return this.db.user.items.find((u) => u.id === item.userId) || null;
    }
    return null;
  }

  private resolveRelations(item: any, include?: any, select?: any): any {
    if (!item) return null;

    if (select) {
      const selected: any = {};
      for (const [key, val] of Object.entries(select)) {
        if (!val) continue;
        if (typeof val === 'object' && val !== null) {
          const relObj = this.getRelation(item, key);
          if ('select' in val && typeof val.select === 'object') {
            if (relObj) {
              const subSelected: any = {};
              const selectObj = (val.select && typeof val.select === 'object') ? val.select : {};
              for (const [sKey, sVal] of Object.entries(selectObj)) {
                if (sVal) subSelected[sKey] = (relObj as any)[sKey];
              }
              selected[key] = subSelected;
            } else {
              selected[key] = null;
            }
          } else {
            selected[key] = relObj;
          }
        } else {
          selected[key] = item[key];
        }
      }
      return selected;
    }

    let result = { ...item };
    if (include) {
      for (const [rel, inc] of Object.entries(include)) {
        if (!inc) continue;
        result[rel] = this.getRelation(item, rel);
      }
    }

    return result;
  }

  async findMany(args: any = {}): Promise<any[]> {
    let filtered = this.items.filter((item) => filterItem(item, args.where));
    filtered = sortItems(filtered, args.orderBy);

    const skip = args.skip || 0;
    const take = args.take !== undefined ? args.take : filtered.length;
    const paged = filtered.slice(skip, skip + take);

    return paged.map((item) => this.resolveRelations(item, args.include, args.select));
  }

  async findFirst(args: any = {}): Promise<any | null> {
    const list = await this.findMany(args);
    return list.length > 0 ? list[0] : null;
  }

  async findFirstOrThrow(args: any = {}): Promise<any> {
    const res = await this.findFirst(args);
    if (!res) throw new Error(`Record not found in ${this.name}`);
    return res;
  }

  async findUnique(args: any = {}): Promise<any | null> {
    return this.findFirst(args);
  }

  async findUniqueOrThrow(args: any = {}): Promise<any> {
    return this.findFirstOrThrow(args);
  }

  async count(args: any = {}): Promise<number> {
    return this.items.filter((item) => filterItem(item, args.where)).length;
  }

  async create(args: any): Promise<any> {
    const now = new Date();
    const id = args.data.id || nextId(this.name);
    const item: any = {
      id,
      createdAt: now,
      updatedAt: now,
      ...args.data,
    };
    this.items.push(item);
    return this.resolveRelations(item, args.include, args.select);
  }

  async createMany(args: any): Promise<{ count: number }> {
    const dataList = Array.isArray(args.data) ? args.data : [args.data];
    const now = new Date();
    for (const d of dataList) {
      const id = d.id || nextId(this.name);
      this.items.push({
        id,
        createdAt: now,
        updatedAt: now,
        ...d,
      });
    }
    return { count: dataList.length };
  }

  async update(args: any): Promise<any> {
    const index = this.items.findIndex((item) => filterItem(item, args.where));
    if (index === -1) throw new Error(`Record not found in ${this.name} for update`);

    const current = this.items[index];
    const updated = {
      ...current,
      ...args.data,
      updatedAt: new Date(),
    };
    this.items[index] = updated;
    return this.resolveRelations(updated, args.include, args.select);
  }

  async updateMany(args: any): Promise<{ count: number }> {
    let count = 0;
    for (let i = 0; i < this.items.length; i++) {
      if (filterItem(this.items[i], args.where)) {
        this.items[i] = {
          ...this.items[i],
          ...args.data,
          updatedAt: new Date(),
        };
        count++;
      }
    }
    return { count };
  }

  async delete(args: any): Promise<any> {
    const index = this.items.findIndex((item) => filterItem(item, args.where));
    if (index === -1) throw new Error(`Record not found in ${this.name} for delete`);
    const [deleted] = this.items.splice(index, 1);
    return deleted;
  }

  async deleteMany(args: any = {}): Promise<{ count: number }> {
    const initial = this.items.length;
    this.items = this.items.filter((item) => !filterItem(item, args.where));
    return { count: initial - this.items.length };
  }

  async upsert(args: any): Promise<any> {
    const existing = await this.findFirst({ where: args.where });
    if (existing) {
      return this.update({ where: { id: existing.id }, data: args.update, include: args.include, select: args.select });
    }
    return this.create({ data: { ...args.where, ...args.create }, include: args.include, select: args.select });
  }
}

export class InMemoryDatabase {
  user = new InMemoryCollection<any>('user', this);
  account = new InMemoryCollection<any>('account', this);
  category = new InMemoryCollection<any>('category', this);
  transaction = new InMemoryCollection<any>('transaction', this);
  ledgerEntry = new InMemoryCollection<any>('ledgerEntry', this);
  budget = new InMemoryCollection<any>('budget', this);
  goal = new InMemoryCollection<any>('goal', this);
  recurringRule = new InMemoryCollection<any>('recurringRule', this);
  liability = new InMemoryCollection<any>('liability', this);
  reconciliation = new InMemoryCollection<any>('reconciliation', this);
  netWorthAdjustment = new InMemoryCollection<any>('netWorthAdjustment', this);
  attachment = new InMemoryCollection<any>('attachment', this);
  refreshToken = new InMemoryCollection<any>('refreshToken', this);
  passwordReset = new InMemoryCollection<any>('passwordReset', this);

  async $transaction(arg: any): Promise<any> {
    if (typeof arg === 'function') {
      return arg(this);
    }
    if (Array.isArray(arg)) {
      const results: any[] = [];
      for (const p of arg) {
        results.push(await p);
      }
      return results;
    }
    return arg;
  }

  async $disconnect(): Promise<void> {}
  async $connect(): Promise<void> {}
}

export function seedDemoData(db: InMemoryDatabase) {
  const userId = 'user_demo_aster';
  const now = new Date();

  // 1. Demo User
  db.user.items.push({
    id: userId,
    email: 'demo@pfos.local',
    passwordHash: bcrypt.hashSync('demo1234', 10),
    name: 'Demo User',
    currency: 'PHP',
    timezone: 'Asia/Manila',
    locale: 'en-PH',
    weekStartsOn: 1,
    createdAt: now,
    updatedAt: now,
  });

  // 2. Default accounts
  const accountsData = [
    { id: 'acc_maribank', name: 'MariBank', type: 'BANK', role: 'CONVENIENCE_WALLET', notes: 'Primary digital account.', openingBalanceMinor: 0, isSystem: true, sortOrder: 0 },
    { id: 'acc_unionbank', name: 'UnionBank', type: 'BANK', role: 'PROFESSIONAL_ANCHOR', notes: 'Payroll and formal transactions.', openingBalanceMinor: 0, isSystem: true, sortOrder: 1 },
    { id: 'acc_gcash', name: 'GCash', type: 'EWALLET', role: 'TRANSIT_STATION', notes: 'Bridge wallet.', openingBalanceMinor: 0, isSystem: true, sortOrder: 2 },
    { id: 'acc_gotyme_ef', name: 'GoTyme - Emergency Fund', type: 'SAVINGS', role: 'VAULT', notes: 'Emergency savings.', openingBalanceMinor: 0, isSystem: true, sortOrder: 3 },
    { id: 'acc_gotyme_gf', name: 'GoTyme - Gadget Fund', type: 'SAVINGS', role: 'VAULT', notes: 'Gadget replacement fund.', openingBalanceMinor: 0, isSystem: true, sortOrder: 4 },
    { id: 'acc_physical', name: 'Physical Wallet', type: 'CASH', role: 'DAILY_WALLET', notes: 'Primary physical wallet.', openingBalanceMinor: 0, isSystem: true, sortOrder: 5 },
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

  // 3. Default categories
  const categoriesData = [
    { id: 'cat_allowance', name: 'Allowance', kind: 'INCOME', description: 'Regular allowance.', color: '#16a34a', sortOrder: 0 },
    { id: 'cat_freelance', name: 'Freelance/Side Income', kind: 'INCOME', description: 'Freelance payments.', color: '#0d9488', sortOrder: 1 },
    { id: 'cat_gifts', name: 'Gifts Received/Scholarships', kind: 'INCOME', description: 'Cash gifts.', color: '#0891b2', sortOrder: 2 },
    { id: 'cat_interest', name: 'Interest Earned', kind: 'INCOME', description: 'Bank interest.', color: '#2563eb', sortOrder: 3 },
    { id: 'cat_food', name: 'Food', kind: 'EXPENSE', description: 'Meals and groceries.', color: '#ea580c', sortOrder: 4 },
    { id: 'cat_transpo', name: 'Transportation', kind: 'EXPENSE', description: 'Fares and gas.', color: '#d97706', sortOrder: 5 },
    { id: 'cat_load', name: 'Load/Subscriptions', kind: 'EXPENSE', description: 'Subscriptions.', color: '#7c3aed', sortOrder: 6 },
    { id: 'cat_shopping', name: 'Shopping', kind: 'EXPENSE', description: 'Purchases.', color: '#db2777', sortOrder: 7 },
    { id: 'cat_misc', name: 'Miscellaneous', kind: 'EXPENSE', description: 'Miscellaneous.', color: '#64748b', sortOrder: 8 },
    { id: 'cat_transfer_fee', name: 'Transfer Fees', kind: 'EXPENSE', description: 'Bank transfer fees.', color: '#b91c1c', sortOrder: 9 },
    { id: 'cat_internal', name: 'Internal Transfer', kind: 'INTERNAL', description: 'Money moving between own accounts.', color: '#475569', sortOrder: 10 },
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

  // 4. Sample Transactions and Ledger Entries from Workbook
  // Row 1: 2026-09-10 - Borrow from uncle, to buy uniform (Income ₱2,000)
  const tx1Id = 'tx_seed_1';
  db.transaction.items.push({
    id: tx1Id,
    userId,
    date: new Date('2026-09-10T00:00:00.000Z'),
    type: 'INCOME',
    description: 'Borrow from uncle, to buy uniform',
    amountMinor: 200_000,
    accountId: 'acc_physical',
    categoryId: 'cat_allowance',
    feeMinor: 0,
    createdAt: now,
    updatedAt: now,
  });
  db.ledgerEntry.items.push({
    id: 'entry_1',
    userId,
    transactionId: tx1Id,
    accountId: 'acc_physical',
    categoryId: 'cat_allowance',
    date: new Date('2026-09-10T00:00:00.000Z'),
    amountMinor: 200_000,
    direction: 'IN',
    leg: 'PRIMARY',
    isInternal: false,
    createdAt: now,
  });

  // Row 2: 2026-09-11 - Class Uniform (Expense ₱1,000)
  const tx2Id = 'tx_seed_2';
  db.transaction.items.push({
    id: tx2Id,
    userId,
    date: new Date('2026-09-11T00:00:00.000Z'),
    type: 'EXPENSE',
    description: 'Class Uniform',
    amountMinor: 100_000,
    accountId: 'acc_physical',
    categoryId: 'cat_misc',
    feeMinor: 0,
    createdAt: now,
    updatedAt: now,
  });
  db.ledgerEntry.items.push({
    id: 'entry_2',
    userId,
    transactionId: tx2Id,
    accountId: 'acc_physical',
    categoryId: 'cat_misc',
    date: new Date('2026-09-11T00:00:00.000Z'),
    amountMinor: 100_000,
    direction: 'OUT',
    leg: 'PRIMARY',
    isInternal: false,
    createdAt: now,
  });

  // Row 3: 2026-09-12 - PE Uniform (Expense ₱600)
  const tx3Id = 'tx_seed_3';
  db.transaction.items.push({
    id: tx3Id,
    userId,
    date: new Date('2026-09-12T00:00:00.000Z'),
    type: 'EXPENSE',
    description: 'PE Uniform',
    amountMinor: 60_000,
    accountId: 'acc_physical',
    categoryId: 'cat_misc',
    feeMinor: 0,
    createdAt: now,
    updatedAt: now,
  });
  db.ledgerEntry.items.push({
    id: 'entry_3',
    userId,
    transactionId: tx3Id,
    accountId: 'acc_physical',
    categoryId: 'cat_misc',
    date: new Date('2026-09-12T00:00:00.000Z'),
    amountMinor: 60_000,
    direction: 'OUT',
    leg: 'PRIMARY',
    isInternal: false,
    createdAt: now,
  });

  // Row 4: 2026-09-14 - Foods, Snacks (Expense ₱100)
  const tx4Id = 'tx_seed_4';
  db.transaction.items.push({
    id: tx4Id,
    userId,
    date: new Date('2026-09-14T00:00:00.000Z'),
    type: 'EXPENSE',
    description: 'Foods, Snacks',
    amountMinor: 10_000,
    accountId: 'acc_physical',
    categoryId: 'cat_food',
    feeMinor: 0,
    createdAt: now,
    updatedAt: now,
  });
  db.ledgerEntry.items.push({
    id: 'entry_4',
    userId,
    transactionId: tx4Id,
    accountId: 'acc_physical',
    categoryId: 'cat_food',
    date: new Date('2026-09-14T00:00:00.000Z'),
    amountMinor: 10_000,
    direction: 'OUT',
    leg: 'PRIMARY',
    isInternal: false,
    createdAt: now,
  });

  // 5. Goals
  db.goal.items.push(
    {
      id: 'goal_ef',
      userId,
      name: 'Emergency Fund',
      targetAmountMinor: 3_000_000,
      accountId: 'acc_gotyme_ef',
      targetDate: new Date('2027-09-30T00:00:00.000Z'),
      notes: 'Three months of essentials.',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'goal_gf',
      userId,
      name: 'Gadget Fund',
      targetAmountMinor: 4_500_000,
      accountId: 'acc_gotyme_gf',
      targetDate: null,
      notes: 'Laptop replacement.',
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    },
  );

  // 6. Budgets
  db.budget.items.push(
    {
      id: 'budget_food',
      userId,
      categoryId: 'cat_food',
      amountMinor: 250_000,
      period: 'MONTHLY',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'budget_transpo',
      userId,
      categoryId: 'cat_transpo',
      amountMinor: 120_000,
      period: 'MONTHLY',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'budget_shopping',
      userId,
      categoryId: 'cat_shopping',
      amountMinor: 150_000,
      period: 'MONTHLY',
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      createdAt: now,
      updatedAt: now,
    },
  );

  // 7. Recurring rules
  db.recurringRule.items.push(
    {
      id: 'rule_allowance',
      userId,
      type: 'INCOME',
      description: 'Monthly allowance',
      amountMinor: 200_000,
      categoryId: 'cat_allowance',
      accountId: 'acc_maribank',
      frequency: 'MONTHLY',
      anchorDay: 1,
      startDate: new Date('2026-09-01T00:00:00.000Z'),
      autoPost: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rule_spotify',
      userId,
      type: 'EXPENSE',
      description: 'Spotify',
      amountMinor: 14_900,
      categoryId: 'cat_load',
      accountId: 'acc_maribank',
      frequency: 'MONTHLY',
      anchorDay: 15,
      startDate: new Date('2026-09-15T00:00:00.000Z'),
      autoPost: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rule_internet',
      userId,
      type: 'EXPENSE',
      description: 'Internet',
      amountMinor: 150_000,
      categoryId: 'cat_load',
      accountId: 'acc_maribank',
      frequency: 'MONTHLY',
      anchorDay: 20,
      startDate: new Date('2026-09-20T00:00:00.000Z'),
      autoPost: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  );
}

export function createInMemoryPrisma() {
  const db = new InMemoryDatabase();
  seedDemoData(db);
  return db;
}
