import React, { useState } from 'react';
import { ShieldCheck, ArrowRight, Building2, User, Loader2 } from 'lucide-react';
import { api, ApiRequestError } from '../lib/api';
import type { UserDto } from '@pfos/shared';

interface AuthScreenProps {
  onSuccess: (user: UserDto) => void;
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleQuickLogin = async (quickEmail: string, quickPass: string) => {
    setError(null);
    setLoading(true);
    try {
      await api.login(quickEmail, quickPass);
      const user = await api.getMe();
      onSuccess(user);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Failed to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await api.login(email, password);
      } else {
        await api.register({
          email,
          password,
          name: name || undefined,
          seedDefaults: true,
        });
      }
      const user = await api.getMe();
      onSuccess(user);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else {
        setError('Authentication failed. Please verify your credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Branding header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Personal Finance OS</h1>
          <p className="text-sm text-slate-500">
            Double-entry financial engine &bull; General Ledger &bull; Zero configuration
          </p>
        </div>

        {/* Quick Demo Access Switcher */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Instant Demo Access (One-Click)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              id="quick-login-rosecraft"
              type="button"
              disabled={loading}
              onClick={() => handleQuickLogin('rosecraft@pfos.local', 'demo1234')}
              className="flex flex-col items-start p-3 text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-colors group"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <Building2 className="h-3.5 w-3.5 text-indigo-600" />
                RoseCraft Tumblers
              </div>
              <span className="mt-1 text-[11px] text-slate-500">
                Business Dataset &bull; Accounts Receivable &bull; USD
              </span>
              <span className="mt-2 text-[10px] font-medium text-indigo-600 group-hover:underline inline-flex items-center gap-0.5">
                Launch dataset &rarr;
              </span>
            </button>

            <button
              id="quick-login-demo"
              type="button"
              disabled={loading}
              onClick={() => handleQuickLogin('demo@pfos.local', 'demo1234')}
              className="flex flex-col items-start p-3 text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-colors group"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <User className="h-3.5 w-3.5 text-emerald-600" />
                Workbook Demo
              </div>
              <span className="mt-1 text-[11px] text-slate-500">
                Personal Dataset &bull; MariBank & Pockets &bull; PHP
              </span>
              <span className="mt-2 text-[10px] font-medium text-emerald-600 group-hover:underline inline-flex items-center gap-0.5">
                Launch dataset &rarr;
              </span>
            </button>
          </div>
        </div>

        {/* Manual Sign In / Register Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex border-b border-slate-100 pb-3 mb-4">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 pb-2 text-center text-sm font-medium border-b-2 -mb-[13px] ${
                mode === 'login'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 pb-2 text-center text-sm font-medium border-b-2 -mb-[13px] ${
                mode === 'register'
                  ? 'border-slate-900 text-slate-900 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 py-2.5 px-4 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Authenticating…
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
