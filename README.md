# Personal Finance OS

A personal financial operating system, rebuilt from `Personal_Financial_Tracker_Fixed.xlsx`.

Record a transaction once. Account balances, income and expense totals, cash
flow, net worth, budget progress, goal progress, every statement and the whole
dashboard update from it — because none of those numbers are stored anywhere.

```
┌─────────────┐
│ Transaction │  what the user enters
└──────┬──────┘
       │ buildPostings()   ← the only place posting rules live
       ▼
┌──────────────┐
│ LedgerEntry  │  one row per side. A transfer produces two that cancel.
└──────┬───────┘
       │
       ├─▶ Account balances      ├─▶ Cash flow statement
       ├─▶ Income statement      ├─▶ Net worth + history
       ├─▶ Balance sheet         ├─▶ Budgets and goals
       └─▶ Dashboard             └─▶ Weekly reconciliation
```

Nothing above the ledger is stored. Every figure is derived on read, which is why
editing a ₱1,000 expense to ₱1,500 cannot leave a stale total behind anywhere.

---

## Status

| Layer | State |
|---|---|
| Database schema | Complete — 14 models, indexed, row-level user isolation |
| Financial engine | Complete — pure, tested, verified against the workbook |
| REST API | Complete — auth, CRUD, reports, import/export |
| Seed data | Complete — reproduces the workbook and asserts its own numbers |
| Test suite | 26 tests passing |
| Frontend | **Scaffold + working vertical slice.** See `AI_STUDIO_BRIEF.md` |

The frontend is deliberately minimal: a real sign-in and a real dashboard that
prove the wiring, and a fully typed API client covering every endpoint. Building
the rest of the UI is the next job.

---

## Quick start

Requires Node 20+ and PostgreSQL 14+ (or Docker).

```bash
# 1. Database
docker compose up -d          # or point DATABASE_URL at your own Postgres

# 2. Configure
cp .env.example .env          # then fill in the two JWT secrets

# 3. Install and generate
npm install
npm run build:shared
cd server && npx prisma migrate dev --name init && cd ..

# 4. Seed the workbook's data
npm run db:seed

# 5. Run
npm run dev:server            # http://localhost:4000
npm run dev:web               # http://localhost:5173
```

Sign in as `demo@pfos.local` / `demo1234`.

Generate two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Verify it works

```bash
npm test
```

26 tests, including exact reproduction of the workbook's September 2026 figures
and the full six-step acceptance sequence.

`npm run db:seed` runs the same parity check against the live database and fails
loudly if the engine has drifted:

```
  Excel parity check (September 2026):
    ✓ Total Income      ₱2000.00  (expected ₱2000.00)
    ✓ Total Expenses    ₱1700.00  (expected ₱1700.00)
    ✓ Net Income         ₱300.00  (expected ₱300.00)
    ✓ Physical Wallet    ₱300.00  (expected ₱300.00)
    ✓ Total Cash         ₱300.00  (expected ₱300.00)
    ✓ Net Worth          ₱300.00  (expected ₱300.00)
    ✓ Balance sheet reconciles with changes in net worth
```

---

## Layout

```
packages/shared/      Enums, zod schemas, money utils, API response types.
                      Imported by BOTH server and web, so the contract
                      cannot drift between them.

server/
  prisma/schema.prisma  14 models. LedgerEntry is the source of truth.
  prisma/seed.ts        Workbook data + self-verification.
  src/domain/           THE FINANCIAL ENGINE. Pure functions, zero Prisma
                        imports, fully unit tested. Read ledger.ts first.
  src/repositories/     The only place Prisma meets the engine.
  src/services/         Orchestration. transactionService.ts is the only
                        writer of ledger entries.
  src/routes/           Validate → call a service → shape a response.
                        No financial logic.
  tests/                Excel parity and acceptance tests.

web/                  Vite + React + TypeScript.
  src/lib/api.ts        Complete typed client. Components never call fetch.

docs/
  WORKBOOK_MAPPING.md   Every sheet and formula, and what it became. Read
                        this before changing any calculation.
  API.md                Full REST reference.
AI_STUDIO_BRIEF.md      Handoff brief for building out the frontend.
```

---

## Three design decisions worth knowing

### 1. Money is an integer, always

Every field ending in `Minor` is a count of centavos. `123450` is ₱1,234.50.
There is no float anywhere in the codebase, on purpose: `0.1 + 0.2 !== 0.3`, and
a ledger that drifts by a centavo per transaction fails reconciliation — the one
thing this product promises.

### 2. A transfer has two legs

The spreadsheet wrote one row for a transfer: money into GoTyme, nothing out of
MariBank. Total cash silently inflated. The Income Statement dodged it with a
category exclusion; the Balance Sheet did not.

Here, one transaction explodes into balanced ledger entries:

```
MariBank  −₱2,000   TRANSFER_OUT   isInternal
GoTyme    +₱2,000   TRANSFER_IN    isInternal
                    ──────────────────────────
                    effect on total cash: ₱0
```

"Transfers don't change total cash" is a property of the schema, not a rule
someone has to remember. `checkIntegrity` asserts it on every dashboard load.

### 3. The engine is pure

`server/src/domain/**` imports no database, no framework and no clock. It takes
ledger entries in and returns statements out. That is what lets the test suite
check the accounting against the original spreadsheet without standing up
Postgres, and what would let the storage layer be replaced without touching a
single calculation.

---

## Security

Row-level isolation on every query · bcrypt at 12 rounds · short-lived access
JWTs with rotating, hashed refresh tokens · server-side zod validation on every
input · ownership checks before every write (a foreign key alone would happily
accept another user's account id) · rate limiting, stricter on credentials ·
helmet · 404 rather than 403 for another user's row, so the API never confirms a
record exists · no secrets in frontend code.

---

## A note on `npm run typecheck`

Until `npx prisma generate` has run, the server reports type errors for
`Prisma.*Input` members and implicit `any` on query results — the generated
client does not exist yet. They disappear after generation. The shared package,
the domain engine and the test suite typecheck clean at all times.
