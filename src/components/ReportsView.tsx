import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Scale,
  ArrowRightLeft,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Info,
} from 'lucide-react';
import { api } from '../lib/api';
import { money, percent } from '../lib/format';
import type { PeriodQuery } from '@pfos/shared';

interface ReportsViewProps {
  period: PeriodQuery;
  currency: string;
}

type ReportTab = 'INCOME_STATEMENT' | 'BALANCE_SHEET' | 'CASH_FLOW' | 'NET_WORTH';

export function ReportsView({ period, currency }: ReportsViewProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('INCOME_STATEMENT');

  // Queries for the 4 core financial reports
  const { data: incomeStatement, isLoading: loadingIS } = useQuery({
    queryKey: ['income-statement', period],
    queryFn: () => api.getIncomeStatement(period),
  });

  const { data: balanceSheet, isLoading: loadingBS } = useQuery({
    queryKey: ['balance-sheet', period],
    queryFn: () => api.getBalanceSheet(period),
  });

  const { data: cashFlow, isLoading: loadingCF } = useQuery({
    queryKey: ['cash-flow', period],
    queryFn: () => api.getCashFlow(period),
  });

  const { data: netWorthChanges, isLoading: loadingNW } = useQuery({
    queryKey: ['net-worth-changes', period],
    queryFn: () => api.getNetWorthChanges(period),
  });

  return (
    <div className="space-y-6">
      {/* Header and Report Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Financial Statements</h2>
          <p className="text-xs text-slate-500">
            Formally reconciled accounting reports derived directly from the double-entry General Ledger
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('INCOME_STATEMENT')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'INCOME_STATEMENT'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Income Statement
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('BALANCE_SHEET')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'BALANCE_SHEET'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            Balance Sheet
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CASH_FLOW')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'CASH_FLOW'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
            Cash Flow
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('NET_WORTH')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'NET_WORTH'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Net Worth Changes
          </button>
        </div>
      </div>

      {/* 1. INCOME STATEMENT */}
      {activeTab === 'INCOME_STATEMENT' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900">Income Statement (Profit & Loss)</h3>
            <p className="text-xs text-slate-500">
              For period {incomeStatement?.period.from} through {incomeStatement?.period.to}
            </p>
          </div>

          {loadingIS ? (
            <div className="p-8 text-center text-slate-400">
              <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />
              Computing Income Statement…
            </div>
          ) : !incomeStatement ? (
            <p className="text-xs text-slate-500">Unable to load Income Statement.</p>
          ) : (
            <div className="space-y-6 max-w-3xl">
              {/* Revenue Section */}
              <div>
                <div className="flex justify-between border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wider text-slate-900">
                  <span>Revenues (Product Sales)</span>
                  <span>Amount</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {incomeStatement.income.map((line) => (
                    <div key={line.name} className="flex justify-between py-2 text-xs">
                      <span className="text-slate-700 pl-2">{line.name}</span>
                      <span className="font-mono text-slate-900">{money(line.amountMinor, currency)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2.5 text-xs font-bold text-emerald-700 bg-emerald-50/50 px-2 rounded mt-1">
                    <span>Total Revenue</span>
                    <span className="font-mono">+{money(incomeStatement.totalIncomeMinor, currency)}</span>
                  </div>
                </div>
              </div>

              {/* COGS Section (if present) */}
              {incomeStatement.cogs && incomeStatement.cogs.length > 0 && (
                <div>
                  <div className="flex justify-between border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wider text-amber-900">
                    <span>Cost of Goods Sold (COGS)</span>
                    <span>Amount</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {incomeStatement.cogs.map((line) => (
                      <div key={line.name} className="flex justify-between py-2 text-xs">
                        <span className="text-slate-700 pl-2">{line.name}</span>
                        <span className="font-mono text-slate-900">{money(line.amountMinor, currency)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 text-xs font-semibold text-amber-800 bg-amber-50/50 px-2 rounded mt-1">
                      <span>Total Cost of Goods Sold</span>
                      <span className="font-mono">−{money(incomeStatement.totalCogsMinor ?? 0, currency)}</span>
                    </div>
                  </div>

                  {/* Gross Profit callout */}
                  <div className="mt-3 flex justify-between items-center rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs">
                    <div>
                      <span className="font-bold text-emerald-950 uppercase tracking-wide">Gross Profit</span>
                      <p className="text-[11px] text-emerald-700">Total Revenue minus Cost of Goods Sold</p>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-base font-bold text-emerald-900 block">
                        {money(incomeStatement.grossProfitMinor ?? (incomeStatement.totalIncomeMinor - (incomeStatement.totalCogsMinor ?? 0)), currency)}
                      </span>
                      {incomeStatement.totalIncomeMinor > 0 && (
                        <span className="text-[10px] text-emerald-600 font-medium">
                          {percent(((incomeStatement.grossProfitMinor ?? 0) / incomeStatement.totalIncomeMinor) * 100)} Gross Margin
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Operating Expenses Section */}
              <div>
                <div className="flex justify-between border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wider text-slate-900">
                  <span>Operating Expenses (OPEX)</span>
                  <span>Amount</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {(incomeStatement.operatingExpenses ?? incomeStatement.expenses).map((line) => (
                    <div key={line.name} className="flex justify-between py-2 text-xs">
                      <span className="text-slate-700 pl-2">{line.name}</span>
                      <span className="font-mono text-slate-900">
                        {money(line.amountMinor, currency)}
                        {incomeStatement.totalExpensesMinor > 0 && (
                          <span className="text-[10px] text-slate-400 ml-2">
                            ({percent(line.percent)})
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2.5 text-xs font-bold text-rose-700 bg-rose-50/50 px-2 rounded mt-1">
                    <span>Total Operating Expenses</span>
                    <span className="font-mono">−{money(incomeStatement.totalOperatingExpensesMinor ?? incomeStatement.totalExpensesMinor, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Net Income Bottom Line */}
              <div className="border-t-2 border-slate-900 pt-4">
                <div className="flex items-baseline justify-between rounded-lg bg-slate-900 p-4 text-white">
                  <div>
                    <span className="text-sm font-bold uppercase tracking-wide">Net Operating Income</span>
                    <p className="text-[11px] text-slate-400">Total Revenue minus All Business Expenses (COGS + OPEX)</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-2xl font-bold block">
                      {money(incomeStatement.netIncomeMinor, currency)}
                    </span>
                    {incomeStatement.totalIncomeMinor > 0 && (
                      <span className="text-[11px] text-emerald-300 font-medium">
                        {percent((incomeStatement.netIncomeMinor / incomeStatement.totalIncomeMinor) * 100)} Net Margin
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Note on Owner's Capital */}
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <p>
                  <strong>Owner’s Capital:</strong> Initial capital contributions (e.g. ₱15,000.00) are classified as Equity on the Balance Sheet and Statement of Cash Flows, and are properly excluded from Revenue and Operating Income in accordance with accounting standards.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. BALANCE SHEET */}
      {activeTab === 'BALANCE_SHEET' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Balance Sheet (Financial Position)</h3>
              <p className="text-xs text-slate-500">As of period close {balanceSheet?.asOf}</p>
            </div>
            {balanceSheet?.reconciliation && (
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                  balanceSheet.reconciliation.matches
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {balanceSheet.reconciliation.matches ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                )}
                {balanceSheet.reconciliation.matches
                  ? 'Reconciled with Net Worth'
                  : `Difference: ${money(balanceSheet.reconciliation.differenceMinor, currency)}`}
              </div>
            )}
          </div>

          {loadingBS ? (
            <div className="p-8 text-center text-slate-400">
              <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />
              Computing Balance Sheet…
            </div>
          ) : !balanceSheet ? (
            <p className="text-xs text-slate-500">Unable to load Balance Sheet.</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 max-w-4xl">
              {/* Assets Section */}
              <div className="space-y-3">
                <div className="flex justify-between border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wider text-slate-900">
                  <span>Assets & Pockets</span>
                  <span>Balance</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {balanceSheet.assets.map((item) => (
                    <div key={item.name} className="flex justify-between py-2 text-xs">
                      <span className="text-slate-700 pl-2">{item.name}</span>
                      <span className="font-mono text-slate-900">{money(item.balanceMinor, currency)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2.5 text-xs font-bold text-slate-900 bg-slate-50 px-2 rounded mt-2">
                    <span>Total Assets</span>
                    <span className="font-mono">{money(balanceSheet.totalAssetsMinor, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Liabilities & Equity Section */}
              <div className="space-y-3">
                <div className="flex justify-between border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wider text-slate-900">
                  <span>Liabilities & Obligations</span>
                  <span>Balance</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {balanceSheet.liabilities.length === 0 ? (
                    <div className="py-2 text-xs text-slate-400 pl-2">No outstanding liabilities.</div>
                  ) : (
                    balanceSheet.liabilities.map((item) => (
                      <div key={item.name} className="flex justify-between py-2 text-xs">
                        <span className="text-slate-700 pl-2">{item.name}</span>
                        <span className="font-mono text-rose-600">{money(item.balanceMinor, currency)}</span>
                      </div>
                    ))
                  )}
                  <div className="flex justify-between py-2.5 text-xs font-bold text-slate-900 bg-slate-50 px-2 rounded mt-2">
                    <span>Total Liabilities</span>
                    <span className="font-mono">{money(balanceSheet.totalLiabilitiesMinor, currency)}</span>
                  </div>
                </div>

                {/* Net Worth Calculation Box */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mt-6">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-900">
                        Net Worth (Equity)
                      </span>
                      <p className="text-[10px] text-slate-500">Total Assets minus Total Liabilities</p>
                    </div>
                    <span className="font-mono text-xl font-bold text-slate-900">
                      {money(balanceSheet.netWorthMinor, currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. CASH FLOW STATEMENT */}
      {activeTab === 'CASH_FLOW' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900">Cash Flow Statement</h3>
            <p className="text-xs text-slate-500">
              Measures genuine cash inflows, operating outflows, and memo internal pocket allocations
            </p>
          </div>

          {loadingCF ? (
            <div className="p-8 text-center text-slate-400">
              <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />
              Computing Cash Flow Statement…
            </div>
          ) : !cashFlow ? (
            <p className="text-xs text-slate-500">Unable to load Cash Flow Statement.</p>
          ) : (
            <div className="space-y-6 max-w-3xl">
              <div className="divide-y divide-slate-100 text-xs">
                <div className="flex justify-between py-2 text-slate-700">
                  <span className="font-medium">Cash Inflow from Operating Receipts</span>
                  <span className="font-mono font-medium text-emerald-600">
                    +{money(cashFlow.operating.incomeReceivedMinor, currency)}
                  </span>
                </div>
                <div className="flex justify-between py-2 text-slate-700">
                  <span className="font-medium">Cash Outflow for Operating Expenses</span>
                  <span className="font-mono font-medium text-rose-600">
                    −{money(cashFlow.operating.expensesPaidMinor, currency)}
                  </span>
                </div>
                <div className="flex justify-between py-3 font-bold text-slate-900 bg-slate-50 px-2 rounded">
                  <span>Net Change in Total Cash</span>
                  <span className="font-mono">{money(cashFlow.netChangeInCashMinor, currency)}</span>
                </div>
              </div>

              {/* Memo Savings / Vault Transfers Section */}
              <div className="rounded-lg border border-slate-200 bg-amber-50/50 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                      Reserve Pockets & Vault Allocations (Memo)
                    </h4>
                    <p className="text-[11px] text-amber-800/80 mt-0.5">
                      {cashFlow.explanation}
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-amber-100 text-xs pl-6">
                  {cashFlow.savingActivities.lines.map((pocket) => (
                    <div key={pocket.accountId} className="flex justify-between py-1.5 text-slate-700">
                      <span>Transfers into {pocket.accountName}</span>
                      <span className="font-mono text-slate-900">{money(pocket.movedInMinor, currency)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between py-2 font-semibold text-slate-900">
                    <span>Total Saved into Reserve Vaults</span>
                    <span className="font-mono">{money(cashFlow.savingActivities.totalMovedToSavingsMinor, currency)}</span>
                  </div>
                </div>
              </div>

              {/* Opening and Closing Cash Balance Box */}
              <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium block">
                    Beginning Cash Balance
                  </span>
                  <span className="font-mono text-lg font-bold text-slate-900 mt-1 block">
                    {money(cashFlow.openingCashMinor, currency)}
                  </span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium block">
                    Ending Cash Balance
                  </span>
                  <span className="font-mono text-lg font-bold text-slate-900 mt-1 block">
                    {money(cashFlow.closingCashMinor, currency)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. CHANGES IN NET WORTH */}
      {activeTab === 'NET_WORTH' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-bold text-slate-900">Statement of Changes in Net Worth</h3>
            <p className="text-xs text-slate-500">
              Reconciles opening net worth against operating earnings, new obligations, and manual adjustments
            </p>
          </div>

          {loadingNW ? (
            <div className="p-8 text-center text-slate-400">
              <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />
              Computing Net Worth Changes…
            </div>
          ) : !netWorthChanges ? (
            <p className="text-xs text-slate-500">Unable to load Statement of Changes in Net Worth.</p>
          ) : (
            <div className="divide-y divide-slate-100 text-xs max-w-2xl">
              <div className="flex justify-between py-2 text-slate-700">
                <span className="font-medium">Beginning Net Worth</span>
                <span className="font-mono font-medium text-slate-900">
                  {money(netWorthChanges.beginningNetWorthMinor, currency)}
                </span>
              </div>
              <div className="flex justify-between py-2 text-slate-700">
                <span className="font-medium pl-3">+ Net Operating Income for Period</span>
                <span className="font-mono font-medium text-emerald-600">
                  +{money(netWorthChanges.netIncomeMinor, currency)}
                </span>
              </div>
              <div className="flex justify-between py-2 text-slate-700">
                <span className="font-medium pl-3">&plusmn; Net Worth Adjustments</span>
                <span className="font-mono font-medium text-slate-900">
                  {money(netWorthChanges.adjustmentsMinor, currency)}
                </span>
              </div>
              <div className="flex justify-between py-3 font-bold text-slate-900 bg-slate-900 text-white px-3 rounded-lg mt-3">
                <span>Ending Net Worth</span>
                <span className="font-mono text-base">
                  {money(netWorthChanges.endingNetWorthMinor, currency)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
