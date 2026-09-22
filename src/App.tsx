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
  ShieldCheck,
  Building,
  Loader2,
} from 'lucide-react';
import { api, session } from './lib/api';
import { money, percent } from './lib/format';
import { AuthScreen } from './components/AuthScreen';
import { AddTransactionModal } from './components/AddTransactionModal';
import { GeneralLedgerView } from './components/GeneralLedgerView';
import { AccountsView } from './components/AccountsView';
import { ReportsView } from './components/ReportsView';
import { BudgetsGoalsView } from './components/BudgetsGoalsView';

export type MainNavTab = 'DASHBOARD' | 'LEDGER' | 'ACCOUNTS' | 'REPORTS' | 'PLANNING';

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
      .then((auth) => setUser(auth?.user ?? null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500 text-sm">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading Personal Finance OS…
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onSuccess={setUser} />;
  }

  return (
    <MainWorkspace
      user={user}
      onSignOut={() => api.logout().then(() => setUser(null))}
    />
  );
}

function MainWorkspace({ user, onSignOut }: { user: UserDto; onSignOut: () => void }) {
  const [activeTab, setActiveTab] = useState<MainNavTab>('DASHBOARD');
  const [preset, setPreset] = useState<PeriodPreset>('THIS_MONTH');
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const periodQuery = { preset };

  // Dashboard query
  const { data: dashData, isLoading: loadingDash } = useQuery({
    queryKey: ['dashboard', preset],
    queryFn: () => api.getDashboard(periodQuery),
  });

  const fmt = (minor: number) => money(minor, user.currency);

  const isRoseCraft = user.email.includes('rosecraft') || user.name?.includes('RoseCraft');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16">
      {/* Top Application Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900">Personal Finance OS</h1>
                {isRoseCraft && (
                  <span className="rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                    RoseCraft Tumblers
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {user.name || user.email} &bull; {user.currency} &bull; {dashData?.period.label ?? 'September 2026'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Global Period Selector */}
            <select
              id="global-period-select"
              value={preset}
              onChange={(e) => setPreset(e.target.value as PeriodPreset)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-slate-900 focus:outline-none"
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Entry</span>
            </button>

            {/* Sign out */}
            <button
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
