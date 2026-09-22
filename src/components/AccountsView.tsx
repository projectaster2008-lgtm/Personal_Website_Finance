import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Building,
  PiggyBank,
  Receipt,
  Plus,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  Trash2,
} from 'lucide-react';
import { api, type AccountsReceivableDto } from '../lib/api';
import { money, formatDate } from '../lib/format';
import type { PeriodQuery } from '@pfos/shared';

interface AccountsViewProps {
  period: PeriodQuery;
  currency: string;
  onSuccessToast: (msg: string) => void;
}

export function AccountsView({ period, currency, onSuccessToast }: AccountsViewProps) {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddArOpen, setIsAddArOpen] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState('BANK');
  const [newAccRole, setNewAccRole] = useState('CONVENIENCE_WALLET');
  const [newAccNotes, setNewAccNotes] = useState('');
  const [newAccBalance, setNewAccBalance] = useState('0');
  const [isCreating, setIsCreating] = useState(false);

  // AR form state
  const [arCustomer, setArCustomer] = useState('');
  const [arOrderDate, setArOrderDate] = useState('2026-09-11');
  const [arUnits, setArUnits] = useState('1');
  const [arAmount, setArAmount] = useState('');
  const [arStatus, setArStatus] = useState('Pending');
  const [arNote, setArNote] = useState('');

  // 1. Fetch all accounts
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.listAccounts(false),
  });

  // 2. Fetch Accounts Receivable
  const { data: arList = [], isLoading: isLoadingAr } = useQuery({
    queryKey: ['accounts-receivable'],
    queryFn: () => api.listAccountsReceivable(),
  });

  // 3. Fetch selected account register if any
  const { data: accountDetail } = useQuery({
    queryKey: ['account-detail', selectedAccountId, period],
    queryFn: () => (selectedAccountId ? api.getAccount(selectedAccountId, period) : null),
    enabled: Boolean(selectedAccountId),
  });

  const handleToggleArStatus = async (item: AccountsReceivableDto) => {
    const nextStatus = item.status === 'Collected' ? 'Pending' : 'Collected';
    try {
      await api.updateAccountsReceivable(item.id, { status: nextStatus });
      queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] });
      onSuccessToast(`Order for ${item.customer} marked as ${nextStatus}.`);
    } catch {
      onSuccessToast('Failed to update status.');
    }
  };

  const handleDeleteAr = async (id: string) => {
    try {
      await api.deleteAccountsReceivable(id);
      queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] });
      onSuccessToast('Accounts receivable entry deleted.');
    } catch {
      onSuccessToast('Failed to delete AR entry.');
    }
  };

  const handleCreateAr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!arCustomer.trim()) return;
    try {
      const amountMinor = Math.round(parseFloat(arAmount || '0') * 100);
      await api.createAccountsReceivable({
        customer: arCustomer,
        orderDate: arOrderDate,
        units: Number(arUnits) || 1,
        amountMinor,
        status: arStatus,
        note: arNote,
      });
      queryClient.invalidateQueries({ queryKey: ['accounts-receivable'] });
      onSuccessToast(`Order for ${arCustomer} created.`);
      setIsAddArOpen(false);
      setArCustomer('');
      setArAmount('');
      setArNote('');
    } catch {
      onSuccessToast('Failed to create AR entry.');
    }
  };

  // Check if there is an Accounts Receivable account
  const arAccount = accounts.find(
    (a) =>
      a.name.toLowerCase().includes('receivable') ||
      a.notes?.toLowerCase().includes('receivable'),
  );

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    setIsCreating(true);
    try {
      const openingMinor = Math.round(parseFloat(newAccBalance || '0') * 100);
      await api.createAccount({
        name: newAccName,
        type: newAccType as any,
        role: newAccRole as any,
        notes: newAccNotes || undefined,
        openingBalanceMinor: openingMinor,
        includeInNetWorth: true,
        isActive: true,
      });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onSuccessToast(`Account "${newAccName}" created successfully.`);
      setIsAddOpen(false);
      setNewAccName('');
      setNewAccNotes('');
      setNewAccBalance('0');
    } catch {
      onSuccessToast('Failed to create account.');
    } finally {
      setIsCreating(false);
    }
  };

  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'SAVINGS':
        return <PiggyBank className="h-4 w-4 text-emerald-600" />;
      case 'CASH':
        return <Wallet className="h-4 w-4 text-amber-600" />;
      case 'EWALLET':
        return <Receipt className="h-4 w-4 text-purple-600" />;
      default:
        return <Building className="h-4 w-4 text-blue-600" />;
    }
  };

  const formatRole = (role: string) => {
    return role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // If viewing single account register:
  if (selectedAccountId && accountDetail) {
    const acc = accountDetail.account;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSelectedAccountId(null)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to All Accounts
          </button>
          <div className="text-right">
            <span className="text-xs text-slate-500">Current Balance:</span>{' '}
            <span className="font-mono text-base font-bold text-slate-900">
              {money(acc.currentBalanceMinor, currency)}
            </span>
          </div>
        </div>

        {/* Account Header Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100">
                {getAccountIcon(acc.type)}
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{acc.name}</h3>
                <p className="text-xs text-slate-500">
                  {formatRole(acc.role)} &bull; {acc.type} {acc.notes ? `— ${acc.notes}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5">
                <span className="text-slate-500">Money In: </span>
                <span className="font-mono font-medium text-emerald-600">
                  +{money(accountDetail.activity.incomeMinor + accountDetail.activity.transfersInMinor, currency)}
                </span>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5">
                <span className="text-slate-500">Money Out: </span>
                <span className="font-mono font-medium text-rose-600">
                  −{money(accountDetail.activity.expensesMinor + accountDetail.activity.transfersOutMinor + accountDetail.activity.feesMinor, currency)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Register Table with running balances */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700">
            Account Register &bull; Running Balance Per Entry
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50/50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5 text-right">In</th>
                  <th className="px-4 py-2.5 text-right">Out</th>
                  <th className="px-4 py-2.5 text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accountDetail.register.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No register movements in this selected period.
                    </td>
                  </tr>
                ) : (
                  accountDetail.register.map((reg) => (
                    <tr key={reg.entryId} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                        {formatDate(reg.date)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{reg.description}</td>
                      <td className="px-4 py-2.5 text-slate-500">{reg.categoryName ?? 'Transfer'}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium text-emerald-600">
                        {reg.direction === 'IN' ? `+${money(reg.amountMinor, currency)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium text-rose-600">
                        {reg.direction === 'OUT' ? `−${money(reg.amountMinor, currency)}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                        {money(reg.runningBalanceMinor, currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Accounts & Receivables</h2>
          <p className="text-xs text-slate-500">
            Asset pockets, operating balances, and Accounts Receivable trade ledgers
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-slate-800 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Account
        </button>
      </div>

      {/* Accounts Receivable Highlight Spotlight */}
      {arAccount && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                <Receipt className="h-3 w-3" />
                Accounts Receivable Ledger
              </div>
              <h3 className="text-lg font-bold text-slate-900">{arAccount.name}</h3>
              <p className="text-xs text-slate-600 max-w-xl">
                {arAccount.notes || 'Tracks outstanding customer invoices, wholesale terms, and pending trade payments.'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                  Outstanding Receivables
                </span>
                <span className="font-mono text-2xl font-bold text-blue-900">
                  {money(arAccount.currentBalanceMinor, currency)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAccountId(arAccount.id)}
                className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                Inspect AR Register &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accounts Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="col-span-full p-8 text-center text-slate-400">
            <Loader2 className="mx-auto h-5 w-5 animate-spin mb-2" />
            Loading accounts…
          </div>
        ) : (
          accounts.map((acc) => (
            <div
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 hover:shadow transition-all group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-slate-200 transition-colors">
                    {getAccountIcon(acc.type)}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {acc.name}
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      {formatRole(acc.role)}
                    </span>
                  </div>
                </div>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {acc.type}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                <span className="text-xs text-slate-500">Balance:</span>
                <span className="font-mono text-base font-bold text-slate-900">
                  {money(acc.currentBalanceMinor, currency)}
                </span>
              </div>

              {acc.notes && (
                <p className="mt-2 text-[11px] text-slate-400 line-clamp-1">{acc.notes}</p>
              )}
            </div>
          ))
        )}
      </div>

      {/* Accounts Receivable (COD & Wholesale Orders) Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">Accounts Receivable (COD Orders & Pending Invoices)</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tracks customer orders awaiting delivery or rider COD collection. Collected orders are transferred into cash/ledger.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAddArOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Order
            </button>
          </div>
        </div>

        {/* Summary Badges */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
            <span className="text-[11px] font-medium text-slate-500 block">Total Receivables</span>
            <span className="font-mono text-lg font-bold text-slate-900">
              {money(arList.reduce((s, i) => s + i.amountMinor, 0), currency)}
            </span>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <span className="text-[11px] font-medium text-amber-700 block">Pending Collection</span>
            <span className="font-mono text-lg font-bold text-amber-900">
              {money(arList.filter((i) => i.status === 'Pending').reduce((s, i) => s + i.amountMinor, 0), currency)}
            </span>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <span className="text-[11px] font-medium text-emerald-700 block">Collected / Settled</span>
            <span className="font-mono text-lg font-bold text-emerald-900">
              {money(arList.filter((i) => i.status === 'Collected').reduce((s, i) => s + i.amountMinor, 0), currency)}
            </span>
          </div>
        </div>

        {/* AR Orders Table */}
        {isLoadingAr ? (
          <div className="p-6 text-center text-slate-400">
            <Loader2 className="mx-auto h-5 w-5 animate-spin mb-1" />
            Loading accounts receivable…
          </div>
        ) : arList.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">No receivable entries recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">Order Date</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3 text-center">Units</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Note / Ledger Details</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {arList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">{item.orderDate}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{item.customer}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600">{item.units}</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                      {money(item.amountMinor, currency)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleToggleArStatus(item)}
                        title="Click to toggle status"
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-transform active:scale-95 ${
                          item.status === 'Collected'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {item.status === 'Collected' ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                        ) : (
                          <Clock className="h-3 w-3 text-amber-700" />
                        )}
                        {item.status}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-xs">{item.note || '—'}</td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleDeleteAr(item.id)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Delete entry"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add AR Modal */}
      {isAddArOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">Add Accounts Receivable Order</h3>
            <form onSubmit={handleCreateAr} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  required
                  value={arCustomer}
                  onChange={(e) => setArCustomer(e.target.value)}
                  placeholder="e.g. Mark Delgado"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Order Date</label>
                  <input
                    type="date"
                    required
                    value={arOrderDate}
                    onChange={(e) => setArOrderDate(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Units (Tumblers)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={arUnits}
                    onChange={(e) => setArUnits(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Amount ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={arAmount}
                    onChange={(e) => setArAmount(e.target.value)}
                    placeholder="1400.00"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Status</label>
                  <select
                    value={arStatus}
                    onChange={(e) => setArStatus(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
                  >
                    <option value="Pending">Pending (COD / Unsettled)</option>
                    <option value="Collected">Collected (Settled)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={arNote}
                  onChange={(e) => setArNote(e.target.value)}
                  placeholder="e.g. COD — awaiting rider settlement"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddArOpen(false)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  Save Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900 mb-4">Create New Account</h3>
            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Account Name</label>
                <input
                  type="text"
                  required
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="e.g. Accounts Receivable or Trade Checking"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={newAccType}
                    onChange={(e) => setNewAccType(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
                  >
                    <option value="BANK">Bank</option>
                    <option value="SAVINGS">Savings</option>
                    <option value="CASH">Cash</option>
                    <option value="EWALLET">E-Wallet</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={newAccRole}
                    onChange={(e) => setNewAccRole(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-2 text-xs"
                  >
                    <option value="CONVENIENCE_WALLET">Convenience Wallet</option>
                    <option value="PROFESSIONAL_ANCHOR">Professional Anchor</option>
                    <option value="VAULT">The Vault</option>
                    <option value="DAILY_WALLET">Daily Wallet</option>
                    <option value="TRANSIT_STATION">Transit Station</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Opening Balance ({currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newAccBalance}
                  onChange={(e) => setNewAccBalance(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={newAccNotes}
                  onChange={(e) => setNewAccNotes(e.target.value)}
                  placeholder="Purpose or institution notes"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-xs focus:border-slate-900 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {isCreating ? 'Creating…' : 'Save Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
