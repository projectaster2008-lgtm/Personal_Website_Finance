import React, { useState } from 'react';
import { ArrowRight, User, Loader2, Sparkles } from 'lucide-react';
import { api, ApiRequestError } from '../lib/api';
import type { UserDto } from '@pfos/shared';
import { SolvraBannerLogo } from './SolvraLogo';

interface AuthScreenProps {
  onSuccess: (user: UserDto) => void;
}

export function AuthScreen({ onSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleQuickLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.demoLogin();
      const user = await api.getMe();
      onSuccess(user);
    } catch {
      try {
        await api.login('rosecraft@tumblers.ph', 'demo1234');
        const user = await api.getMe();
        onSuccess(user);
      } catch (err) {
        if (err instanceof ApiRequestError) {
          setError(err.message);
        } else {
          setError('Failed to sign in. Please try again.');
        }
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
        await api.login(email, password, name.trim() || undefined);
      } else {
        await api.register({
          email,
          password,
          name: name.trim() || undefined,
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#f8faf8] via-[#f1f6f2] to-[#e8f0eb] p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Solvra Official Brand Emblem & Logo */}
        <div className="text-center pt-2">
          <SolvraBannerLogo />
        </div>

        {/* RoseCraft Demo Financial Dataset Quick Access */}
        <div className="rounded-2xl border border-emerald-900/15 bg-white/90 backdrop-blur p-5 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0C3826]">
              <Sparkles className="h-3.5 w-3.5 text-[#C59B27]" />
              <span>Demo Financial Dataset</span>
            </div>
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
              RoseCraft Tumblers (PHP ₱)
            </span>
          </div>

          <button
            id="quick-login-rosecraft"
            type="button"
            disabled={loading}
            onClick={() => handleQuickLogin()}
            className="w-full flex flex-col items-start p-4 text-left rounded-xl border border-emerald-800/20 bg-gradient-to-r from-emerald-50/70 to-white hover:from-emerald-100/60 hover:to-emerald-50/60 transition-all shadow-sm hover:shadow group"
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-sm font-bold text-[#0C3826]">
                <img src="/solvra-logo.jpg" alt="" className="h-5 w-5 rounded-full object-cover" />
                <span>RoseCraft Tumblers Financial Dataset</span>
              </div>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#0C3826]" />
              ) : (
                <ArrowRight className="h-4 w-4 text-[#0C3826] transition-transform group-hover:translate-x-1" />
              )}
            </div>
            <span className="mt-1 text-xs text-slate-600">
              E-Commerce Tumbler Business &bull; GCash, Shopee &amp; Cash Accounts &bull; 17 Reconciled Transactions
            </span>
            <div className="mt-3 flex items-center justify-between w-full pt-2 border-t border-emerald-900/10">
              <span className="text-[11px] text-slate-500 font-medium">
                Audited Multi-Step P&amp;L, Balance Sheet &amp; Cash Flow
              </span>
              <span className="text-xs font-bold text-[#0C3826] group-hover:underline">
                Explore Dataset &rarr;
              </span>
            </div>
          </button>
        </div>

        {/* Manual Sign In / Register Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex border-b border-slate-100 pb-3 mb-4">
            <button
              type="button"
              id="tab-sign-in"
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 pb-2 text-center text-sm font-semibold border-b-2 -mb-[13px] transition-colors ${
                mode === 'login'
                  ? 'border-[#0C3826] text-[#0C3826]'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              id="tab-create-account"
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 pb-2 text-center text-sm font-semibold border-b-2 -mb-[13px] transition-colors ${
                mode === 'register'
                  ? 'border-[#0C3826] text-[#0C3826]'
                  : 'border-transparent text-slate-400 hover:text-slate-700'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Your Full Name {mode === 'login' && <span className="text-slate-400 font-normal">(Optional)</span>}
              </label>
              <input
                id="auth-name-input"
                type="text"
                required={mode === 'register'}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maria Santos"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0C3826] focus:ring-1 focus:ring-[#0C3826] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                id="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0C3826] focus:ring-1 focus:ring-[#0C3826] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                id="auth-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0C3826] focus:ring-1 focus:ring-[#0C3826] focus:outline-none"
              />
            </div>

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#0C3826] py-2.5 px-4 text-sm font-bold text-white shadow-sm hover:bg-[#08281b] focus:outline-none transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  {mode === 'login' ? 'Sign In to Solvra' : 'Create Account'}
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
