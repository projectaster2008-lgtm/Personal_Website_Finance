import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CategoryKind, toMinor, TransactionType, AccountType, AccountRole } from '@pfos/shared';
import { X, ArrowRightLeft, TrendingDown, TrendingUp, Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '../lib/api';
import { ExtensibleCombobox } from './ExtensibleCombobox';

type TabType = 'EXPENSE' | 'INCOME' | 'TRANSFER';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  currency?: string;
}

export function AddTransactionModal({
  isOpen,
  onClose,
  onSuccess,
  currency = 'PHP',
}: AddTransactionModalProps) {
  const queryClient = useQueryClient();
  const todayStr = new Date().toISOString().slice(0, 10);

  const [tab, setTab] = useState<TabType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [date, setDate] = useState(todayStr);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch accounts and categories (active only)
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.listAccounts(false),
    enabled: isOpen,
  });

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.listCategories(false),
    enabled: isOpen,
  });

  // Filter categories based on active tab and ensure only active categories are used
  const filteredCategories = categories.filter((c) => {
    if (c.isActive === false) return false;
    if (tab === 'INCOME') return c.kind === CategoryKind.INCOME;
    if (tab === 'EXPENSE') return c.kind === CategoryKind.EXPENSE;
    return true;
  });

  // Filter accounts to active only
  const activeAccounts = accounts.filter((a) => a.isActive !== false);

  const accountComboboxItems = activeAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    badge: a.type !== 'OTHER' ? a.type : undefined,
  }));

  const categoryComboboxItems = filteredCategories.map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const handleCreateCategory = async (name: string): Promise<string | void> => {
    const kind = tab === 'INCOME' ? CategoryKind.INCOME : CategoryKind.EXPENSE;
    try {
      const newCat = await api.createCategory({ name, kind, isActive: true });
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      setCategoryId(newCat.id);
      return newCat.id;
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Failed to create category');
      }
    }
  };

  const handleCreateAccount = async (
    name: string,
    extra?: { accountType?: AccountType },
  ): Promise<string | void> => {
    try {
      const newAcc = await api.createAccount({
        name,
        type: extra?.accountType || AccountType.OTHER,
        role: AccountRole.OTHER,
        openingBalanceMinor: 0,
        includeInNetWorth: true,
        isActive: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      return newAcc.id;
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Failed to create account');
      }
    }
  };

  // Reset/seed default dropdown selections when data loads or tab changes
  useEffect(() => {
    if (!isOpen) return;

    if (accounts.length > 0) {
      if (!accountId) setAccountId(accounts[0].id);
      if (!fromAccountId) setFromAccountId(accounts[0].id);
      if (!toAccountId && accounts.length > 1) {
        setToAccountId(accounts[1].id);
      } else if (!toAccountId && accounts.length > 0) {
        setToAccountId(accounts[0].id);
      }
    }
  }, [accounts, isOpen, accountId, fromAccountId, toAccountId]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (filteredCategories.length > 0) {
      // Check if current categoryId is in filtered list, else select the first one
      const exists = filteredCategories.some((c) => c.id === categoryId);
      if (!exists) {
        setCategoryId(filteredCategories[0].id);
      }
    } else {
      setCategoryId('');
    }
  }, [tab, categories, isOpen]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setDate(todayStr);
    }
  }, [isOpen, todayStr]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a description');
      return;
    }

    if (tab === 'TRANSFER') {
      if (!fromAccountId || !toAccountId) {
        setError('Please select both a source and destination account');
        return;
      }
      if (fromAccountId === toAccountId) {
        setError('Source and destination must be different accounts');
        return;
      }
    } else {
      if (!accountId) {
        setError('Please select an account');
        return;
      }
      if (!categoryId) {
        setError('Please select a category');
        return;
      }
    }

    setSubmitting(true);

    try {
      const amountMinor = toMinor(parsedAmount);
      if (amountMinor <= 0) {
        setError('Amount must be greater than 0');
        setSubmitting(false);
        return;
      }

      if (tab === 'TRANSFER') {
        await api.createTransaction({
          type: TransactionType.TRANSFER,
          amountMinor,
          fromAccountId,
          toAccountId,
          feeMinor: 0,
          feeAccount: 'FROM',
          date,
          description: description.trim(),
          tags: [] as string[],
        });
      } else {
        await api.createTransaction({
          type: tab === 'INCOME' ? TransactionType.INCOME : TransactionType.EXPENSE,
          amountMinor,
          accountId,
          categoryId,
          date,
          description: description.trim(),
          notes: notes.trim() || undefined,
          tags: [] as string[],
        });
      }

      // Invalidate queries so dashboard figures update immediately
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });

      // Reset form
      setAmount('');
      setDescription('');
      setNotes('');
      setError(null);

      // Notify parent
      const successMessage =
        tab === 'TRANSFER'
          ? 'Transfer recorded successfully'
          : `${tab === 'INCOME' ? 'Income' : 'Expense'} recorded successfully`;
      onSuccess(successMessage);
      onClose();
    } catch (err) {
      console.error('Error creating transaction:', err);
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to record transaction');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      id="add-transaction-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-transaction-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id="add-transaction-title" className="text-lg font-semibold text-slate-900">
            Add Transaction
          </h2>
          <button
            id="close-add-transaction-btn"
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs: Income, Expense, Transfer */}
        <div className="border-b border-slate-100 px-6 pt-3">
          <div className="flex gap-2">
            <button
              id="tab-expense-btn"
              type="button"
              onClick={() => {
                setTab('EXPENSE');
                setError(null);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${
                tab === 'EXPENSE'
                  ? 'border-rose-600 text-rose-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <TrendingDown className="h-4 w-4" />
              Expense
            </button>
            <button
              id="tab-income-btn"
              type="button"
              onClick={() => {
                setTab('INCOME');
                setError(null);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${
                tab === 'INCOME'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              Income
            </button>
            <button
              id="tab-transfer-btn"
              type="button"
              onClick={() => {
                setTab('TRANSFER');
                setError(null);
              }}
              className={`flex items-center gap-1.5 border-b-2 px-3 pb-3 text-sm font-medium transition-colors ${
                tab === 'TRANSFER'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Transfer
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              id="add-transaction-error"
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {/* Amount Field */}
          <div>
            <label htmlFor="tx-amount" className="block text-sm font-medium text-slate-700 mb-1">
              Amount
            </label>
            <div className="relative rounded-md shadow-xs">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <span className="text-sm font-medium text-slate-500">{currency}</span>
              </div>
              <input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="0.00"
                required
                className="block w-full rounded-md border border-slate-300 pl-14 pr-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-hidden text-sm"
              />
            </div>
          </div>

          {/* Income & Expense Fields: Category & Account */}
          {tab !== 'TRANSFER' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ExtensibleCombobox
                id="tx-category"
                label="Category"
                value={categoryId}
                items={categoryComboboxItems}
                onSelect={(id) => {
                  setCategoryId(id);
                  if (error) setError(null);
                }}
                onCreate={handleCreateCategory}
                type="category"
                kindLabel={tab === 'INCOME' ? 'Income' : 'Expense'}
                disabled={loadingCategories}
              />

              <ExtensibleCombobox
                id="tx-account"
                label="Account"
                value={accountId}
                items={accountComboboxItems}
                onSelect={(id) => {
                  setAccountId(id);
                  if (error) setError(null);
                }}
                onCreate={async (name, extra) => {
                  const id = await handleCreateAccount(name, extra);
                  if (id) {
                    setAccountId(id);
                    return id;
                  }
                }}
                type="account"
                disabled={loadingAccounts}
              />
            </div>
          ) : (
            /* Transfer Fields: From Account & To Account */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ExtensibleCombobox
                id="tx-from-account"
                label="From Account"
                value={fromAccountId}
                items={accountComboboxItems}
                onSelect={(id) => {
                  setFromAccountId(id);
                  if (error) setError(null);
                }}
                onCreate={async (name, extra) => {
                  const id = await handleCreateAccount(name, extra);
                  if (id) {
                    setFromAccountId(id);
                    return id;
                  }
                }}
                type="account"
                disabled={loadingAccounts}
              />

              <ExtensibleCombobox
                id="tx-to-account"
                label="To Account"
                value={toAccountId}
                items={accountComboboxItems}
                onSelect={(id) => {
                  setToAccountId(id);
                  if (error) setError(null);
                }}
                onCreate={async (name, extra) => {
                  const id = await handleCreateAccount(name, extra);
                  if (id) {
                    setToAccountId(id);
                    return id;
                  }
                }}
                type="account"
                disabled={loadingAccounts}
              />
            </div>
          )}

          {/* Date Field */}
          <div>
            <label htmlFor="tx-date" className="block text-sm font-medium text-slate-700 mb-1">
              Date
            </label>
            <input
              id="tx-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (error) setError(null);
              }}
              required
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-hidden text-sm"
            />
          </div>

          {/* Description Field */}
          <div>
            <label htmlFor="tx-description" className="block text-sm font-medium text-slate-700 mb-1">
              Description
            </label>
            <input
              id="tx-description"
              type="text"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError(null);
              }}
              placeholder={
                tab === 'TRANSFER'
                  ? 'e.g. Move emergency fund to high-yield savings'
                  : tab === 'INCOME'
                  ? 'e.g. Bi-weekly payroll salary'
                  : 'e.g. Grocery run at Supermarket'
              }
              required
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-hidden text-sm"
            />
          </div>

          {/* Notes (Optional, for Income / Expense) */}
          {tab !== 'TRANSFER' && (
            <div>
              <label htmlFor="tx-notes" className="block text-sm font-medium text-slate-700 mb-1">
                Notes <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                id="tx-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes, receipt reference or memo…"
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-slate-900 focus:outline-hidden text-sm resize-none"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              id="cancel-add-transaction-btn"
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              id="submit-add-transaction-btn"
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting
                ? 'Recording…'
                : tab === 'TRANSFER'
                ? 'Record Transfer'
                : tab === 'INCOME'
                ? 'Record Income'
                : 'Record Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
