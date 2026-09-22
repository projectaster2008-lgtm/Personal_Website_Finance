import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Plus, Loader2, Tag, Wallet } from 'lucide-react';
import { AccountType } from '@pfos/shared';

export interface ComboboxItem {
  id: string;
  name: string;
  subtitle?: string;
  badge?: string;
}

interface ExtensibleComboboxProps {
  id: string;
  label: string;
  value: string;
  items: ComboboxItem[];
  placeholder?: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
  // Handler when creating a new category or account
  onCreate: (name: string, extra?: { accountType?: AccountType }) => Promise<string | void>;
  type: 'category' | 'account';
  kindLabel?: string; // e.g. "Income" or "Expense"
}

export function ExtensibleCombobox({
  id,
  label,
  value,
  items,
  placeholder = 'Select or type to create…',
  disabled = false,
  onSelect,
  onCreate,
  type,
  kindLabel,
}: ExtensibleComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType>(AccountType.OTHER);
  const [showAccountTypePicker, setShowAccountTypePicker] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Selected item object
  const selectedItem = items.find((item) => item.id === value);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowAccountTypePicker(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered items
  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase().trim()),
  );

  const trimmedSearch = search.trim();
  const exactMatchExists = items.some(
    (item) => item.name.toLowerCase() === trimmedSearch.toLowerCase(),
  );
  const canCreate = trimmedSearch.length > 0 && !exactMatchExists;

  const handleSelectItem = (item: ComboboxItem) => {
    onSelect(item.id);
    setSearch('');
    setIsOpen(false);
    setShowAccountTypePicker(false);
  };

  const handleCreate = async () => {
    if (!trimmedSearch || isCreating) return;

    if (type === 'account' && !showAccountTypePicker) {
      // Let user optionally pick account type before submitting
      setShowAccountTypePicker(true);
      return;
    }

    setIsCreating(true);
    try {
      const newId = await onCreate(
        trimmedSearch,
        type === 'account' ? { accountType: selectedAccountType } : undefined,
      );
      if (newId) {
        onSelect(newId);
      }
      setSearch('');
      setIsOpen(false);
      setShowAccountTypePicker(false);
      setSelectedAccountType(AccountType.OTHER);
    } catch {
      // error handled in caller
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1">
        {label}
      </label>

      {/* Trigger Button / Display */}
      <div
        id={`${id}-trigger`}
        role="combobox"
        aria-expanded={isOpen}
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
          if (!isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className={`flex w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs cursor-pointer hover:border-slate-400 focus-within:border-[#0C3826] focus-within:ring-1 focus-within:ring-[#0C3826] ${
          disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : ''
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {type === 'category' ? (
            <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          ) : (
            <Wallet className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          )}
          <span className={selectedItem ? 'font-medium text-slate-900' : 'text-slate-400'}>
            {selectedItem ? selectedItem.name : placeholder}
          </span>
          {selectedItem?.badge && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {selectedItem.badge}
            </span>
          )}
        </div>
        <ChevronsUpDown className="h-4 w-4 text-slate-400 shrink-0" />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100">
          {/* Search Input Field */}
          <div className="p-2 border-b border-slate-100">
            <input
              ref={inputRef}
              id={`${id}-search-input`}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowAccountTypePicker(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (canCreate) {
                    handleCreate();
                  } else if (filteredItems.length > 0) {
                    handleSelectItem(filteredItems[0]);
                  }
                } else if (e.key === 'Escape') {
                  setIsOpen(false);
                  setShowAccountTypePicker(false);
                }
              }}
              placeholder={`Search or type to create new…`}
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0C3826] focus:outline-none"
            />
          </div>

          {/* List of existing options */}
          <div className="max-h-52 overflow-y-auto p-1 text-sm divide-y divide-slate-50">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const isSelected = item.id === value;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-emerald-50 text-[#0C3826] font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span>{item.name}</span>
                      {item.badge && (
                        <span className="rounded bg-slate-100 border border-slate-200 px-1 py-0.2 text-[9px] text-slate-500">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-[#0C3826] shrink-0" />}
                  </button>
                );
              })
            ) : !canCreate ? (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                No matching {type === 'category' ? 'categories' : 'accounts'} found
              </div>
            ) : null}
          </div>

          {/* Option to create new category or account */}
          {canCreate && (
            <div className="border-t border-slate-100 p-2 bg-slate-50/80 rounded-b-lg">
              {showAccountTypePicker && type === 'account' ? (
                <div className="space-y-2 p-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                    <span>Choose Account Type:</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { value: AccountType.BANK, label: 'Bank' },
                      { value: AccountType.EWALLET, label: 'E-Wallet' },
                      { value: AccountType.SAVINGS, label: 'Savings' },
                      { value: AccountType.CASH, label: 'Cash' },
                      { value: AccountType.OTHER, label: 'Other' },
                    ].map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setSelectedAccountType(t.value as AccountType)}
                        className={`rounded px-2 py-1 text-[11px] font-medium border text-center transition-colors ${
                          selectedAccountType === t.value
                            ? 'bg-[#0C3826] border-[#0C3826] text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={isCreating}
                    className="w-full flex items-center justify-center gap-1.5 rounded-md bg-[#0C3826] py-1.5 text-xs font-bold text-white hover:bg-[#08281b] transition-colors"
                  >
                    {isCreating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    <span>Create &amp; Select Account</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="w-full flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-left text-xs font-semibold text-[#0C3826] hover:bg-emerald-100/80 transition-colors"
                >
                  <div className="flex items-center gap-2 truncate">
                    {isCreating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-[#0C3826]" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 text-[#0C3826] shrink-0" />
                    )}
                    <span className="truncate">
                      Create <strong>&ldquo;{trimmedSearch}&rdquo;</strong>
                      {kindLabel ? ` (${kindLabel})` : ''}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-medium shrink-0 ml-2">
                    Press Enter &crarr;
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
