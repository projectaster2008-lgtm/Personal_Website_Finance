import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Target, PieChart, ShieldAlert, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { money, percent } from '../lib/format';

interface BudgetsGoalsViewProps {
  currency: string;
}

export function BudgetsGoalsView({ currency }: BudgetsGoalsViewProps) {
  const { data: budgets = [], isLoading: loadingBudgets } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => api.listBudgets(),
  });

  const { data: goals = [], isLoading: loadingGoals } = useQuery({
    queryKey: ['goals'],
    queryFn: () => api.listGoals(false),
  });

  const { data: liabilities = [], isLoading: loadingLiabilities } = useQuery({
    queryKey: ['liabilities'],
    queryFn: () => api.listLiabilities(),
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Planning & Obligations</h2>
        <p className="text-xs text-slate-500">
          Monthly expenditure caps, savings targets, and outstanding debts
        </p>
      </div>

      {/* 1. Budgets Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <PieChart className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-900">Monthly Spending Budgets</h3>
        </div>

        {loadingBudgets ? (
          <div className="p-6 text-center text-slate-400">
            <Loader2 className="mx-auto h-4 w-4 animate-spin mb-1" />
            Loading budgets…
          </div>
        ) : budgets.length === 0 ? (
          <p className="text-xs text-slate-400 py-4">No spending budgets configured.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {budgets.map((b) => {
              const pct = Math.min(100, Math.round(b.percentUsed));
              const isOver = b.status === 'OVER_BUDGET';
              const isWarn = b.status === 'WARNING';
              return (
                <div key={b.id} className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-semibold text-xs text-slate-900">{b.categoryName}</span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isOver
                          ? 'bg-rose-100 text-rose-700'
                          : isWarn
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {percent(b.percentUsed)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden my-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOver ? 'bg-rose-500' : isWarn ? 'bg-amber-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>Spent: <b className="text-slate-700">{money(b.spentMinor, currency)}</b></span>
                    <span>Cap: <b className="text-slate-700">{money(b.budgetMinor, currency)}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Financial Goals Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Target className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-slate-900">Savings & Equipment Goals</h3>
        </div>

        {loadingGoals ? (
          <div className="p-6 text-center text-slate-400">
            <Loader2 className="mx-auto h-4 w-4 animate-spin mb-1" />
            Loading goals…
          </div>
        ) : goals.length === 0 ? (
          <p className="text-xs text-slate-400 py-4">No active savings targets.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {goals.map((g) => {
              const pct = Math.min(100, Math.round(g.percentComplete));
              return (
                <div key={g.id} className="rounded-lg border border-slate-200 p-4 bg-slate-50/50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="font-semibold text-xs text-slate-900">{g.name}</h4>
                      {g.linkedAccount && (
                        <p className="text-[11px] text-slate-500">Linked to: {g.linkedAccount.name}</p>
                      )}
                    </div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      {percent(g.percentComplete)}
                    </span>
                  </div>

                  <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden my-2">
                    <div
                      className="h-full bg-emerald-600 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>Saved: <b className="text-slate-700">{money(g.currentAmountMinor, currency)}</b></span>
                    <span>Target: <b className="text-slate-700">{money(g.targetAmountMinor, currency)}</b></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Liabilities Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <ShieldAlert className="h-4 w-4 text-rose-600" />
          <h3 className="text-sm font-bold text-slate-900">Liabilities & Commercial Notes</h3>
        </div>

        {loadingLiabilities ? (
          <div className="p-6 text-center text-slate-400">
            <Loader2 className="mx-auto h-4 w-4 animate-spin mb-1" />
            Loading liabilities…
          </div>
        ) : liabilities.length === 0 ? (
          <p className="text-xs text-slate-400 py-4">No active liabilities recorded.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {liabilities.map((liab) => (
              <div key={liab.id} className="py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900">{liab.name}</div>
                  <div className="text-slate-500 text-[11px]">
                    Creditor: {liab.creditor || '—'} {liab.dueDate ? ` &bull; Due: ${liab.dueDate.slice(0, 10)}` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-rose-600 block">
                    {money(liab.balanceMinor, currency)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {liab.isSettled ? 'Settled' : 'Active obligation'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
