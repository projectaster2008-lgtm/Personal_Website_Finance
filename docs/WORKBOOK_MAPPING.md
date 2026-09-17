# Workbook → application mapping

Source: `Personal_Financial_Tracker_Fixed.xlsx`, inspected cell by cell (formulas
and cached values). This document records every sheet's logic and how it became
code, so nobody has to re-derive it from the spreadsheet later.

---

## 1. Chart of Accounts

| Sheet range | Content | Becomes |
|---|---|---|
| `A6:C11` | 6 accounts with Role + Notes | `accounts` table, seeded by `seedService.ts` |
| `A14:B17` | 4 income categories | `categories` where `kind = INCOME` |
| `A21:B26` | 6 expense categories | `categories` where `kind = EXPENSE` |
| `A30:B30` | "Internal Transfer" | `categories` where `kind = INTERNAL` |
| `F2:F12` | Formula column feeding the Category dropdown | Replaced by an API query |

Roles are preserved as a real enum (`AccountRole`), not free text, because they
drive behaviour: `VAULT` accounts are what the Cash Flow Statement's savings memo
section sums, and what goals link to.

| Workbook role | Enum |
|---|---|
| Convenience Wallet | `CONVENIENCE_WALLET` |
| Professional Anchor | `PROFESSIONAL_ANCHOR` |
| Transit Station | `TRANSIT_STATION` |
| The Vault (Pocket 1 / 2 of 2) | `VAULT` |
| Daily Wallet | `DAILY_WALLET` |

Data validation on the sheet restricted Account to `'Chart of Accounts'!$A$6:$A$11`
and Category to `$F$2:$F$12`. Those become foreign keys — the same constraint,
enforced by the database instead of by Excel.

---

## 2. General Ledger

Columns: `Date | Description | Category | Account | Type | Money In | Money Out | Running Balance`

Type was validated against the literal list `"Income,Expense,Transfer,Fee"`.

**Running balance, `H6`:**

```excel
=IF(D6="","",SUMIFS($F$6:F6,$D$6:D6,D6)-SUMIFS($G$6:G6,$D$6:D6,D6))
```

Note the `$D$6:D6` expanding range — this is a **per-account** running balance,
not a running total of the whole sheet. `withRunningBalance()` in
`domain/engine/balances.ts` reproduces it in one pass instead of O(n²) SUMIFS.

**Storage model change (brief §7).** Money In / Money Out are *derived*, not
stored. The database keeps `amountMinor` + `direction` on each ledger entry;
`Money In` is `direction = IN`, `Money Out` is `direction = OUT`. The CSV and
XLSX exporters rebuild both columns so exported files still look like the sheet.

---

## 3. Income Statement

**Period:** `B4` / `B5` were two hard-coded cells that every other sheet pointed
at. This is the single most important structural idea in the workbook, and it is
preserved: `reportService.periodFor()` resolves ONE period per request and passes
it to every report, so no two panels can show different windows.

**Income rows, `B9:B12`:**

```excel
=SUMIFS('General Ledger'!$F$6:$F$1005, 'General Ledger'!$C$6:$C$1005, "Allowance",
        'General Ledger'!$A$6:$A$1005, ">="&$B$4,
        'General Ledger'!$A$6:$A$1005, "<="&$B$5)
```

**Expense rows, `B17:B22`:** identical but summing column `G` (Money Out).

`B13 = SUM(B9:B12)` · `B23 = SUM(B17:B22)` · `B25 = B13 - B23`

### Two deliberate changes

**(a) The sheet filters on CATEGORY, not on Type.** Every SUMIFS above matches
column `C`. The Type column is not consulted anywhere on this sheet. That is why
the "Internal Transfer" pseudo-category exists — it is the exclusion marker, and
a row is kept out of the statement by being categorised that way.

The app replaces the magic string with a structural flag:
`ledger_entries.isInternal`. Income vs expense is then decided by the category's
`kind`, not by which column a number sits in. Consequence: a transfer can never
land in either section regardless of what category anyone picks, and a
user-created category appears automatically instead of needing a new formula row.

**(b) Hard-coded rows become dynamic.** The sheet had exactly ten formula rows.
Adding an eleventh category to the Chart of Accounts would have produced a
category that silently never appeared on any statement. `computeIncomeStatement`
emits one line per category that exists, including zero lines, so the statement
keeps a stable shape month to month without capping the category list.

---

## 4. Personal Balance Sheet

**Per-account balance, `B8:B13`:**

```excel
=SUMIFS(MoneyIn,  Account, "MariBank", Date, "<="&'Income Statement'!$B$5)
-SUMIFS(MoneyOut, Account, "MariBank", Date, "<="&'Income Statement'!$B$5)
```

`B14 = SUM(B8:B13)` · `B17` manual liabilities · `B19 = B14 - B17`

**`A20`** — the reconcile indicator:

```excel
=IF(ROUND(B19,2)=ROUND('Changes in Net Worth'!$B$10,2),
    "✓ Matches Statement of Changes in Net Worth",
    "⚠ Does not match - recheck entries")
```

Preserved as a structured object (`BalanceSheet.reconciliation`) rather than a
string, so the UI can render it as a badge and `checkIntegrity` can raise it as
an alert. Same check, machine-readable.

Two additions the sheet had no room for: `openingBalanceMinor` per account (for
money that existed before the ledger started) and a real `liabilities` table
instead of one manually typed total.

---

## 5. Changes in Net Worth

```excel
B7  = SUMIFS(MoneyIn, Date, "<"&Start) - SUMIFS(MoneyOut, Date, "<"&Start)
B8  = 'Income Statement'!$B$25
B9  = 0                      ' manual adjustment
B10 = B7 + B8 + B9
```

`B7` summed **all** rows, transfers included. In the spreadsheet that worked only
because a transfer was a single row. With true two-leg transfers the internal
legs cancel, so the same formula stays correct — and now survives transfers being
recorded properly, which the original could not.

The app additionally subtracts opening liabilities, so "beginning net worth" is
net worth rather than just cash, and treats debt taken on during the period as a
net-worth reduction that does not touch income.

`B9` becomes the `net_worth_adjustments` table. `reason` is **required** — an
unexplained adjustment is indistinguishable from a bug.

---

## 6. Cash Flow Statement

```excel
B8  = 'Income Statement'!$B$13          ' income received
B9  = -'Income Statement'!$B$23         ' expenses paid
B10 = B8 + B9
B13 = SUMIFS(MoneyIn, Account, "GoTyme - Emergency Fund", Type, "Transfer", Date range)
B14 = ' same for Gadget Fund
B15 = B13 + B14
B18 = B10                               ' net change in total cash
B19 = IF(ROUND(B18,2)=ROUND('Income Statement'!$B$25,2), "✓ Matches…", "⚠ …")
```

Note `B18 = B10` exactly: the savings total is a **memo** and is deliberately not
added. `A16` spells out why — *"This is money moving from one of your own
accounts to another - your total cash doesn't change, so it isn't added again
below."* That sentence is section 17 of the brief, and it is rendered in the UI
via `CashFlowStatement.explanation`.

`B13:B14` are the only place the Type column is used anywhere in the workbook.
The app generalises them: any account with role `VAULT` or type `SAVINGS`
produces a memo line, so adding a third savings pocket needs no new formula.

**Added:** `openingCashMinor` and `closingCashMinor`, computed independently from
account balances. If `closing − opening ≠ netChange`, the integrity check fires.
The spreadsheet had no way to catch that class of error.

---

## 7. Dashboard

Rows `B10:B12`, `B16:B22`, `B26:B30`, `B34:B40` are all cross-sheet references —
pure presentation, no logic. They become `GET /api/dashboard`.

**12-month trend, `A44:E55`:**

```excel
Income  = SUMIFS(MoneyIn, month) - SUMIFS(MoneyIn, Category="Internal Transfer", month)
Expense = SUMIFS(MoneyOut, month) - SUMIFS(MoneyOut, Category="Internal Transfer", month)
Net     = Income - Expense
NetWorth= SUMIFS(MoneyIn, Date<monthEnd) - SUMIFS(MoneyOut, Date<monthEnd)
```

"Total inflow minus internal inflow" is structurally identical to "sum of
non-internal IN legs", which is what `computeTrend` does — in one pass over the
entries rather than 48 SUMIFS.

The sheet's window was fixed at Jul 2026 – Jun 2027. The app takes the range as a
parameter (3 / 6 / 12 / 24 / all).

---

## 8. Weekly Reconciliation

Headers only, no rows yet: `Week Of | Ledger Balance | Bank App Balance | Match? | Notes`.

The app keeps the concept and removes the manual step. **Ledger Balance is
computed**, never typed: it is the account's balance as of the end of that week.
Storing it would let it go stale the moment an earlier transaction is edited.

Only `actualBalanceMinor` is stored. `difference` and `status` are derived, and
`weekOf` is normalised to the start of the week so two entries for one week
collide on the unique index instead of duplicating.

Added: an `accountId` column. The sheet had one row per week with no way to say
*which* account, which makes reconciliation impossible across six accounts.

---

## 9. The seed data, and one honest discrepancy

`General Ledger!A6:H9`:

| Date | Description | Category | Account | Type | In | Out |
|---|---|---|---|---|---|---|
| 2026-09-10 | Borrow from uncle, to buy uniform | Allowance | Physical Wallet | **Transfer** | 2,000 | |
| 2026-09-11 | Class Uniform | Miscellaneous | Physical Wallet | Expense | | 1,000 |
| 2026-09-12 | Pe Uniform | Miscellaneous | Physical Wallet | Expense | | 600 |
| 2026-09-14 | Foods, Snacks | Food | Physical Wallet | Expense | | 100 |

Row 6 is typed `Transfer` but categorised `Allowance`. Because the Income
Statement keys off **category**, the sheet counts it as ₱2,000 of Allowance
income — which is exactly how it reaches Total Income ₱2,000.

**Resolution:** the app models it as `INCOME / Allowance`. Money arriving from
your uncle has one endpoint you own; a transfer requires two. Modelling it as a
transfer would have produced Total Income ₱0 and broken every figure in §33 of
the brief. This is the one row where the sheet's Type column and its own
arithmetic disagree, and the arithmetic wins.

### Verified parity (September 2026)

Asserted by `server/tests/engine.test.ts` and again by `npm run db:seed`:

| Figure | Workbook | App |
|---|---|---|
| Total Income | ₱2,000 | ₱2,000 |
| Total Expenses | ₱1,700 | ₱1,700 |
| Net Income | ₱300 | ₱300 |
| Food / Miscellaneous | ₱100 / ₱1,600 | ₱100 / ₱1,600 |
| Physical Wallet | ₱300 | ₱300 |
| Total Cash | ₱300 | ₱300 |
| Net Worth | ₱300 | ₱300 |
| Balance sheet reconciles | ✓ | ✓ |

---

## 10. The modelling gap this rebuild closes

A spreadsheet transfer writes **one** row: money into GoTyme, nothing out of
MariBank. Total cash silently inflates.

The Income Statement dodged this via the "Internal Transfer" category exclusion.
The Balance Sheet did not — it sums Money In minus Money Out per account, so a
one-legged transfer permanently overstates net worth by the transferred amount.

Fixed at the data model. One transaction explodes into `LedgerEntry` rows; a
transfer always produces two that cancel:

```
MariBank  −₱2,000   (TRANSFER_OUT, isInternal)
GoTyme    +₱2,000   (TRANSFER_IN,  isInternal)
           ───────
net effect on total cash: ₱0
```

"Transfers don't change total cash" is therefore a mathematical property of the
schema, not a rule someone has to remember to apply. `checkIntegrity` asserts
`sum(internal legs of a transaction) === 0` on every dashboard load, and the test
suite asserts it too.

An optional transfer **fee** is a third leg, `isInternal = false`, categorised
`Transfer Fees` — because a fee is real money leaving your control. That is why
the workbook kept Transfer Fees as an expense category rather than folding it
into the transfer, and the app keeps that distinction.
