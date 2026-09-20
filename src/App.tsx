/**
 * App shell.
 *
 * This is a WORKING vertical slice, not a mockup: it signs in against the real
 * API, loads the real dashboard, and renders real figures from the database.
 * Its job is to prove the wiring end to end so the rest of the UI can be built
 * with confidence about what the data actually looks like.
 *
 * Google AI Studio: replace this file with proper routing and screens. Keep the
 * patterns — `api.*` for every request, `money()` for every amount, one period
 * for the whole page, and never compute a total in a component.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PeriodPreset, UserDto } from '@pfos/shared';
import { api, ApiRequestError, session } from './lib/api';
import { money, percent } from './lib/format';

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

  if (booting) return <Centered>Loading…</Centered>;
  if (!user) return <SignIn onSignedIn={setUser} />;
  return <Dashboard user={user} onSignOut={() => api.logout().then(() => setUser(null))} />;
}

/* ---------------------------------------------------------------- sign in --- */

function SignIn({ onSignedIn }: { onSignedIn: (user: UserDto) => void }) {
  const [email, setEmail] = useState('demo@pfos.local');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const auth = await api.login(email, password);
      onSignedIn(auth.user);
    } catch (err) {
      console.error('Sign-in error:', err);
      if (err instanceof ApiRequestError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Could not sign in');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Personal Finance OS</h1>
          <p className="mt-1 text-sm text-slate-500">
            Record a transaction once. Everything else keeps itself up to date.
          </p>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
            required
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none"
            required
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-slate-900 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Centered>
  );
}

/* -------------------------------------------------------------- dashboard --- */

const PERIODS: { value: PeriodPreset; label: string }[] = [
  { value: 'THIS_WEEK', label: 'This week' },
  { value: 'THIS_MONTH', label: 'This month' },
  { value: 'LAST_MONTH', label: 'Last month' },
  { value: 'THIS_YEAR', label: 'This year' },
];

function Dashboard({ user, onSignOut }: { user: UserDto; onSignOut: () => void }) {
  const [preset, setPreset] = useState<PeriodPreset>('THIS_MONTH');

  // ONE query drives every panel, so no two cards can show different windows.
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', preset],
    queryFn: () => api.getDashboard({ preset }),
  });

  const fmt = (minor: number) => money(minor, user.currency);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Personal Finance OS</h1>
          <p className="text-sm text-slate-500">{data?.period.label ?? ' '}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button onClick={onSignOut} className="text-sm text-slate-500 hover:text-slate-900">
            Sign out
          </button>
        </div>
      </header>

      {isLoading && <p className="text-slate-500">Loading your finances…</p>}
      {error && <p className="text-red-600">Could not load the dashboard.</p>}

      {data && (
        <div className="space-y-6">
          {/* Integrity alerts are never hidden — they mean the ledger disagrees with itself. */}
          {data.alerts.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="font-medium text-red-800">Your ledger needs attention</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-red-700">
                {data.alerts.map((alert, i) => <li key={i}>{alert.message}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Total cash" value={fmt(data.totalCashMinor)} />
            <Stat label="Net worth" value={fmt(data.netWorthMinor)} />
            <Stat label="Income" value={fmt(data.incomeMinor)} tone="income" />
            <Stat label="Expenses" value={fmt(data.expensesMinor)} tone="expense" />
          </div>

          <Panel title="Net income" hint="Income minus expenses for the selected period.">
            <p className="tabular text-3xl font-semibold">{fmt(data.netIncomeMinor)}</p>
          </Panel>

          <div className="grid gap-6 md:grid-cols-2">
            <Panel title="Where it went">
              {data.expenseBreakdown.length === 0 ? (
                <Empty>No spending recorded in this period.</Empty>
              ) : (
                <ul className="space-y-2">
                  {data.expenseBreakdown.map((line) => (
                    <li key={line.name} className="flex justify-between text-sm">
                      <span>{line.name}</span>
                      <span className="tabular text-slate-600">
                        {fmt(line.amountMinor)} · {percent(line.percent)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Accounts">
              <ul className="space-y-2">
                {data.accounts.map((account) => (
                  <li key={account.id} className="flex justify-between text-sm">
                    <span>{account.name}</span>
                    <span className="tabular font-medium">{fmt(account.balanceMinor)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="Recent transactions">
            {data.recentTransactions.length === 0 ? (
              <Empty>Nothing recorded yet. Add your first transaction to get started.</Empty>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.recentTransactions.map((tx) => (
                  <li key={tx.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium">{tx.description}</p>
                      <p className="text-slate-500">
                        {tx.date} · {tx.category?.name ?? 'Transfer'}
                      </p>
                    </div>
                    <span className="tabular">{fmt(tx.amountMinor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- bits --- */

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'income' | 'expense' }) {
  const color = tone === 'income' ? 'text-income' : tone === 'expense' ? 'text-expense' : '';
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`tabular mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="font-medium">{title}</h2>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6">{children}</div>;
}
