import type { Transaction } from '../models/transaction.js';

const COLUMNS = [
  'id',
  'fromAccount',
  'toAccount',
  'amount',
  'currency',
  'type',
  'timestamp',
  'status',
  'failureReason',
] as const satisfies readonly (keyof Transaction)[];

/** Quotes a value per RFC 4180 when it contains a comma, quote or line break. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function transactionsToCsv(transactions: Transaction[]): string {
  const header = COLUMNS.join(',');
  const rows = transactions.map((tx) => COLUMNS.map((column) => escapeCell(tx[column])).join(','));
  return [header, ...rows].join('\r\n') + '\r\n';
}
