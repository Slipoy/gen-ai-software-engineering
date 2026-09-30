import type { FieldError } from '../errors.js';
import { CATEGORIES, PRIORITIES, STATUSES } from '../models/ticket.js';
import type { TicketFilters } from '../repositories/ticketRepository.js';
import type { ValidationResult } from './ticketValidator.js';

const LIST_FILTERS = { category: CATEGORIES, priority: PRIORITIES, status: STATUSES } as const;
const TEXT_FILTERS = ['assigned_to', 'customer_email', 'search'] as const;
const MAX_TEXT_FILTER_LENGTH = 200;

/**
 * Validates the query string of `GET /tickets`.
 * Enum filters accept one value or a comma-separated list: `?priority=urgent,high`.
 * Unknown query parameters are ignored, as is usual for query strings.
 */
export function validateTicketFilters(query: Record<string, unknown>): ValidationResult<TicketFilters> {
  const errors: FieldError[] = [];
  const filters: TicketFilters = {};

  for (const [field, allowed] of Object.entries(LIST_FILTERS)) {
    const raw = query[field];
    if (raw === undefined) continue;
    if (typeof raw !== 'string') {
      errors.push({ field, message: `${field} must be given once, as a comma-separated list` });
      continue;
    }
    const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
    const invalid = values.filter((value) => !(allowed as readonly string[]).includes(value));
    if (values.length === 0 || invalid.length > 0) {
      errors.push({ field, message: `${field} must be one or more of: ${allowed.join(', ')}` });
      continue;
    }
    (filters as Record<string, string[]>)[field] = [...new Set(values)];
  }

  for (const field of TEXT_FILTERS) {
    const raw = query[field];
    if (raw === undefined) continue;
    if (typeof raw !== 'string' || raw.trim() === '' || raw.length > MAX_TEXT_FILTER_LENGTH) {
      errors.push({ field, message: `${field} must be a non-empty string of at most ${MAX_TEXT_FILTER_LENGTH} characters` });
      continue;
    }
    filters[field] = field === 'customer_email' ? raw.trim().toLowerCase() : raw.trim();
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: filters };
}
