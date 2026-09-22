import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Filter,
  ArrowRightLeft,
  Trash2,
  Copy,
  FileSpreadsheet,
  FileText,
  Loader2,
} from 'lucide-react';
import { api } from '../lib/api';
import { money, formatDate } from '../lib/format';
import type { PeriodQuery, TransactionType } from '@pfos/shared';

interface GeneralLedgerViewProps {
  period: PeriodQuery;
  currency: string;
  onAddTransaction: () => void;
  onSuccessToast: (msg: string) => void;
}

export function GeneralLedgerView({
  period,
  currency,
  onAddTransaction,
  onSuccessToast,
}: GeneralLedgerViewProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [isExporting, setIsExporting] = useState<'csv' | 'xlsx' | null>(null);

  // Fetch all transactions for this period
  const { data: txPage, isLoading } = useQuery({
    queryKey: ['transactions', period, typeFilter, accountFilter],
    queryFn: () =>
      api.listTransactions({
        from: period.from,
        to: period.to,
        type: typeFilter !== 'ALL' ? (typeFilter as TransactionType) : undefined,
        accountId: accountFilter !== 'ALL' ? accountFilter : undefined,
        pageSize: 100,
      }),
  });

  // Fetch accounts list for filtering
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.listAccounts(false),
  });

  const transactions = txPage?.data ?? [];

  // Filter client-side by search query
  const filtered = transactions.filter((tx) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const desc = tx.description.toLowerCase();
    const cat = tx.category?.name.toLowerCase() ?? '';
    const acc = tx.account?.name.toLowerCase() ?? '';
    const fromAcc = tx.fromAccount?.name.toLowerCase() ?? '';
    const toAcc = tx.toAccount?.name.toLowerCase() ?? '';
    return desc.includes(q) || cat.includes(q) || acc.includes(q) || fromAcc.includes(q) || toAcc.includes(q);
  });

  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      setIsExporting(format);
      await api.downloadExport(format, period.from, period.to);
      onSuccessToast(`Exported ledger to ${format.toUpperCase()} successfully.`);
    } catch (err) {
      console.error(err);
      onSuccessToast(`Failed to export ledger.`);
    } finally {
      setIsExporting(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this transaction? This will reverse all ledger entries.')) return;
    try {
      await api.deleteTransaction(id);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      onSuccessToast('Transaction deleted.');
    } catch {
      onSuccessToast('Failed to delete transaction.');
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await api.duplicateTransaction(id);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      onSuccessToast('Transaction duplicated.');
    } catch {
      onSuccessToast('Failed to duplicate transaction.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with title, actions, export */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">General Ledger</h2>
          <p className="text-xs text-slate-500">
            Complete chronological record of all financial movements and entries
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="export-csv-btn"
            type="button"
            disabled={Boolean(isExporting)}
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            {isExporting === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-slate-500" />}
            Export CSV
          </button>
          <button
            id="export-xlsx-btn"
            type="button"
            disabled={Boolean(isExporting)}
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            {isExporting === 'xlsx' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />}
            Export Excel
          </button>
          <button
            id="ledger-add-tx-btn"
            type="button"
            onClick={onAddTransaction}
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Entry
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, category, or account…"
            className="w-full rounded-md border border-slate-200 pl-9 pr-3 py-1.5 text-xs focus:border-slate-900 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
          >
            <option value="ALL">All Types</option>
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expense</option>
            <option value="TRANSFER">Transfer</option>
          </select>

          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
          >
            <option value="ALL">All Accounts</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3 text-right">Money In</th>
                <th className="px-4 py-3 text-right">Money Out</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />
                    Loading General Ledger entries…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No transactions match the criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => {
                  const isIn = tx.type === 'INCOME';
                  const isOut = tx.type === 'EXPENSE';
                  const isTransfer = tx.type === 'TRANSFER';

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formatDate(tx.date)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{tx.description}</div>
                        {tx.notes && <div className="text-[11px] text-slate-400">{tx.notes}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {tx.category ? (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                tx.category.kind === 'INCOME'
                                  ? 'bg-emerald-500'
                                  : 'bg-rose-500'
                              }`}
                            />
                            {tx.category.name}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Transfer</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                        {isTransfer ? (
                          <div className="flex items-center gap-1 text-[11px]">
                            <span>{tx.fromAccount?.name ?? 'Source'}</span>
                            <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                            <span>{tx.toAccount?.name ?? 'Destination'}</span>
                          </div>
                        ) : (
                          tx.account?.name ?? '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-emerald-600 whitespace-nowrap">
                        {isIn ? `+${money(tx.amountMinor, currency)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-rose-600 whitespace-nowrap">
                        {isOut ? `−${money(tx.amountMinor, currency)}` : isTransfer ? money(tx.amountMinor, currency) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            title="Duplicate transaction"
                            onClick={() => handleDuplicate(tx.id)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Delete transaction"
                            onClick={() => handleDelete(tx.id)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
