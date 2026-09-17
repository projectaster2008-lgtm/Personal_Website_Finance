/**
 * Automated internal checks (section 34 of the brief).
 *
 * The workbook had two visible cross-checks:
 *   Personal Balance Sheet!A20  "✓ Matches Statement of Changes in Net Worth"
 *   Cash Flow Statement!A19     "✓ Matches Net Income on the Income Statement"
 *
 * We keep both and add the ones a spreadsheet could not express: that every
 * transfer's legs cancel, that no entry is orphaned, and that a category's kind
 * agrees with the direction of the entries filed under it.
 *
 * Design rule: this module NEVER repairs anything. It reports. Silent repair is
 * how ledgers lose money — a flagged inconsistency is recoverable, a
 * quietly-corrected one is not.
 */
import { formatMoney } from '@pfos/shared';
import type {
  BalanceSheet,
  CashFlowStatement,
  IncomeStatement,
  IntegrityIssue,
  IntegrityReport,
} from '@pfos/shared';
import type { AccountView, LedgerEntryView } from '../ledger.js';
import { effectOf } from '../ledger.js';
import { computeAccountBalances } from './balances.js';

export interface IntegrityInput {
  entries: readonly LedgerEntryView[];
  accounts: readonly AccountView[];
  incomeStatement: IncomeStatement;
  cashFlow: CashFlowStatement;
  balanceSheet: BalanceSheet;
  currency: string;
  asOf: string;
}

export function checkIntegrity(input: IntegrityInput): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const fmt = (minor: number) => formatMoney(minor, { currency: input.currency });

  /* 1. Balance Sheet net worth vs Changes in Net Worth ---------------------- */
  if (!input.balanceSheet.reconciliation.matches) {
    issues.push({
      code: 'NET_WORTH_MISMATCH',
      severity: 'ERROR',
      message: `Balance sheet net worth (${fmt(
        input.balanceSheet.reconciliation.balanceSheetNetWorthMinor,
      )}) does not match the statement of changes in net worth (${fmt(
        input.balanceSheet.reconciliation.statementNetWorthMinor,
      )}).`,
      detail: { differenceMinor: input.balanceSheet.reconciliation.differenceMinor },
    });
  }

  /* 2. Cash flow net change vs net income ---------------------------------- */
  if (input.cashFlow.netChangeInCashMinor !== input.incomeStatement.netIncomeMinor) {
    issues.push({
      code: 'CASH_FLOW_MISMATCH',
      severity: 'ERROR',
      message:
        'Net change in cash does not equal net income for the period. An entry may be missing a matching leg.',
      detail: {
        netChangeInCashMinor: input.cashFlow.netChangeInCashMinor,
        netIncomeMinor: input.incomeStatement.netIncomeMinor,
      },
    });
  }

  /* 2b. Independently: closing cash - opening cash must equal net change ---- */
  const observedChange = input.cashFlow.closingCashMinor - input.cashFlow.openingCashMinor;
  if (observedChange !== input.cashFlow.netChangeInCashMinor) {
    issues.push({
      code: 'CASH_FLOW_MISMATCH',
      severity: 'ERROR',
      message: `Account balances moved by ${fmt(observedChange)} this period but the cash flow statement reports ${fmt(
        input.cashFlow.netChangeInCashMinor,
      )}.`,
      detail: { observedChange, reported: input.cashFlow.netChangeInCashMinor },
    });
  }

  /* 3. Every transfer must net to zero ------------------------------------- */
  const transferNet = new Map<string, number>();
  for (const entry of input.entries) {
    if (!entry.isInternal) continue;
    transferNet.set(entry.transactionId, (transferNet.get(entry.transactionId) ?? 0) + effectOf(entry));
  }
  for (const [transactionId, net] of transferNet) {
    if (net !== 0) {
      issues.push({
        code: 'UNBALANCED_TRANSFER',
        severity: 'ERROR',
        message: `A transfer is missing a leg: its entries net to ${fmt(net)} instead of zero.`,
        detail: { transactionId, netMinor: net },
      });
    }
  }

  /* 4. Orphaned entries ----------------------------------------------------- */
  const accountIds = new Set(input.accounts.map((a) => a.id));
  for (const entry of input.entries) {
    if (!accountIds.has(entry.accountId)) {
      issues.push({
        code: 'ORPHAN_ENTRY',
        severity: 'ERROR',
        message: `An entry points at an account that no longer exists (${entry.description}).`,
        detail: { entryId: entry.id, accountId: entry.accountId },
      });
    }
  }

  /* 5. Category kind vs entry direction ------------------------------------- */
  for (const entry of input.entries) {
    if (entry.isInternal || !entry.categoryKind) continue;
    const expected = entry.direction === 'IN' ? 'INCOME' : 'EXPENSE';
    if (entry.categoryKind !== expected) {
      issues.push({
        code: 'CATEGORY_KIND_MISMATCH',
        severity: 'WARNING',
        message: `"${entry.description}" is filed under a ${entry.categoryKind.toLowerCase()} category but moves money ${
          entry.direction === 'IN' ? 'in' : 'out'
        }.`,
        detail: { entryId: entry.id, categoryId: entry.categoryId },
      });
    }
  }

  /* 6. Negative balances ---------------------------------------------------- */
  for (const balance of computeAccountBalances(input.accounts, input.entries, input.asOf)) {
    if (balance.balanceMinor < 0) {
      issues.push({
        code: 'NEGATIVE_BALANCE',
        severity: 'WARNING',
        message: `${balance.name} is at ${fmt(
          balance.balanceMinor,
        )}. Either a transaction is missing, or an amount is wrong.`,
        detail: { accountId: balance.accountId, balanceMinor: balance.balanceMinor },
      });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    ok: issues.every((i) => i.severity !== 'ERROR'),
    issues,
  };
}
