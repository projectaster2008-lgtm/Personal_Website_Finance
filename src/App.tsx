import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PeriodPreset, UserDto } from '@pfos/shared';
import {
  LayoutDashboard,
  BookOpen,
  Building2,
  FileSpreadsheet,
  PieChart,
  Plus,
  LogOut,
  CheckCircle2,
  X,
  Building,
  Loader2,
  Pencil,
  User,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { api, session } from './lib/api';
import { money, percent } from './lib/format';
import { AuthScreen } from './components/AuthScreen';
import { AddTransactionModal } from './components/AddTransactionModal';
import { GeneralLedgerView } from './components/GeneralLedgerView';
import { AccountsView } from './components/AccountsView';
import { ReportsView } from './components/ReportsView';
import { BudgetsGoalsView } from './components/BudgetsGoalsView';
import { CategoriesAccountsSettingsView } from './components/CategoriesAccountsSettingsView';
import { MonthlyNetIncomeChart } from './components/MonthlyNetIncomeChart';
import { SolvraLogo } from './components/SolvraLogo';

export type MainNavTab = 'DASHBOARD' | 'LEDGER' | 'ACCOUNTS' | 'REPORTS' | 'PLANNING' | 'SETTINGS';

const PERIODS: { value: PeriodPreset; label: string }[] = [
  { value: 'THIS_WEEK', label: 'This week' },
  { value: 'THIS_MONTH', label: 'This month' },
  { value: 'LAST_MONTH', label: 'Last month' },
  { value: 'THIS_YEAR', label: 'This year' },
];

export default function App() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    session.onExpired(() => setUser(null));
    api
      .resume()
      .then(async (auth) => {
        if (auth?.user) {
          setUser(auth.user);
        } else {
          // Instant direct access to Solvra workspace
          try {
            const demoAuth = await api.demoLogin();
            setUser(demoAuth.user);
          } catch {
            setUser(null);
          }
        }
      })
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#f8faf8] text-slate-600 gap-3">
        <SolvraLogo size="md" showTagline={true} />
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mt-2">
          <Loader2 className="h-4 w-4 animate-spin text-[#0C3826]" />
          <span>Loading Solvra Financial Workspace…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSuccess={setUser} />;
  }

  return (
    <MainWorkspace
      user={user}
      onUserUpdated={setUser}
      onSignOut={() => api.logout().then(() => setUser(null))}
    />
  );
}

function MainWorkspace({
  user,
  onUserUpdated,
  onSignOut,
}: {
  user: UserDto;
  onUserUpdated: (user: UserDto) => void;
  onSignOut: () => void;
}) {
  const [activeTab, setActiveTab] = useState<MainNavTab>('DASHBOARD');
  const [preset, setPreset] = useState<PeriodPreset>('THIS_MONTH');
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isEditNameOpen, setIsEditNameOpen] = useState(false);
  const [nameInput, setNameInput] = useState(user.name || '');
  const [updatingName, setUpdatingName] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setUpdatingName(true);
    try {
      const updated = await api.updateMe({ name: nameInput.trim() });
      onUserUpdated(updated);
      setIsEditNameOpen(false);
      showToast(`Name updated to "${updated.name}"`);
    } catch {
      showToast('Failed to update name. Please try again.');
    } finally {
      setUpdatingName(false);
    }
  };

  const periodQuery = { preset };

  // Dashboard query
  const { data: dashData, isLoading: loadingDash } = useQuery({
    queryKey: ['dashboard', preset],
    queryFn: () => api.getDashboard(periodQuery),
  });

  const fmt = (minor: number) => money(minor, user.currency);

  const initials = (user.name || user.email || 'U')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Top Application Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          {/* Solvra Brand Header */}
          <div className="flex items-center gap-3">
            <SolvraLogo size="sm" showTagline={true} />
            <span className="hidden sm:inline-block rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold text-[#0C3826]">
              Financial OS
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Global Period Selector */}
            <select
              id="global-period-select"
              value={preset}
              onChange={(e) => setPreset(e.target.value as PeriodPreset)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-[#0C3826] focus:outline-none"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            {/* Quick Add Transaction */}
            <button
              id="open-add-transaction-btn"
              type="button"
              onClick={() => setIsAddTxOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0C3826] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#08281b] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Entry</span>
            </button>

            {/* User Profile Badge (Actual User Name) */}
            <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-slate-200">
              <button
                type="button"
                id="user-profile-badge-btn"
                onClick={() => {
                  setNameInput(user.name || '');
                  setIsEditNameOpen(true);
                }}
                title="Click to edit your name"
                className="group flex items-center gap-2 text-left p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0C3826] text-white text-xs font-bold shadow-sm">
                  {initials}
                </div>
                <div className="hidden md:flex flex-col">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-1 leading-tight group-hover:text-[#0C3826]">
                    {user.name || 'User'}
                    <Pencil className="h-2.5 w-2.5 text-slate-400 group-hover:text-[#0C3826]" />
                  </span>
                  <span className="text-[10px] text-slate-500 leading-tight truncate max-w-[120px]">
                    {user.email}
                  </span>
                </div>
              </button>
            </div>

            {/* Sign out */}
            <button
              id="sign-out-btn"
              type="button"
              onClick={onSignOut}
              title="Sign out"
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <nav className="flex space-x-1 overflow-x-auto border-t border-slate-100 py-1.5 scrollbar-none">
            <NavButton
              id="nav-tab-dashboard"
              active={activeTab === 'DASHBOARD'}
              onClick={() => setActiveTab('DASHBOARD')}
              icon={<LayoutDashboard className="h-3.5 w-3.5" />}
              label="Dashboard"
            />
            <NavButton
              id="nav-tab-ledger"
              active={activeTab === 'LEDGER'}
              onClick={() => setActiveTab('LEDGER')}
              icon={<BookOpen className="h-3.5 w-3.5" />}
              label="General Ledger"
            />
            <NavButton
              id="nav-tab-accounts"
              active={activeTab === 'ACCOUNTS'}
              onClick={() => setActiveTab('ACCOUNTS')}
              icon={<Building2 className="h-3.5 w-3.5" />}
              label="Accounts & AR"
            />
            <NavButton
              id="nav-tab-reports"
              active={activeTab === 'REPORTS'}
              onClick={() => setActiveTab('REPORTS')}
              icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
              label="Financial Statements"
            />
            <NavButton
              id="nav-tab-planning"
              active={activeTab === 'PLANNING'}
              onClick={() => setActiveTab('PLANNING')}
              icon={<PieChart className="h-3.5 w-3.5" />}
              label="Budgets & Planning"
            />
            <NavButton
              id="nav-tab-settings"
              active={activeTab === 'SETTINGS'}
              onClick={() => setActiveTab('SETTINGS')}
              icon={<Sliders className="h-3.5 w-3.5" />}
              label="Categories & Accounts"
            />
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        {/* Toast Alert */}
        {toast && (
          <div
            role="status"
            className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-xs font-medium text-white shadow-xl ring-1 ring-white/10"
          >
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Edit Display Name Modal */}
        {isEditNameOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-[#0C3826]">
                    <User className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">Your Display Name</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditNameOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveName} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Display Name
                  </label>
                  <input
                    id="edit-display-name-input"
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0C3826] focus:ring-1 focus:ring-[#0C3826] focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    This is your actual name displayed on your reports, header, and workspace.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditNameOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    id="save-display-name-btn"
                    type="submit"
                    disabled={updatingName}
                    className="rounded-lg bg-[#0C3826] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#08281b] transition-colors disabled:opacity-50"
                  >
                    {updatingName ? 'Saving…' : 'Save Name'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Global Transaction Modal */}
        <AddTransactionModal
          isOpen={isAddTxOpen}
          onClose={() => setIsAddTxOpen(false)}
          onSuccess={showToast}
          currency={user.currency}
        />

        {/* 1. DASHBOARD VIEW */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-6">
            {/* Personalized Welcome Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-gradient-to-r from-[#0C3826] via-[#124b34] to-[#1a6345] p-5 text-white shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-full overflow-hidden border-2 border-white/20 shadow-inner bg-white shrink-0">
                  <img src="/solvra-logo.jpg" alt="Solvra" className="h-full w-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base sm:text-lg font-bold">
                      Welcome, {user.name || 'User'}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(user.name || '');
                        setIsEditNameOpen(true);
                      }}
                      title="Edit display name"
                      className="rounded bg-white/10 hover:bg-white/20 p-1 text-emerald-200 hover:text-white transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-xs text-emerald-100/80">
                    Solvra Financial OS &bull; {dashData?.period.label ?? 'Current Period'} &bull; {user.currency}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/20 border border-emerald-300/30 px-3 py-1 text-xs font-semibold text-emerald-100">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  Ledger Balanced
                </span>
              </div>
            </div>
            {/* Integrity Alerts if any */}
            {dashData && dashData.alerts.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="font-semibold text-xs text-red-900">Ledger Attention Needed</p>
                <ul className="mt-1 list-disc pl-5 text-xs text-red-700">
                  {dashData.alerts.map((alert, i) => (
                    <li key={i}>{alert.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Core Stats Overview */}
            {dashData && (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatCard label="Total Cash" value={fmt(dashData.totalCashMinor)} />
                <StatCard label="Net Worth" value={fmt(dashData.netWorthMinor)} />
                <StatCard label="Income" value={fmt(dashData.incomeMinor)} tone="income" />
                <StatCard label="Expenses" value={fmt(dashData.expensesMinor)} tone="expense" />
              </div>
            )}

            {/* Net Income Callout */}
            {dashData && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Net Operating Income
                    </h3>
                    <p className="text-[11px] text-slate-400">Total Income minus Operating Expenses for the period</p>
                  </div>
                  <span className="font-mono text-2xl font-bold text-slate-900">
                    {fmt(dashData.netIncomeMinor)}
                  </span>
                </div>
              </div>
            )}

            {/* Monthly Net Income Trend Chart */}
            {dashData && (
              <MonthlyNetIncomeChart
                data={dashData.trend}
                currency={user.currency}
              />
            )}

            {/* Split Panels: Where it went + Accounts Quick Glance */}
            {dashData && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Spending Breakdown
                    </h3>
                    <span className="text-[11px] text-slate-400">By Category</span>
                  </div>
                  {dashData.expenseBreakdown.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">No expenses recorded in this period.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 text-xs">
                      {dashData.expenseBreakdown.map((line) => (
                        <li key={line.name} className="flex justify-between py-2">
                          <span className="text-slate-700">{line.name}</span>
                          <span className="font-mono text-slate-900">
                            {fmt(line.amountMinor)} <span className="text-slate-400 text-[10px]">({percent(line.percent)})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Accounts & Balances
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ACCOUNTS')}
                      className="text-[11px] text-indigo-600 hover:underline"
                    >
                      View All Registers &rarr;
                    </button>
                  </div>
                  <ul className="divide-y divide-slate-100 text-xs">
                    {dashData.accounts.map((account) => (
                      <li key={account.id} className="flex justify-between py-2">
                        <span className="text-slate-700 font-medium">{account.name}</span>
                        <span className="font-mono font-bold text-slate-900">{fmt(account.balanceMinor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Recent Ledger Entries */}
            {dashData && (
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Recent Activity
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('LEDGER')}
                    className="text-[11px] text-indigo-600 hover:underline"
                  >
                    Open General Ledger &rarr;
                  </button>
                </div>
                {dashData.recentTransactions.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">No transactions recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-xs">
                    {dashData.recentTransactions.map((tx) => (
                      <li key={tx.id} className="flex items-center justify-between py-2.5">
                        <div>
                          <p className="font-medium text-slate-900">{tx.description}</p>
                          <p className="text-[11px] text-slate-500">
                            {tx.date} &bull; {tx.category?.name ?? 'Transfer'}
                          </p>
                        </div>
                        <span className="font-mono font-bold text-slate-900">{fmt(tx.amountMinor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. GENERAL LEDGER VIEW */}
        {activeTab === 'LEDGER' && (
          <GeneralLedgerView
            period={periodQuery}
            currency={user.currency}
            onAddTransaction={() => setIsAddTxOpen(true)}
            onSuccessToast={showToast}
          />
        )}

        {/* 3. ACCOUNTS & RECEIVABLES VIEW */}
        {activeTab === 'ACCOUNTS' && (
          <AccountsView
            period={periodQuery}
            currency={user.currency}
            onSuccessToast={showToast}
          />
        )}

        {/* 4. FINANCIAL STATEMENTS VIEW */}
        {activeTab === 'REPORTS' && (
          <ReportsView
            period={periodQuery}
            currency={user.currency}
          />
        )}

        {/* 5. BUDGETS & PLANNING VIEW */}
        {activeTab === 'PLANNING' && (
          <BudgetsGoalsView
            currency={user.currency}
          />
        )}

        {/* 6. SETTINGS: CATEGORIES & ACCOUNTS VIEW */}
        {activeTab === 'SETTINGS' && (
          <CategoriesAccountsSettingsView
            currency={user.currency}
            onSuccessToast={showToast}
          />
        )}
      </main>
    </div>
  );
}

function NavButton({
  id,
  active,
  onClick,
  icon,
  label,
}: {
  id?: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      id={id}
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
        active
          ? 'bg-slate-900 text-white font-semibold shadow-sm'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'income' | 'expense' }) {
  const color = tone === 'income' ? 'text-emerald-600' : tone === 'expense' ? 'text-rose-600' : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`font-mono text-xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
