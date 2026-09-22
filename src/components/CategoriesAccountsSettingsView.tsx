import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Tag,
  Wallet,
  Plus,
  Pencil,
  Power,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Shield,
  Search,
  X,
  Loader2,
  TrendingUp,
  TrendingDown,
  Building2,
  HelpCircle,
} from 'lucide-react';
import {
  CategoryKind,
  AccountType,
  AccountRole,
  ACCOUNT_ROLE_LABEL,
  type CategoryDto,
  type AccountDto,
} from '@pfos/shared';
import { api, ApiRequestError } from '../lib/api';
import { money } from '../lib/format';

interface CategoriesAccountsSettingsViewProps {
  currency: string;
  onSuccessToast: (msg: string) => void;
}

export function CategoriesAccountsSettingsView({
  currency,
  onSuccessToast,
}: CategoriesAccountsSettingsViewProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'CATEGORIES' | 'ACCOUNTS'>('CATEGORIES');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DEACTIVATED'>('ALL');

  // Modal States
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountDto | null>(null);
  const [isNewCategoryOpen, setIsNewCategoryOpen] = useState(false);
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);

  // Conflict 409 Resolution Dialog State
  const [conflictTarget, setConflictTarget] = useState<{
    type: 'category' | 'account';
    id: string;
    name: string;
    message: string;
  } | null>(null);

  // Form Fields for New Category
  const [newCatName, setNewCatName] = useState('');
  const [newCatKind, setNewCatKind] = useState<CategoryKind>(CategoryKind.EXPENSE);
  const [newCatDesc, setNewCatDesc] = useState('');

  // Form Fields for New Account
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>(AccountType.BANK);
  const [newAccRole, setNewAccRole] = useState<AccountRole>(AccountRole.CONVENIENCE_WALLET);
  const [newAccNotes, setNewAccNotes] = useState('');

  // Form Fields for Editing
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editType, setEditType] = useState<AccountType>(AccountType.OTHER);
  const [editRole, setEditRole] = useState<AccountRole>(AccountRole.OTHER);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch categories (include inactive so user can manage & reactivate them)
  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ['categories', true],
    queryFn: () => api.listCategories(true),
  });

  // Fetch accounts (include inactive)
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery({
    queryKey: ['accounts', true],
    queryFn: () => api.listAccounts(true),
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['reports'] }),
    ]);
  };

  /* ------------------- Category Actions ------------------- */

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await api.createCategory({
        name: newCatName.trim(),
        kind: newCatKind,
        isActive: true,
        description: newCatDesc.trim() || undefined,
      });
      await refreshAll();
      setIsNewCategoryOpen(false);
      setNewCatName('');
      setNewCatDesc('');
      onSuccessToast(`Category "${newCatName.trim()}" created successfully`);
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Failed to create category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editName.trim()) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await api.updateCategory(editingCategory.id, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      await refreshAll();
      setEditingCategory(null);
      onSuccessToast(`Category "${editName.trim()}" updated`);
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Failed to update category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleCategoryActive = async (cat: CategoryDto) => {
    try {
      const nextActive = !cat.isActive;
      await api.updateCategory(cat.id, { isActive: nextActive });
      await refreshAll();
      onSuccessToast(
        nextActive
          ? `Category "${cat.name}" reactivated`
          : `Category "${cat.name}" deactivated (hidden from new entries)`,
      );
    } catch (err) {
      onSuccessToast('Failed to update category status');
    }
  };

  const handleDeleteCategory = async (cat: CategoryDto) => {
    if (cat.isSystem) {
      onSuccessToast('Default system categories cannot be deleted; deactivate instead.');
      return;
    }
    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) {
      return;
    }
    try {
      await api.deleteCategory(cat.id);
      await refreshAll();
      onSuccessToast(`Category "${cat.name}" deleted`);
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 409 || err.code === 'CONFLICT')) {
        // Backend refused deletion because category has entries
        setConflictTarget({
          type: 'category',
          id: cat.id,
          name: cat.name,
          message: err.message,
        });
      } else {
        onSuccessToast(err instanceof ApiRequestError ? err.message : 'Failed to delete category');
      }
    }
  };

  /* ------------------- Account Actions ------------------- */

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await api.createAccount({
        name: newAccName.trim(),
        type: newAccType,
        role: newAccRole,
        openingBalanceMinor: 0,
        includeInNetWorth: true,
        isActive: true,
        notes: newAccNotes.trim() || undefined,
      });
      await refreshAll();
      setIsNewAccountOpen(false);
      setNewAccName('');
      setNewAccNotes('');
      onSuccessToast(`Account "${newAccName.trim()}" created successfully`);
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !editName.trim()) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await api.updateAccount(editingAccount.id, {
        name: editName.trim(),
        type: editType,
        role: editRole,
        notes: editDesc.trim() || undefined,
      });
      await refreshAll();
      setEditingAccount(null);
      onSuccessToast(`Account "${editName.trim()}" updated`);
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Failed to update account');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAccountActive = async (acc: AccountDto) => {
    try {
      const nextActive = !acc.isActive;
      await api.updateAccount(acc.id, { isActive: nextActive });
      await refreshAll();
      onSuccessToast(
        nextActive
          ? `Account "${acc.name}" reactivated`
          : `Account "${acc.name}" deactivated (hidden from new entries)`,
      );
    } catch (err) {
      onSuccessToast('Failed to update account status');
    }
  };

  const handleDeleteAccount = async (acc: AccountDto) => {
    if (acc.isSystem) {
      onSuccessToast('Default system accounts cannot be deleted; deactivate instead.');
      return;
    }
    if (!confirm(`Are you sure you want to delete account "${acc.name}"?`)) {
      return;
    }
    try {
      await api.deleteAccount(acc.id);
      await refreshAll();
      onSuccessToast(`Account "${acc.name}" deleted`);
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 409 || err.code === 'CONFLICT')) {
        // Backend refused deletion because account has entries
        setConflictTarget({
          type: 'account',
          id: acc.id,
          name: acc.name,
          message: err.message,
        });
      } else {
        onSuccessToast(err instanceof ApiRequestError ? err.message : 'Failed to delete account');
      }
    }
  };

  /* ------------------- Conflict Deactivate Handler ------------------- */

  const handleConfirmDeactivateConflict = async () => {
    if (!conflictTarget) return;
    try {
      if (conflictTarget.type === 'category') {
        await api.updateCategory(conflictTarget.id, { isActive: false });
        onSuccessToast(`Category "${conflictTarget.name}" deactivated instead`);
      } else {
        await api.updateAccount(conflictTarget.id, { isActive: false });
        onSuccessToast(`Account "${conflictTarget.name}" deactivated instead`);
      }
      await refreshAll();
      setConflictTarget(null);
    } catch {
      onSuccessToast('Failed to deactivate item');
    }
  };

  /* ------------------- Filtering ------------------- */

  const filterItem = (name: string, isActive: boolean) => {
    if (search.trim() && !name.toLowerCase().includes(search.toLowerCase().trim())) {
      return false;
    }
    if (statusFilter === 'ACTIVE') return isActive;
    if (statusFilter === 'DEACTIVATED') return !isActive;
    return true;
  };

  const incomeCategories = categories.filter(
    (c) => c.kind === CategoryKind.INCOME && filterItem(c.name, c.isActive),
  );
  const expenseCategories = categories.filter(
    (c) => c.kind === CategoryKind.EXPENSE && filterItem(c.name, c.isActive),
  );
  const filteredAccounts = accounts.filter((a) => filterItem(a.name, a.isActive));

  return (
    <div className="space-y-6">
      {/* Header & Section Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Categories &amp; Accounts</h2>
          <p className="text-xs text-slate-500">
            Manage your Chart of Accounts and Income/Expense categories. Changes immediately apply
            across all entry comboboxes and reports.
          </p>
        </div>

        {/* Tab Switcher & Quick Add Action */}
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-xs">
            <button
              type="button"
              id="settings-tab-categories"
              onClick={() => setActiveTab('CATEGORIES')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'CATEGORIES'
                  ? 'bg-[#0C3826] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              <span>Categories ({categories.length})</span>
            </button>
            <button
              type="button"
              id="settings-tab-accounts"
              onClick={() => setActiveTab('ACCOUNTS')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === 'ACCOUNTS'
                  ? 'bg-[#0C3826] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wallet className="h-3.5 w-3.5" />
              <span>Accounts ({accounts.length})</span>
            </button>
          </div>

          {activeTab === 'CATEGORIES' ? (
            <button
              type="button"
              id="add-category-btn"
              onClick={() => {
                setFormError(null);
                setNewCatName('');
                setNewCatDesc('');
                setIsNewCategoryOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0C3826] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#08281b] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Category</span>
            </button>
          ) : (
            <button
              type="button"
              id="add-account-btn"
              onClick={() => {
                setFormError(null);
                setNewAccName('');
                setNewAccNotes('');
                setIsNewAccountOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0C3826] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#08281b] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Account</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            id="settings-search-input"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab.toLowerCase()}…`}
            className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0C3826] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {(['ALL', 'ACTIVE', 'DEACTIVATED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                statusFilter === status
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status === 'ALL' ? 'All' : status === 'ACTIVE' ? 'Active' : 'Deactivated'}
            </button>
          ))}
        </div>
      </div>

      {/* ------------------- CATEGORIES TAB ------------------- */}
      {activeTab === 'CATEGORIES' && (
        <div className="space-y-6">
          {/* Income Categories */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-emerald-50/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-700" />
                <h3 className="text-sm font-bold text-slate-900">Income Categories</h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {incomeCategories.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Revenues, operating receipts &amp; other inflows
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {incomeCategories.length > 0 ? (
                incomeCategories.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onEdit={() => {
                      setFormError(null);
                      setEditingCategory(cat);
                      setEditName(cat.name);
                      setEditDesc(cat.description || '');
                    }}
                    onToggleActive={() => handleToggleCategoryActive(cat)}
                    onDelete={() => handleDeleteCategory(cat)}
                  />
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-500">
                  No income categories match your filters.
                </div>
              )}
            </div>
          </div>

          {/* Expense Categories */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-rose-50/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-rose-700" />
                <h3 className="text-sm font-bold text-slate-900">Expense Categories</h3>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                  {expenseCategories.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Cost of goods sold, operating expenses &amp; disbursements
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {expenseCategories.length > 0 ? (
                expenseCategories.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onEdit={() => {
                      setFormError(null);
                      setEditingCategory(cat);
                      setEditName(cat.name);
                      setEditDesc(cat.description || '');
                    }}
                    onToggleActive={() => handleToggleCategoryActive(cat)}
                    onDelete={() => handleDeleteCategory(cat)}
                  />
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-500">
                  No expense categories match your filters.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------- ACCOUNTS TAB ------------------- */}
      {activeTab === 'ACCOUNTS' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-700" />
              <h3 className="text-sm font-bold text-slate-900">Chart of Accounts</h3>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {filteredAccounts.length}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              Bank accounts, e-wallets, cash registers &amp; reserve accounts
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredAccounts.length > 0 ? (
              filteredAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition-colors ${
                    !acc.isActive ? 'bg-slate-50/60 opacity-75' : 'hover:bg-slate-50/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold shrink-0 ${
                        acc.isActive ? 'bg-[#0C3826] text-white shadow-xs' : 'bg-slate-300 text-slate-600'
                      }`}
                    >
                      {acc.type === AccountType.BANK
                        ? 'BK'
                        : acc.type === AccountType.EWALLET
                        ? 'EW'
                        : acc.type === AccountType.SAVINGS
                        ? 'SV'
                        : acc.type === AccountType.CASH
                        ? 'CS'
                        : 'OT'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">{acc.name}</span>
                        {acc.isSystem && (
                          <span
                            title="Default System Account"
                            className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600"
                          >
                            <Shield className="h-3 w-3 text-slate-500" />
                            Default
                          </span>
                        )}
                        <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                          {acc.type}
                        </span>
                        {acc.role && (
                          <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                            {ACCOUNT_ROLE_LABEL[acc.role] || acc.role}
                          </span>
                        )}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            acc.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {acc.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
                        <span>Balance: <strong className="text-slate-800">{money(acc.currentBalanceMinor, currency)}</strong></span>
                        {acc.notes && <span className="text-slate-400 truncate max-w-xs">&bull; {acc.notes}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setEditingAccount(acc);
                        setEditName(acc.name);
                        setEditType(acc.type);
                        setEditRole(acc.role);
                        setEditDesc(acc.notes || '');
                      }}
                      title="Edit Account"
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleAccountActive(acc)}
                      title={acc.isActive ? 'Deactivate Account' : 'Reactivate Account'}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        acc.isActive
                          ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      }`}
                    >
                      <Power className="h-3 w-3" />
                      <span>{acc.isActive ? 'Deactivate' : 'Reactivate'}</span>
                    </button>

                    {!acc.isSystem && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(acc)}
                        title="Delete Account"
                        className="rounded-lg border border-red-200 bg-white p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                No accounts match your filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------------------- MODAL: CREATE CATEGORY ------------------- */}
      {isNewCategoryOpen && (
        <ModalWrapper
          title="Create New Category"
          onClose={() => setIsNewCategoryOpen(false)}
        >
          <form onSubmit={handleCreateCategory} className="space-y-4">
            {formError && <ErrorMessage message={formError} />}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category Kind
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewCatKind(CategoryKind.EXPENSE)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-bold transition-colors ${
                    newCatKind === CategoryKind.EXPENSE
                      ? 'border-rose-600 bg-rose-50 text-rose-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <TrendingDown className="h-3.5 w-3.5" />
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setNewCatKind(CategoryKind.INCOME)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-bold transition-colors ${
                    newCatKind === CategoryKind.INCOME
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  Income
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category Name
              </label>
              <input
                id="new-category-name-input"
                type="text"
                required
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Packaging Materials, Affiliate Sales…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0C3826] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description (Optional)
              </label>
              <textarea
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                rows={2}
                placeholder="Brief purpose of this category…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#0C3826] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewCategoryOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-[#0C3826] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#08281b] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Creating…' : 'Create Category'}
              </button>
            </div>
          </form>
        </ModalWrapper>
      )}

      {/* ------------------- MODAL: EDIT CATEGORY ------------------- */}
      {editingCategory && (
        <ModalWrapper
          title={`Edit Category: ${editingCategory.name}`}
          onClose={() => setEditingCategory(null)}
        >
          <form onSubmit={handleUpdateCategory} className="space-y-4">
            {formError && <ErrorMessage message={formError} />}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category Name
              </label>
              <input
                id="edit-category-name-input"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0C3826] focus:outline-none"
              />
              {editingCategory.isSystem && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Note: This is a default system category. You can customize its display name.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description
              </label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                placeholder="Optional description…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#0C3826] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-[#0C3826] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#08281b] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </ModalWrapper>
      )}

      {/* ------------------- MODAL: CREATE ACCOUNT ------------------- */}
      {isNewAccountOpen && (
        <ModalWrapper
          title="Create New Account"
          onClose={() => setIsNewAccountOpen(false)}
        >
          <form onSubmit={handleCreateAccount} className="space-y-4">
            {formError && <ErrorMessage message={formError} />}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Name
              </label>
              <input
                id="new-account-name-input"
                type="text"
                required
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                placeholder="e.g. Maya Business, BDO Corporate, Cash Box…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0C3826] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Type
                </label>
                <select
                  value={newAccType}
                  onChange={(e) => setNewAccType(e.target.value as AccountType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0C3826] focus:outline-none"
                >
                  <option value={AccountType.BANK}>Bank</option>
                  <option value={AccountType.EWALLET}>E-Wallet</option>
                  <option value={AccountType.SAVINGS}>Savings</option>
                  <option value={AccountType.CASH}>Cash</option>
                  <option value={AccountType.OTHER}>Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Role
                </label>
                <select
                  value={newAccRole}
                  onChange={(e) => setNewAccRole(e.target.value as AccountRole)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0C3826] focus:outline-none"
                >
                  <option value={AccountRole.CONVENIENCE_WALLET}>Convenience Wallet</option>
                  <option value={AccountRole.PROFESSIONAL_ANCHOR}>Professional Anchor</option>
                  <option value={AccountRole.TRANSIT_STATION}>Transit Station</option>
                  <option value={AccountRole.VAULT}>The Vault</option>
                  <option value={AccountRole.DAILY_WALLET}>Daily Wallet</option>
                  <option value={AccountRole.OTHER}>Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={newAccNotes}
                onChange={(e) => setNewAccNotes(e.target.value)}
                rows={2}
                placeholder="Account number, branch or purpose…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#0C3826] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewAccountOpen(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-[#0C3826] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#08281b] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </form>
        </ModalWrapper>
      )}

      {/* ------------------- MODAL: EDIT ACCOUNT ------------------- */}
      {editingAccount && (
        <ModalWrapper
          title={`Edit Account: ${editingAccount.name}`}
          onClose={() => setEditingAccount(null)}
        >
          <form onSubmit={handleUpdateAccount} className="space-y-4">
            {formError && <ErrorMessage message={formError} />}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Account Name
              </label>
              <input
                id="edit-account-name-input"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0C3826] focus:outline-none"
              />
              {editingAccount.isSystem && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Note: This is a default system account. You can customize its name and details.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Type
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as AccountType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0C3826] focus:outline-none"
                >
                  <option value={AccountType.BANK}>Bank</option>
                  <option value={AccountType.EWALLET}>E-Wallet</option>
                  <option value={AccountType.SAVINGS}>Savings</option>
                  <option value={AccountType.CASH}>Cash</option>
                  <option value={AccountType.OTHER}>Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Account Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as AccountRole)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#0C3826] focus:outline-none"
                >
                  <option value={AccountRole.CONVENIENCE_WALLET}>Convenience Wallet</option>
                  <option value={AccountRole.PROFESSIONAL_ANCHOR}>Professional Anchor</option>
                  <option value={AccountRole.TRANSIT_STATION}>Transit Station</option>
                  <option value={AccountRole.VAULT}>The Vault</option>
                  <option value={AccountRole.DAILY_WALLET}>Daily Wallet</option>
                  <option value={AccountRole.OTHER}>Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notes
              </label>
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={2}
                placeholder="Optional notes…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-[#0C3826] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingAccount(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-[#0C3826] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#08281b] transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </ModalWrapper>
      )}

      {/* ------------------- 409 CONFLICT DIALOG: OFFER DEACTIVATE INSTEAD ------------------- */}
      {conflictTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-amber-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Item Has Historical Transactions
                </h3>
                <p className="text-xs text-slate-500">
                  Permanent deletion refused to preserve ledger audit trail
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50/80 border border-amber-200/80 p-3 text-xs text-amber-900 leading-relaxed">
              {conflictTarget.message ||
                `"${conflictTarget.name}" is referenced by existing transactions. Deactivating it hides it from all future transaction forms while preserving past financial statements.`}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConflictTarget(null)}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeactivateConflict}
                className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-700 transition-colors shadow-xs"
              >
                Deactivate Instead
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------- Subcomponents ------------------- */

function CategoryRow({
  category,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  category: CategoryDto;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 p-3.5 transition-colors ${
        !category.isActive ? 'bg-slate-50/70 opacity-75' : 'hover:bg-slate-50/50'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold shrink-0 ${
            category.kind === CategoryKind.INCOME
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-rose-100 text-rose-800'
          }`}
        >
          <Tag className="h-4 w-4" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-900 truncate">{category.name}</span>
            {category.isSystem && (
              <span
                title="Default System Category"
                className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600"
              >
                <Shield className="h-2.5 w-2.5 text-slate-500" />
                Default
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                category.isActive
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {category.isActive ? 'Active' : 'Deactivated'}
            </span>
          </div>
          {category.description && (
            <p className="mt-0.5 text-[11px] text-slate-500 truncate max-w-sm">
              {category.description}
            </p>
          )}
        </div>
      </div>

      {/* Row Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          title="Edit Category"
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleActive}
          title={category.isActive ? 'Deactivate Category' : 'Reactivate Category'}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
            category.isActive
              ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
          }`}
        >
          <Power className="h-3 w-3" />
          <span className="hidden sm:inline">{category.isActive ? 'Deactivate' : 'Reactivate'}</span>
        </button>

        {!category.isSystem && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete Category"
            className="rounded-lg border border-red-200 bg-white p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ModalWrapper({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-center gap-2">
      <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
      <span>{message}</span>
    </div>
  );
}
