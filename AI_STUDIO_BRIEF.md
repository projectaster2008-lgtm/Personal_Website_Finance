# Brief for Google AI Studio

Paste this file into AI Studio along with the repository. It says what is already
built, what to build next, and — most importantly — what not to touch.

---

## What this repository is

A personal finance application rebuilt from an Excel workbook. The **backend is
complete**: database schema, financial engine, API, authentication, seed data and
a test suite that reproduces the original spreadsheet's numbers exactly.

**Your job is the frontend.** React + Vite + TypeScript, talking to the existing
REST API. `web/src/lib/api.ts` is a finished, fully typed client — every endpoint
is already wrapped and returns a typed response. You should not need to write a
single `fetch` call.

---

## Rules — read these before writing code

### 1. Never calculate money in the frontend

Not totals, not balances, not percentages, not "remaining budget". Every figure
the UI shows already arrives from the API, pre-computed by a tested engine.

```ts
// WRONG — this reimplements accounting in a component
const total = transactions.reduce((s, t) => s + t.amountMinor, 0);

// RIGHT
const { data } = await api.getDashboard({ preset: 'THIS_MONTH' });
data.totalCashMinor;
```

If a number you need is genuinely missing from a response, add it to the server's
report layer. Do not derive it in a component. The moment two places compute the
same figure, they start disagreeing, and this app's whole promise is that they
never do.

### 2. Money is integer centavos

Every field ending in `Minor` is an integer count of minor units. ₱1,234.50 is
`123450`. Never divide by 100 yourself — use the shared formatter:

```ts
import { formatMoney } from '@pfos/shared';
formatMoney(123450, { currency: user.currency }); // "₱1,234.50"
```

`0.1 + 0.2 !== 0.3`. A finance app that drifts by a centavo fails reconciliation,
which is the one thing this product promises.

### 3. Dates are `YYYY-MM-DD` strings

Not `Date` objects, not ISO timestamps. The server resolves periods in the user's
timezone (`Asia/Manila` by default). Send the string you were given back
unchanged. Do not run it through `new Date()` and reformat it — that is how a
transaction ends up in the wrong month.

### 4. One period, one dashboard

The period selector drives every panel on a page through a single API call. Do
not let one chart fetch September while another fetches August. The server
guarantees consistency only if you ask it once.

### 5. Don't invent endpoints

`docs/API.md` lists every route. If something you want isn't there, say so rather
than mocking it — a mocked number in a finance app is worse than a missing one.

---

## What to build

### Navigation

```
HOME        Dashboard
MONEY       Transactions · Accounts · Categories
PLANNING    Budgets · Goals · Recurring
REPORTS     Income & Spending · Cash Flow · Net Worth
TOOLS       Reconciliation · Import / Export
SETTINGS
```

Desktop: sidebar. Mobile: bottom navigation, with a prominent Add Transaction
button. The mobile experience is not a shrunk desktop table — transactions become
cards in a timeline.

### Screens, in build order

**1. Auth** — login, register, forgot/reset password. Store the access token in
memory and the refresh token wherever your app shell can reach it; `api.ts`
already handles the refresh-on-401 flow if you give it the callbacks.

**2. Dashboard** (`GET /api/dashboard`) — one call returns everything:
- Total cash, net worth, income, expenses, net income
- `expenseBreakdown` and `incomeSources` → donut charts
- `accounts` → balance cards, grouped by role
- `recentTransactions` → list
- `trend` → 12-month line chart
- `alerts` → red banner if non-empty. **Do not hide these.** They mean the
  ledger has an inconsistency.

Clicking a category or account navigates to Transactions pre-filtered to that
category/account and the current period.

**3. Add Transaction** — the most important interaction in the app. Three tabs:
Income / Expense / Transfer. Amount field focused on open, date defaults to
today, account and category are dropdowns. Transfer shows From and To, and must
reject the same account on both sides (the server rejects it too, but the user
shouldn't have to find that out by submitting).

**4. Transactions** — search, date range, account, category, type, amount range,
sort, pagination. Row actions: edit, duplicate, delete. Export CSV/XLSX buttons
hit the export endpoints directly.

**5. Accounts** — list with balances; detail page shows the period activity block
(income, expenses, transfers in/out, net change) and the register with running
balance.

**6. Reports** — Income Statement, Cash Flow, Balance Sheet, Changes in Net
Worth, Net Worth History. Each is one endpoint returning a ready-to-render
structure. Render the reconcile badges (`reconciliation.matches`) — they are the
workbook's ✓/⚠ indicators and they matter.

**7. Budgets / Goals / Recurring** — progress bars come pre-computed
(`percentUsed`, `percentComplete`, `status`). Colour by `status`:
`ON_TRACK` / `WARNING` / `OVER_BUDGET`.

**8. Reconciliation** — a weekly grid. Ledger balance is read-only (computed);
the user types only the bank-app figure. Show MATCHED / NEEDS REVIEW clearly.

**9. Import/Export** — paste or upload CSV → `POST /api/import/preview` → show
the mapping and flagged rows → confirm → `POST /api/import/commit`. Never skip
the preview.

### Design direction

Clean, minimal, professional, data-dense without clutter. Cards, tables, charts,
clear hierarchy, generous spacing. Avoid gradients and animation. It should not
look like a spreadsheet, and it should not look like a toy.

Suggested stack, already assumed by the scaffold: Tailwind CSS, shadcn/ui,
Recharts, TanStack Query, React Router.

### Micro-UX to include

Empty states · loading skeletons · error states · success toasts · confirmation
dialogs before deleting · inline form validation · human-readable dates ·
consistent currency formatting · keyboard-accessible forms · visible focus rings ·
tooltips on accounting terms.

### Educational tooltips — use these exact explanations

The API sends some of these; hard-code the rest:

- *"Internal transfers move money between accounts you already own. They do not
  count as income or spending."*
- *"Net worth is what you own minus what you owe."*
- *"Net income is income minus expenses for the selected period."*
- *"Your account balances changed, but your total cash did not, because the money
  is still yours."*

Do not bury the interface in text. One tooltip per concept, where the number is.

---

## Running it

```bash
npm install
npm run build:shared
cd server && npx prisma generate && npx prisma migrate dev && npm run db:seed
npm run dev:server     # http://localhost:4000
npm run dev:web        # http://localhost:5173
```

Demo login: `demo@pfos.local` / `demo1234`, preloaded with the workbook's data.

---

## How to verify you haven't broken the accounting

After seeding, the dashboard for **September 2026** must read:

| Figure | Value |
|---|---|
| Total Income | ₱2,000 |
| Total Expenses | ₱1,700 |
| Net Income | ₱300 |
| Physical Wallet | ₱300 |
| Total Cash | ₱300 |
| Net Worth | ₱300 |

Then run the six-step sequence from the original brief (create Test Bank, add
₱10,000 income, ₱2,000 expense, ₱3,000 transfer, ₱500 expense, delete it). The
transfer must leave Total Cash and Net Worth **unchanged**. `npm test` asserts all
of this already — run it if anything looks wrong.

---

## What NOT to change

- `server/src/domain/**` — the financial engine. It is pure, tested, and matches
  the source workbook. If you think it is wrong, write a failing test first.
- `server/prisma/schema.prisma` — particularly the `LedgerEntry` model. The
  two-leg transfer design is what makes the accounting correct.
- `packages/shared/src/money.ts` — no floats.
- The test suite. If a change breaks `npm test`, the change is wrong, not the test.

Extending is fine — new endpoints, new report fields, new UI. Rewriting the
posting rules is not.
