# Fixes applied to the Google AI Studio build

AI Studio restructured the repo into a single-process app (Vite + Express on one
port) and swapped PostgreSQL for an in-memory store so it runs with no setup.
Both are reasonable calls for its sandbox, and it correctly left the financial
engine untouched.

Four things stopped it from running. All four are fixed; the app now boots and
passes both the unit tests and the full acceptance sequence.

---

## 1. The entire API layer was missing from the export

`server/src/routes/`, `server/src/services/`, `server/src/repositories/` and
`server/tests/` were absent, while `server/src/app.ts` still imported
`./routes/index.js`. The process died on startup:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '/server/src/routes/index.js' imported from /server/src/app.ts
```

**Fixed:** all four directories restored from the original repository. No code
changes were needed — the imports are relative and the `@pfos/shared` alias was
already configured in both `tsconfig.json` and `vite.config.ts`.

## 1b. The frontend entry point was missing too

`index.html` loads `/src/main.tsx`, but the export contained only `src/App.tsx`
and `src/lib/api.ts`. Without `main.tsx` there is no React root, so the page
would have rendered blank even once the server booted. `src/index.css` (the
Tailwind entry) and `src/lib/format.ts` (imported by `App.tsx`) were missing as
well.

**Fixed:** `src/main.tsx`, `src/index.css` and `src/lib/format.ts` restored.
Vite now compiles and serves the app — verified by fetching `/` and
`/src/main.tsx` from the running dev server.

In total the export was missing five things: the routes, services and
repositories directories, the test suite, and the frontend entry files. Worth
checking whether AI Studio hit a file limit on export, because everything it
dropped was something it never edited.

## 2. `@prisma/client` was imported statically, so the app could not start

`server/src/lib/prisma.ts` had `import { PrismaClient } from '@prisma/client'`
at module scope, with a `try/catch` fallback to the in-memory store *inside* the
function. The static import runs first, so the fallback never got a chance:

```
SyntaxError: The requested module '@prisma/client'
  does not provide an export named 'PrismaClient'
```

This bites every fresh clone, because the schema now lives at
`server/prisma/schema.prisma` and `prisma generate` looks in `./prisma/` — so
the client is never generated and the import always fails.

**Fixed:** the client is now `require`d lazily, inside the `USE_REAL_POSTGRES`
branch only. The default in-memory path never touches it, and the fallback
works as intended.

`server/src/middleware/error.ts` had the same problem with
`import { Prisma } from '@prisma/client'`. It now recognises Prisma errors by
shape (`/^P\d{4}$/` on `error.code`) instead of by class identity, which is
stable API and needs no generated client.

**Also:** `package.json` gained `"prisma": { "schema": "server/prisma/schema.prisma" }`
so `npx prisma generate` and `migrate` work from the repository root when you do
move to real Postgres.

## 3. Amounts were being stored 100x too large

The wire contract says every `*Minor` field is an integer count of centavos, but
`amountMinorSchema` multiplied its input by 100 — so a field named `amountMinor`
silently accepted major units. Posting `amountMinor: 1000000` (intended:
₱10,000) stored ₱100,000.

```
POST /api/transactions  { "amountMinor": 1000000 }
  before fix:  income PHP 1,000,000.00
  after fix:   income PHP    10,000.00
```

**Fixed:** the schema now accepts integer minor units only and **rejects**
fractional input with a clear message rather than rounding it. Converting what
a human types into centavos is the client's job — use `toMinor()` from
`packages/shared/src/money.ts` in the form layer.

This was a bug in the original handoff, not something AI Studio introduced.

## 4. Deleting a transaction orphaned its ledger entries

The in-memory store does not implement `ON DELETE CASCADE`, so
`prisma.transaction.delete()` left the entries behind. They kept affecting every
balance with no transaction left to explain them, and the next dashboard load
crashed:

```
TypeError: Cannot read properties of null (reading 'type')
  at loadEntries (server/src/repositories/ledgerRepository.ts:82)
```

**Fixed:** `deleteTransaction` now removes the entries explicitly inside a
transaction rather than delegating cleanup to the storage layer. This is the
right behaviour against Postgres too — an orphaned ledger entry is the single
worst failure mode in this system, and it should not depend on a database
setting being correct.

`loadEntries` is also defensive now: an entry with no transaction is labelled
`(orphaned entry - please report)` instead of throwing, so one bad row cannot
take down every report at once.

---

## Verified after the fixes

```
server/tests/engine.test.ts ......................... 26 passed

Live API, in-memory store, September 2026:
  income PHP 2,000.00 · expenses PHP 1,700.00 · net PHP 300.00
  Physical Wallet PHP 300.00 · total cash PHP 300.00 · net worth PHP 300.00
  Miscellaneous PHP 1,600.00 · Food PHP 100.00

Live API, acceptance sequence (brief section 44):
  2-3  income 10,000.00  expenses 2,000.00  net 8,000.00  MariBank 8,000.00
  4    transfer 3,000 -> MariBank 5,000.00, Emergency Fund 3,000.00
       total cash 8,300.00 -> 8,300.00   net worth 8,300.00 -> 8,300.00   UNCHANGED
  5    +500 food -> expenses 2,500.00  net 7,500.00  MariBank 4,500.00
  6    deleted   -> expenses 2,000.00  net 8,000.00  MariBank 5,000.00  REVERTED

  integrity ok=true, 0 issues
  cash flow net change 8,000.00, to savings 3,000.00 (memo only, not added)
  balance sheet reconciles with changes in net worth
```

---

## Still outstanding

**The frontend has not been built.** `src/App.tsx` is the original scaffold with
an eight-line change to error handling, and `src/lib/api.ts` is the original
client with its base URL switched to same-origin. There is no routing and there
are no screens — no Transactions page, Accounts page, Add Transaction form,
Budgets, Goals, Recurring, Reports or Reconciliation.

That remains the job described in `AI_STUDIO_BRIEF.md`.

**Data does not survive a restart.** The in-memory store is seeded fresh on every
boot. Fine for building the UI against; set `USE_REAL_POSTGRES=true` and run
`npx prisma generate && npx prisma migrate dev && npm run db:seed` when you want
persistence.

**Two entry points exist.** `server.ts` (the real one, port 3000, serves the API
and Vite together) and `server/src/index.ts` (the original API-only entry, port
4000). Nothing imports the latter; delete it or keep it for API-only deployment.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 26 tests
```

Sign in as `demo@pfos.local` / `demo1234`.
