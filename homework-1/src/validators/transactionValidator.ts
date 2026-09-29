import {
  TRANSACTION_TYPES,
  type NewTransactionInput,
  type TransactionType,
} from '../models/transaction.js';
import { hasAtMostTwoDecimals } from '../utils/money.js';

export interface FieldError {
  field: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

export const ACCOUNT_ID_PATTERN = /^ACC-[A-Za-z0-9]{5}$/;

// ISO 4217 codes known to the JS runtime (ICU data), e.g. USD, EUR, GBP, JPY.
const ISO_4217_CODES = new Set(Intl.supportedValuesOf('currency'));

export function isValidAccountId(value: unknown): value is string {
  return typeof value === 'string' && ACCOUNT_ID_PATTERN.test(value);
}

export function isValidCurrency(value: unknown): value is string {
  return typeof value === 'string' && ISO_4217_CODES.has(value);
}

function isTransactionType(value: unknown): value is TransactionType {
  return typeof value === 'string' && (TRANSACTION_TYPES as readonly string[]).includes(value);
}

const isPresent = (value: unknown) => value !== undefined && value !== null && value !== '';

/**
 * Validates the body of `POST /transactions` and collects every problem at once,
 * so the client can fix all fields in a single round trip.
 *
 * Which accounts are required depends on the type:
 * - deposit:    toAccount only (money comes from outside the bank)
 * - withdrawal: fromAccount only (money leaves the bank)
 * - transfer:   both, and they must differ
 */
export function validateNewTransaction(body: unknown): ValidationResult<NewTransactionInput> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const input = body as Record<string, unknown>;
  const errors: FieldError[] = [];

  const { amount, currency, type, fromAccount, toAccount } = input;

  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    errors.push({ field: 'amount', message: 'Amount must be a positive number' });
  } else if (!hasAtMostTwoDecimals(amount)) {
    errors.push({ field: 'amount', message: 'Amount must have at most 2 decimal places' });
  }

  if (!isValidCurrency(currency)) {
    errors.push({
      field: 'currency',
      message: 'Invalid currency code (expected an uppercase ISO 4217 code, e.g. USD, EUR, GBP)',
    });
  }

  if (!isTransactionType(type)) {
    errors.push({ field: 'type', message: `Type must be one of: ${TRANSACTION_TYPES.join(', ')}` });
  }

  for (const [field, value] of [
    ['fromAccount', fromAccount],
    ['toAccount', toAccount],
  ] as const) {
    if (isPresent(value) && !isValidAccountId(value)) {
      errors.push({
        field,
        message: 'Account number must follow the format ACC-XXXXX (X is alphanumeric)',
      });
    }
  }

  if (isTransactionType(type)) {
    const needsFrom = type === 'withdrawal' || type === 'transfer';
    const needsTo = type === 'deposit' || type === 'transfer';

    if (needsFrom && !isPresent(fromAccount)) {
      errors.push({ field: 'fromAccount', message: `fromAccount is required for a ${type}` });
    }
    if (!needsFrom && isPresent(fromAccount)) {
      errors.push({ field: 'fromAccount', message: `fromAccount must not be set for a ${type}` });
    }
    if (needsTo && !isPresent(toAccount)) {
      errors.push({ field: 'toAccount', message: `toAccount is required for a ${type}` });
    }
    if (!needsTo && isPresent(toAccount)) {
      errors.push({ field: 'toAccount', message: `toAccount must not be set for a ${type}` });
    }
    if (type === 'transfer' && isPresent(fromAccount) && fromAccount === toAccount) {
      errors.push({ field: 'toAccount', message: 'Cannot transfer to the same account' });
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      amount: amount as number,
      currency: currency as string,
      type: type as TransactionType,
      ...(isPresent(fromAccount) && { fromAccount: fromAccount as string }),
      ...(isPresent(toAccount) && { toAccount: toAccount as string }),
    },
  };
}

export interface TransactionFilters {
  accountId?: string;
  type?: TransactionType;
  from?: Date;
  to?: Date;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: string, endOfDay: boolean): Date | null {
  if (DATE_ONLY_PATTERN.test(value)) {
    // A date without a time covers the whole day: `from` starts at 00:00, `to` ends at 23:59:59.999 (UTC).
    const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
    return Number.isNaN(date.getTime()) || !date.toISOString().startsWith(value) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Validates the query string of `GET /transactions`. Unknown parameters are ignored. */
export function validateTransactionFilters(
  query: Record<string, unknown>,
): ValidationResult<TransactionFilters> {
  const errors: FieldError[] = [];
  const filters: TransactionFilters = {};

  for (const key of ['accountId', 'type', 'from', 'to'] as const) {
    if (query[key] !== undefined && typeof query[key] !== 'string') {
      errors.push({ field: key, message: `${key} must be provided at most once` });
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const { accountId, type, from, to } = query as Record<string, string | undefined>;

  if (accountId !== undefined) {
    if (isValidAccountId(accountId)) filters.accountId = accountId;
    else errors.push({ field: 'accountId', message: 'accountId must follow the format ACC-XXXXX' });
  }

  if (type !== undefined) {
    if (isTransactionType(type)) filters.type = type;
    else errors.push({ field: 'type', message: `type must be one of: ${TRANSACTION_TYPES.join(', ')}` });
  }

  if (from !== undefined) {
    const date = parseDate(from, false);
    if (date) filters.from = date;
    else errors.push({ field: 'from', message: 'from must be a valid date (YYYY-MM-DD or ISO 8601)' });
  }

  if (to !== undefined) {
    const date = parseDate(to, true);
    if (date) filters.to = date;
    else errors.push({ field: 'to', message: 'to must be a valid date (YYYY-MM-DD or ISO 8601)' });
  }

  if (filters.from && filters.to && filters.from > filters.to) {
    errors.push({ field: 'from', message: 'from must be earlier than or equal to to' });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: filters };
}
