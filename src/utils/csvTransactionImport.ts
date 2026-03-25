/**
 * CSV import contract: header row required with columns (case-insensitive):
 * date, description, amount, type
 * - date: YYYY-MM-DD
 * - amount: positive number in dollars (optional thousands commas)
 * - type: income | expense
 */
import { parse } from 'csv-parse/sync';

export type ParsedCsvRow = {
  date: string;
  description: string;
  /** Positive dollar amount before cents conversion */
  amountDollars: number;
  type: 'income' | 'expense';
  /** 1-based physical line number in the file (header is line 1) */
  line: number;
};

export type CsvParseError = { line: number; message: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseCsvTransactionBuffer(buffer: Buffer): {
  rows: ParsedCsvRow[];
  errors: CsvParseError[];
} {
  const errors: CsvParseError[] = [];
  const rows: ParsedCsvRow[] = [];

  let grid: string[][];
  try {
    grid = parse(buffer.toString('utf8'), {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as string[][];
  } catch (e) {
    errors.push({ line: 1, message: e instanceof Error ? e.message : String(e) });
    return { rows: [], errors };
  }

  if (grid.length === 0) {
    errors.push({ line: 1, message: 'CSV is empty' });
    return { rows: [], errors };
  }

  const header = grid[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iDate = col('date');
  const iDesc = col('description');
  const iAmount = col('amount');
  const iType = col('type');

  if (iDate < 0 || iDesc < 0 || iAmount < 0 || iType < 0) {
    errors.push({
      line: 1,
      message: 'Header must include columns: date, description, amount, type',
    });
    return { rows: [], errors };
  }

  for (let i = 1; i < grid.length; i++) {
    const line = i + 1;
    const r = grid[i];
    const date = (r[iDate] ?? '').trim();
    const description = (r[iDesc] ?? '').trim();
    const amountRaw = (r[iAmount] ?? '').trim().replace(/,/g, '');
    const typeRaw = (r[iType] ?? '').trim().toLowerCase();

    if (!DATE_RE.test(date)) {
      errors.push({ line, message: `Invalid date "${date}" (use YYYY-MM-DD)` });
      continue;
    }
    if (!description) {
      errors.push({ line, message: 'description is required' });
      continue;
    }
    const amountNum = Number(amountRaw);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      errors.push({ line, message: `Invalid amount "${r[iAmount] ?? ''}" (positive number required)` });
      continue;
    }
    if (typeRaw !== 'income' && typeRaw !== 'expense') {
      errors.push({ line, message: `Invalid type "${typeRaw}" (use income or expense)` });
      continue;
    }

    rows.push({
      date,
      description,
      amountDollars: amountNum,
      type: typeRaw,
      line,
    });
  }

  return { rows, errors };
}
