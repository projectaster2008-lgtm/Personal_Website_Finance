/**
 * API client.
 *
 * Every endpoint in the backend is wrapped here, typed end to end against
 * `@pfos/shared`. Components should never call `fetch` directly — if a request
 * is missing, add it to this file so auth, refresh and error handling stay in
 * one place.
 *
 * Token handling: the access token lives in memory only. A 401 triggers exactly
 * one refresh attempt, and concurrent 401s share that single attempt rather than
 * stampeding the refresh endpoint.
 */
import type {
  AccountDto,
  ApiError,
  AuthResponse,
  BalanceSheet,
  BudgetProgress,
  CashFlowStatement,
  CategoryDto,
  ChangesInNetWorth,
  CreateAccountInput,
  CreateAdjustmentInput,
  CreateBudgetInput,
  CreateCategoryInput,
  CreateGoalInput,
  CreateLiabilityInput,
  CreateReconciliationInput,
  CreateRecurringInput,
  CreateTransactionInput,
  DashboardSummary,
  GoalProgress,
  ImportPreview,
  ImportResult,
  IncomeStatement,
  IntegrityReport,
  NetWorthHistory,
  Paginated,
  PeriodQuery,
  ReconciliationDto,
  RecurringRuleDto,
  TransactionDto,
  TransactionQuery,
  UpcomingOccurrence,
  UserDto,
} from '@pfos/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

/** Thrown for any non-2xx response. `code` mirrors the server's error code. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** Field-level messages from a 422, keyed by field path. */
  get fieldErrors(): Record<string, string> {
    const fields = (this.details as { fields?: { path: string; message: string }[] })?.fields;
    if (!fields) return {};
    return Object.fromEntries(fields.map((f) => [f.path, f.message]));
  }
}

/* ------------------------------------------------------------- session --- */

let accessToken: string | null = null;
let refreshToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshInFlight: Promise<boolean> | null = null;

export const session = {
  set(auth: AuthResponse): void {
    accessToken = auth.accessToken;
    refreshToken = auth.refreshToken;
    localStorage.setItem('pfos.refresh', auth.refreshToken);
  },
  /** Call once on app start to resume a session from a previous visit. */
  restore(): string | null {
    refreshToken = localStorage.getItem('pfos.refresh');
    return refreshToken;
  },
  clear(): void {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem('pfos.refresh');
  },
  get isAuthenticated(): boolean {
    return Boolean(accessToken);
  },
  /** Register a callback so the app shell can redirect to login. */
  onExpired(handler: () => void): void {
    onSessionExpired = handler;
  },
};

async function attemptRefresh(): Promise<boolean> {
  if (!refreshToken) return false;

  // Share one in-flight refresh across every request that got a 401.
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return false;
      session.set((await response.json()) as AuthResponse);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/* ------------------------------------------------------------ transport --- */

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  raw?: boolean;
  retry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, raw = false, retry = true } = options;

  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (response.status === 401 && retry && refreshToken) {
    if (await attemptRefresh()) return request<T>(path, { ...options, retry: false });
    session.clear();
    onSessionExpired?.();
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      response.status,
      payload?.error.code ?? 'UNKNOWN',
      payload?.error.message ?? response.statusText,
      payload?.error.details,
    );
  }

  if (response.status === 204) return undefined as T;
  if (raw) return (await response.blob()) as T;
  return (await response.json()) as T;
}

/** Period query → URL parameters. */
function periodQuery(period: PeriodQuery): Record<string, string | undefined> {
  return { preset: period.preset, from: period.from, to: period.to };
}

/* ------------------------------------------------------------------ api --- */

export const api = {
  /* auth */
  register: (body: { email: string; password: string; name?: string; seedDefaults?: boolean }) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body }).then(tap(session.set)),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }).then(
      tap(session.set),
    ),

  /** Resumes a stored session. Returns null when there is nothing to resume. */
  resume: async (): Promise<AuthResponse | null> => {
    const stored = session.restore();
    if (!stored) return null;
    try {
      const auth = await request<AuthResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: stored },
        retry: false,
      });
      session.set(auth);
      return auth;
    } catch {
      session.clear();
      return null;
    }
  },

  logout: async () => {
    const stored = localStorage.getItem('pfos.refresh');
    if (stored) await request<void>('/auth/logout', { method: 'POST', body: { refreshToken: stored }, retry: false }).catch(() => undefined);
    session.clear();
  },

  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/password/forgot', { method: 'POST', body: { email } }),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('/auth/password/reset', { method: 'POST', body: { token, password } }),

  /* profile */
  getMe: () => request<UserDto>('/me'),
  updateMe: (body: Partial<Pick<UserDto, 'name' | 'currency' | 'timezone' | 'locale' | 'weekStartsOn'>>) =>
    request<UserDto>('/me', { method: 'PATCH', body }),

  /* accounts */
  listAccounts: (includeInactive = false) =>
    request<AccountDto[]>('/accounts', { query: { includeInactive } }),
  getAccount: (id: string, period: PeriodQuery) =>
    request<AccountDetail>(`/accounts/${id}`, { query: periodQuery(period) }),
  createAccount: (body: CreateAccountInput) =>
    request<AccountDto>('/accounts', { method: 'POST', body }),
  updateAccount: (id: string, body: Partial<CreateAccountInput>) =>
    request<AccountDto>(`/accounts/${id}`, { method: 'PATCH', body }),
  deleteAccount: (id: string) => request<void>(`/accounts/${id}`, { method: 'DELETE' }),

  /* categories */
  listCategories: (includeInactive = false) =>
    request<CategoryDto[]>('/categories', { query: { includeInactive } }),
  createCategory: (body: CreateCategoryInput) =>
    request<CategoryDto>('/categories', { method: 'POST', body }),
  updateCategory: (id: string, body: Partial<CreateCategoryInput>) =>
    request<CategoryDto>(`/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id: string) => request<void>(`/categories/${id}`, { method: 'DELETE' }),

  /* transactions */
  listTransactions: (query: Partial<TransactionQuery>) =>
    request<Paginated<TransactionDto>>('/transactions', {
      query: query as Record<string, string | number | boolean | undefined>,
    }),
  getTransaction: (id: string) => request<TransactionDto>(`/transactions/${id}`),
  createTransaction: (body: CreateTransactionInput) =>
    request<TransactionDto>('/transactions', { method: 'POST', body }),
  updateTransaction: (id: string, body: CreateTransactionInput) =>
    request<TransactionDto>(`/transactions/${id}`, { method: 'PUT', body }),
  duplicateTransaction: (id: string, date?: string) =>
    request<TransactionDto>(`/transactions/${id}/duplicate`, { method: 'POST', body: { date } }),
  deleteTransaction: (id: string) => request<void>(`/transactions/${id}`, { method: 'DELETE' }),

  /* dashboard and reports */
  getDashboard: (period: PeriodQuery) =>
    request<DashboardSummary>('/dashboard', { query: periodQuery(period) }),
  getIncomeStatement: (period: PeriodQuery) =>
    request<IncomeStatement>('/reports/income-statement', { query: periodQuery(period) }),
  getCashFlow: (period: PeriodQuery) =>
    request<CashFlowStatement>('/reports/cash-flow', { query: periodQuery(period) }),
  getBalanceSheet: (period: PeriodQuery) =>
    request<BalanceSheet>('/reports/balance-sheet', { query: periodQuery(period) }),
  getNetWorthChanges: (period: PeriodQuery) =>
    request<ChangesInNetWorth>('/reports/net-worth-changes', { query: periodQuery(period) }),
  getNetWorthHistory: (months: 3 | 6 | 12 | 24 | 120 = 12) =>
    request<NetWorthHistory>('/reports/net-worth-history', { query: { months } }),
  getIntegrity: (period: PeriodQuery) =>
    request<IntegrityReport>('/reports/integrity', { query: periodQuery(period) }),

  /* budgets */
  listBudgets: (month?: string) => request<BudgetProgress[]>('/budgets', { query: { month } }),
  createBudget: (body: CreateBudgetInput) => request<unknown>('/budgets', { method: 'POST', body }),
  updateBudget: (id: string, body: Partial<CreateBudgetInput>) =>
    request<unknown>(`/budgets/${id}`, { method: 'PATCH', body }),
  deleteBudget: (id: string) => request<void>(`/budgets/${id}`, { method: 'DELETE' }),

  /* goals */
  listGoals: (includeArchived = false) =>
    request<GoalProgress[]>('/goals', { query: { includeArchived } }),
  createGoal: (body: CreateGoalInput) => request<unknown>('/goals', { method: 'POST', body }),
  updateGoal: (id: string, body: Partial<CreateGoalInput>) =>
    request<unknown>(`/goals/${id}`, { method: 'PATCH', body }),
  deleteGoal: (id: string) => request<void>(`/goals/${id}`, { method: 'DELETE' }),

  /* recurring */
  listRecurring: () => request<RecurringRuleDto[]>('/recurring'),
  listUpcoming: (days = 30) =>
    request<UpcomingOccurrence[]>('/recurring/upcoming', { query: { days } }),
  createRecurring: (body: CreateRecurringInput) =>
    request<unknown>('/recurring', { method: 'POST', body }),
  updateRecurring: (id: string, body: Partial<CreateRecurringInput> & { isActive?: boolean }) =>
    request<unknown>(`/recurring/${id}`, { method: 'PATCH', body }),
  deleteRecurring: (id: string) => request<void>(`/recurring/${id}`, { method: 'DELETE' }),
  runDueRecurring: () => request<{ posted: number }>('/recurring/run-due', { method: 'POST' }),

  /* liabilities and adjustments */
  listLiabilities: () => request<LiabilityDto[]>('/liabilities'),
  createLiability: (body: CreateLiabilityInput) =>
    request<LiabilityDto>('/liabilities', { method: 'POST', body }),
  updateLiability: (id: string, body: Partial<CreateLiabilityInput>) =>
    request<LiabilityDto>(`/liabilities/${id}`, { method: 'PATCH', body }),
  deleteLiability: (id: string) => request<void>(`/liabilities/${id}`, { method: 'DELETE' }),

  listAdjustments: () => request<AdjustmentDto[]>('/adjustments'),
  createAdjustment: (body: CreateAdjustmentInput) =>
    request<AdjustmentDto>('/adjustments', { method: 'POST', body }),
  deleteAdjustment: (id: string) => request<void>(`/adjustments/${id}`, { method: 'DELETE' }),

  /* reconciliation */
  listReconciliations: (weeks = 8) =>
    request<ReconciliationDto[]>('/reconciliations', { query: { weeks } }),
  saveReconciliation: (body: CreateReconciliationInput) =>
    request<unknown>('/reconciliations', { method: 'POST', body }),
  deleteReconciliation: (id: string) =>
    request<void>(`/reconciliations/${id}`, { method: 'DELETE' }),

  /* import and export */
  previewImport: (csv: string, delimiter = ',', hasHeader = true) =>
    request<ImportPreview>('/import/preview', { method: 'POST', body: { csv, delimiter, hasHeader } }),
  commitImport: (body: {
    csv: string;
    delimiter?: string;
    hasHeader?: boolean;
    mapping: Record<string, number>;
    defaultAccountId?: string;
    skipDuplicates?: boolean;
  }) => request<ImportResult>('/import/commit', { method: 'POST', body }),

  /** Triggers a browser download of the ledger. */
  downloadExport: async (format: 'csv' | 'xlsx', from?: string, to?: string): Promise<void> => {
    const blob = await request<Blob>(`/export/transactions.${format}`, {
      query: { from, to },
      raw: true,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `general-ledger.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  },
};

/* ---------------------------------------------- types the API adds on top --- */

/** Shape returned by `GET /accounts/:id`. */
export interface AccountDetail {
  account: AccountDto;
  period: { from: string; to: string };
  activity: {
    incomeMinor: number;
    expensesMinor: number;
    transfersInMinor: number;
    transfersOutMinor: number;
    feesMinor: number;
    netChangeMinor: number;
  };
  register: {
    entryId: string;
    transactionId: string;
    date: string;
    description: string;
    categoryName: string | null;
    direction: 'IN' | 'OUT';
    leg: 'PRIMARY' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'FEE';
    amountMinor: number;
    effectMinor: number;
    runningBalanceMinor: number;
  }[];
}

export interface LiabilityDto {
  id: string;
  name: string;
  balanceMinor: number;
  creditor: string | null;
  dueDate: string | null;
  notes: string | null;
  isSettled: boolean;
}

export interface AdjustmentDto {
  id: string;
  date: string;
  amountMinor: number;
  reason: string;
  notes: string | null;
}

function tap<T>(fn: (value: T) => void) {
  return (value: T): T => {
    fn(value);
    return value;
  };
}
