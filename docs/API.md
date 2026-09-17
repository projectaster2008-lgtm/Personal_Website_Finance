# API reference

Base URL: `http://localhost:4000/api`

## Conventions

- **Auth:** `Authorization: Bearer <accessToken>` on everything except
  `/auth/*` and `/health`.
- **Money:** every field ending in `Minor` is an integer count of minor units
  (centavos). `123450` means ₱1,234.50.
- **Dates:** `YYYY-MM-DD` strings, resolved in the user's timezone.
  Timestamps (`createdAt`, `updatedAt`) are full ISO strings.
- **Errors:** `{ "error": { "code": string, "message": string, "details"?: any } }`
- **Validation failures:** `422` with
  `details.fields: [{ path, message }]`.

### Period parameters

Any endpoint marked *(period)* accepts:

```
?preset=THIS_WEEK | THIS_MONTH | LAST_MONTH | THIS_YEAR | CUSTOM
&from=YYYY-MM-DD      # required when preset=CUSTOM
&to=YYYY-MM-DD        # required when preset=CUSTOM
```

Default is `THIS_MONTH`. The resolved window comes back on the response as
`period: { from, to, label }` so the UI can display exactly what was measured.

---

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `email, password, name?, currency?, timezone?, seedDefaults?` | `AuthResponse` |
| POST | `/auth/login` | `email, password` | `AuthResponse` |
| POST | `/auth/refresh` | `refreshToken` | `AuthResponse` (rotated) |
| POST | `/auth/logout` | `refreshToken` | `204` |
| POST | `/auth/password/forgot` | `email` | `{ message }` (always the same, to prevent account enumeration) |
| POST | `/auth/password/reset` | `token, password` | `{ message }` |

`seedDefaults` defaults to `true` and creates the workbook's 6 accounts and 11
categories. A user without them cannot record anything.

`AuthResponse`: `{ user, accessToken, refreshToken, expiresIn }`

Rate limited to 10 attempts per minute per IP+email.

## Profile

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | Current user |
| PATCH | `/me` | `name, currency, timezone, locale, weekStartsOn` |
| POST | `/me/logout-all` | Revokes every refresh token |

## Accounts

| Method | Path | Notes |
|---|---|---|
| GET | `/accounts?includeInactive=true` | Each carries a live `currentBalanceMinor` |
| GET | `/accounts/:id` *(period)* | Detail: account, period activity, register with running balance |
| POST | `/accounts` | `name, type, role, notes?, openingBalanceMinor?, openingBalanceDate?, includeInNetWorth?` |
| PATCH | `/accounts/:id` | Partial |
| DELETE | `/accounts/:id` | `409` if the account has ledger entries — deactivate instead |

Deleting an account with history would rewrite past reports, so it is refused.
The `409` body carries `details.suggestion = "DEACTIVATE"`.

## Categories

| Method | Path | Notes |
|---|---|---|
| GET | `/categories?includeInactive=true` | |
| POST | `/categories` | `name, kind (INCOME\|EXPENSE\|INTERNAL), description?, color?, icon?` |
| PATCH | `/categories/:id` | Changing `kind` is refused once the category has entries |
| DELETE | `/categories/:id` | `409` if used — deactivate instead |

## Transactions

| Method | Path | Notes |
|---|---|---|
| GET | `/transactions` | Filter + paginate, see below |
| GET | `/transactions/:id` | |
| POST | `/transactions` | Discriminated on `type` |
| PUT | `/transactions/:id` | Full replace; entries are regenerated |
| POST | `/transactions/:id/duplicate` | `{ date? }`, defaults to today |
| DELETE | `/transactions/:id` | Entries cascade; every total reverts |

**Query parameters:**
`search, from, to, accountId, categoryId, type, minAmountMinor, maxAmountMinor,
tag, sort (date|amount|createdAt), order (asc|desc), page, pageSize (max 200)`

An `accountId` filter matches transfers on either side.

**Create — income or expense:**

```json
{
  "type": "EXPENSE",
  "date": "2026-09-14",
  "description": "Foods, Snacks",
  "amountMinor": 10000,
  "accountId": "clx…",
  "categoryId": "clx…",
  "notes": "optional",
  "merchant": "optional",
  "tags": []
}
```

**Create — transfer:**

```json
{
  "type": "TRANSFER",
  "date": "2026-10-03",
  "description": "Move to emergency fund",
  "amountMinor": 300000,
  "fromAccountId": "clx…",
  "toAccountId": "clx…",
  "feeMinor": 1500,
  "feeAccount": "FROM"
}
```

One request, two balanced ledger legs. Never send two transactions to simulate a
transfer — the server would have no way to keep them in step.

A non-zero `feeMinor` creates a third leg: a real expense categorised
`Transfer Fees`. That category must exist (`422` if it doesn't).

**Validation:** amount > 0 · source ≠ destination · category `kind` must match
the direction of the money (income category for money in, expense for money out).

## Dashboard and reports

| Method | Path | Returns |
|---|---|---|
| GET | `/dashboard` *(period)* | `DashboardSummary` — all cards in one call |
| GET | `/reports/income-statement` *(period)* | `IncomeStatement` |
| GET | `/reports/cash-flow` *(period)* | `CashFlowStatement` |
| GET | `/reports/balance-sheet` *(period)* | `BalanceSheet` |
| GET | `/reports/net-worth-changes` *(period)* | `ChangesInNetWorth` |
| GET | `/reports/net-worth-history?months=3\|6\|12\|24\|120` | `NetWorthHistory` |
| GET | `/reports/integrity` *(period)* | `IntegrityReport` |

`DashboardSummary.alerts` carries only `severity: "ERROR"` issues. Render them.
They mean the ledger is internally inconsistent — the app's equivalent of the
workbook's ⚠ indicator.

`IncomeStatement` also reports `internalTransfersMinor` and
`internalTransferCount`: money that moved between the user's own accounts and was
deliberately excluded. Show it as context, never as income or expense.

`BalanceSheet.reconciliation` and the cash-flow `explanation` string are the
workbook's ✓ indicators, machine-readable.

## Budgets

| Method | Path | Notes |
|---|---|---|
| GET | `/budgets?month=YYYY-MM` | Returns `BudgetProgress[]` with `spentMinor` read from real expenses |
| POST | `/budgets` | `categoryId, amountMinor, period, startDate, endDate?, rollover?` — upserts |
| PATCH | `/budgets/:id` | |
| DELETE | `/budgets/:id` | |

`status` is `ON_TRACK` (<80%), `WARNING` (≥80%), `OVER_BUDGET` (spent > budget).

## Goals

| Method | Path | Notes |
|---|---|---|
| GET | `/goals?includeArchived=true` | `GoalProgress[]` |
| POST | `/goals` | `name, targetAmountMinor, targetDate?, accountId?, manualAmountMinor?` |
| PATCH | `/goals/:id` | |
| DELETE | `/goals/:id` | |

A goal with `accountId` set reads that account's live balance. Transferring into
the account moves the progress bar with no further input — goals store no amount.

## Recurring

| Method | Path | Notes |
|---|---|---|
| GET | `/recurring` | Each includes a computed `nextOccurrence` |
| GET | `/recurring/upcoming?days=30` | Flattened occurrence list for the Upcoming panel |
| POST | `/recurring` | `type, description, amountMinor, frequency, interval, anchorDay?, startDate, …` |
| PATCH | `/recurring/:id` | Pause/resume via `isActive` |
| DELETE | `/recurring/:id` | |
| POST | `/recurring/run-due` | Posts every due `autoPost` occurrence; idempotent |

A rule anchored on the 31st fires on the 28th/29th/30th in shorter months rather
than skipping them.

## Liabilities and adjustments

| Method | Path |
|---|---|
| GET/POST `/liabilities`, PATCH/DELETE `/liabilities/:id` | Debts on the balance sheet |
| GET/POST `/adjustments`, DELETE `/adjustments/:id` | Manual net-worth adjustments |

`reason` is required on an adjustment.

## Reconciliation

| Method | Path | Notes |
|---|---|---|
| GET | `/reconciliations?weeks=8` | `ledgerBalanceMinor` is computed, not stored |
| POST | `/reconciliations` | `weekOf, accountId, actualBalanceMinor, notes?` — upserts per account per week |
| DELETE | `/reconciliations/:id` | |

Only the bank-app figure is user input. `weekOf` is normalised to the start of
the week.

## Import / export

| Method | Path | Notes |
|---|---|---|
| POST | `/import/preview` | `{ csv, delimiter?, hasHeader? }` → preview with suggested mapping, issues, duplicate flags |
| POST | `/import/commit` | `{ csv, mapping, defaultAccountId?, skipDuplicates? }` |
| GET | `/export/transactions.csv?from&to` | General-Ledger-shaped CSV |
| GET | `/export/transactions.xlsx?from&to` | Same, as a workbook |

The importer auto-detects the original sheet's header
(`Date | Description | Category | Account | Type | Money In | Money Out`) and
handles Money In/Out pairs as well as a single signed Amount column. Every row is
fingerprinted, so re-importing the same file skips rather than duplicates.

Transfer rows are surfaced for manual entry rather than guessed at — a CSV does
not carry the second account.

## Health

`GET /health` → `{ status: "ok", time }`. No auth.
