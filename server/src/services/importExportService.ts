/**
 * Import and export.
 *
 * The importer is built to swallow the workbook's own General Ledger export
 * without the user thinking about it: it recognises the header row
 * `Date | Description | Category | Account | Type | Money In | Money Out` and
 * maps it automatically, including the Money In / Money Out pair that section 7
 * of the brief says must not be the storage model but obviously still exists in
 * every CSV the user already has.
 *
 * Two rules:
 *  - Nothing is written until the user has seen a preview.
 *  - Every row carries a fingerprint, so importing the same file twice is a no-op
 *    rather than a doubled net worth.
 */
import ExcelJS from 'exceljs';
import type { ImportPreview, ImportPreviewRow, ImportResult } from '@pfos/shared';
import { prisma } from '../lib/prisma.js';
import { createTransaction, fingerprint } from './transactionService.js';
import { loadEntries } from '../repositories/ledgerRepository.js';
import { toDateString } from '../lib/date.js';

/* ------------------------------------------------------------ CSV parse --- */

/** Minimal RFC-4180 parser: handles quoted fields, embedded commas and quotes. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') { inQuotes = true; continue; }
    if (char === delimiter) { row.push(field); field = ''; continue; }
    if (char === '\r') continue;
    if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += char;
  }

  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Header aliases, ordered so the workbook's own names win. */
const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'transaction date', 'posted date'],
  description: ['description', 'details', 'memo', 'particulars', 'narration'],
  category: ['category', 'categories'],
  account: ['account', 'account name', 'wallet'],
  type: ['type', 'transaction type'],
  moneyIn: ['money in', 'credit', 'inflow', 'deposit', 'in'],
  moneyOut: ['money out', 'debit', 'outflow', 'withdrawal', 'out'],
  amount: ['amount', 'value', 'total'],
  notes: ['notes', 'note', 'remarks'],
};

export function suggestMapping(header: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const normalised = header.map((h) => h.trim().toLowerCase());

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalised.findIndex((h) => aliases.includes(h));
    if (index >= 0) mapping[field] = index;
  }
  return mapping;
}

/* --------------------------------------------------------------- preview --- */

export async function previewImport(
  userId: string,
  csv: string,
  delimiter = ',',
  hasHeader = true,
): Promise<ImportPreview> {
  const rows = parseCsv(csv, delimiter);
  const header = hasHeader ? (rows[0] ?? []) : [];
  const body = hasHeader ? rows.slice(1) : rows;
  const mapping = suggestMapping(header);

  const [accounts, categories, existing] = await Promise.all([
    prisma.account.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true, kind: true } }),
    prisma.transaction.findMany({
      where: { userId, importFingerprint: { not: null } },
      select: { importFingerprint: true },
    }),
  ]);

  const seen = new Set(existing.map((t) => t.importFingerprint));
  const accountByName = nameMap(accounts);

  const preview: ImportPreviewRow[] = body.slice(0, 500).map((raw, index) => {
    const parsed = parseRow(raw, mapping);
    const issues: string[] = [];

    if (!parsed.date) issues.push('Could not read the date');
    if (!parsed.description) issues.push('Missing description');
    if (parsed.amountMinor == null || parsed.amountMinor <= 0) issues.push('Missing or zero amount');
    if (parsed.accountName && !accountByName.has(parsed.accountName.toLowerCase())) {
      issues.push(`Unknown account "${parsed.accountName}"`);
    }
    if (parsed.categoryName && !categories.some((c) => equalName(c.name, parsed.categoryName!))) {
      issues.push(`Unknown category "${parsed.categoryName}"`);
    }

    const accountId = parsed.accountName
      ? accountByName.get(parsed.accountName.toLowerCase())
      : undefined;

    const isDuplicate =
      parsed.date && parsed.amountMinor != null && parsed.description
        ? seen.has(
            fingerprint({
              date: parsed.date,
              amountMinor: parsed.amountMinor,
              description: parsed.description,
              accountId,
            }),
          )
        : false;

    return { rowNumber: index + (hasHeader ? 2 : 1), raw, parsed, issues, isDuplicate };
  });

  return {
    columns: header,
    rows: preview,
    totalRows: body.length,
    validRows: preview.filter((r) => r.issues.length === 0 && !r.isDuplicate).length,
    duplicateRows: preview.filter((r) => r.isDuplicate).length,
    suggestedMapping: mapping,
  };
}

function parseRow(raw: string[], mapping: Record<string, number>): ImportPreviewRow['parsed'] {
  const at = (field: string): string | null => {
    const index = mapping[field];
    if (index == null) return null;
    const value = raw[index]?.trim();
    return value ? value : null;
  };

  const moneyIn = toMinorOrNull(at('moneyIn'));
  const moneyOut = toMinorOrNull(at('moneyOut'));
  const plainAmount = toMinorOrNull(at('amount'));
  const rawType = at('type')?.toUpperCase() ?? null;

  // Money In / Money Out is the workbook's shape: whichever column has a value
  // decides the direction. A signed single Amount column works too.
  let amountMinor: number | null = null;
  let type: ImportPreviewRow['parsed']['type'] = null;

  if (moneyIn && moneyIn > 0) { amountMinor = moneyIn; type = 'INCOME'; }
  else if (moneyOut && moneyOut > 0) { amountMinor = moneyOut; type = 'EXPENSE'; }
  else if (plainAmount != null) {
    amountMinor = Math.abs(plainAmount);
    type = plainAmount < 0 ? 'EXPENSE' : 'INCOME';
  }

  // An explicit Type column overrides the inferred direction, except that
  // "Transfer" needs a second account the CSV does not carry, so those rows are
  // surfaced for the user to resolve rather than guessed at.
  if (rawType === 'INCOME' || rawType === 'EXPENSE' || rawType === 'TRANSFER') {
    type = rawType;
  }

  return {
    date: normaliseDate(at('date')),
    description: at('description'),
    amountMinor,
    type,
    categoryName: at('category'),
    accountName: at('account'),
  };
}

function toMinorOrNull(value: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY and anything Date can parse. */
function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (slash) {
    const [, a, b, year] = slash;
    // Day-first when the first number cannot be a month.
    const [day, month] = Number(a) > 12 ? [a, b] : [b, a];
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------- commit --- */

export async function commitImport(
  userId: string,
  input: {
    csv: string;
    delimiter: string;
    hasHeader: boolean;
    mapping: Record<string, number>;
    defaultAccountId?: string;
    skipDuplicates: boolean;
  },
): Promise<ImportResult> {
  const rows = parseCsv(input.csv, input.delimiter);
  const body = input.hasHeader ? rows.slice(1) : rows;

  const [accounts, categories, existing] = await Promise.all([
    prisma.account.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true, kind: true } }),
    prisma.transaction.findMany({
      where: { userId, importFingerprint: { not: null } },
      select: { importFingerprint: true },
    }),
  ]);

  const accountByName = nameMap(accounts);
  const seen = new Set(existing.map((t) => t.importFingerprint));

  const result: ImportResult = { imported: 0, skipped: 0, failed: [] };

  for (const [index, raw] of body.entries()) {
    const rowNumber = index + (input.hasHeader ? 2 : 1);
    const parsed = parseRow(raw, input.mapping);

    try {
      if (!parsed.date || !parsed.description || !parsed.amountMinor) {
        result.failed.push({ rowNumber, reason: 'Missing date, description or amount' });
        continue;
      }
      if (parsed.type === 'TRANSFER') {
        result.failed.push({
          rowNumber,
          reason: 'Transfers need both accounts — add them by hand after importing',
        });
        continue;
      }

      const accountId = parsed.accountName
        ? accountByName.get(parsed.accountName.toLowerCase())
        : input.defaultAccountId;

      if (!accountId) {
        result.failed.push({ rowNumber, reason: `No account matched "${parsed.accountName ?? ''}"` });
        continue;
      }

      const print = fingerprint({
        date: parsed.date,
        amountMinor: parsed.amountMinor,
        description: parsed.description,
        accountId,
      });

      if (input.skipDuplicates && seen.has(print)) { result.skipped += 1; continue; }

      const type = parsed.type ?? 'EXPENSE';
      const wanted = type === 'INCOME' ? 'INCOME' : 'EXPENSE';
      const category =
        categories.find((c) => parsed.categoryName && equalName(c.name, parsed.categoryName) && c.kind === wanted) ??
        categories.find((c) => c.kind === wanted && c.name === 'Miscellaneous') ??
        categories.find((c) => c.kind === wanted);

      if (!category) {
        result.failed.push({ rowNumber, reason: `No ${wanted.toLowerCase()} category available` });
        continue;
      }

      await createTransaction(userId, {
        type,
        date: parsed.date,
        description: parsed.description,
        amountMinor: parsed.amountMinor,
        accountId,
        categoryId: category.id,
        importFingerprint: print,
      });

      seen.add(print);
      result.imported += 1;
    } catch (error) {
      result.failed.push({ rowNumber, reason: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  return result;
}

/* ---------------------------------------------------------------- export --- */

export async function exportTransactionsCsv(userId: string, from?: string, to?: string): Promise<string> {
  const rows = await fetchExportRows(userId, from, to);
  const header = ['Date', 'Description', 'Category', 'Account', 'Type', 'Money In', 'Money Out'];

  const lines = rows.map((row) =>
    [
      row.date,
      row.description,
      row.categoryName ?? '',
      row.accountName,
      row.transactionType,
      row.direction === 'IN' ? (row.amountMinor / 100).toFixed(2) : '',
      row.direction === 'OUT' ? (row.amountMinor / 100).toFixed(2) : '',
    ]
      .map(csvCell)
      .join(','),
  );

  return [header.join(','), ...lines].join('\n');
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** XLSX export shaped like the original General Ledger, so the file feels familiar. */
export async function exportTransactionsXlsx(
  userId: string,
  from?: string,
  to?: string,
): Promise<Buffer> {
  const rows = await fetchExportRows(userId, from, to);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Personal Finance OS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('General Ledger');
  sheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Description', key: 'description', width: 36 },
    { header: 'Category', key: 'category', width: 24 },
    { header: 'Account', key: 'account', width: 24 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Money In', key: 'moneyIn', width: 14 },
    { header: 'Money Out', key: 'moneyOut', width: 14 },
  ];
  sheet.getRow(1).font = { name: 'Arial', bold: true };

  for (const row of rows) {
    sheet.addRow({
      date: row.date,
      description: row.description,
      category: row.categoryName ?? '',
      account: row.accountName,
      type: row.transactionType,
      moneyIn: row.direction === 'IN' ? row.amountMinor / 100 : null,
      moneyOut: row.direction === 'OUT' ? row.amountMinor / 100 : null,
    });
  }

  sheet.getColumn('moneyIn').numFmt = '#,##0.00;(#,##0.00);-';
  sheet.getColumn('moneyOut').numFmt = '#,##0.00;(#,##0.00);-';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

async function fetchExportRows(userId: string, from?: string, to?: string) {
  const entries = await loadEntries(userId, {
    from,
    to: to ?? toDateString(new Date()),
  });
  return entries;
}

/* ---------------------------------------------------------------- utils --- */

function nameMap(rows: { id: string; name: string }[]): Map<string, string> {
  return new Map(rows.map((row) => [row.name.toLowerCase(), row.id]));
}

function equalName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
