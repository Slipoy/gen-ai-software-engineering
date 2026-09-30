import { ValidationError } from '../errors.js';

const TRUE_VALUES = new Set(['true', '1', 'yes']);
const FALSE_VALUES = new Set(['false', '0', 'no']);

/**
 * Reads an on/off switch from the query string, e.g. `?auto_classify=true`.
 * Missing means false; anything that is not clearly true or false is rejected, so a typo
 * such as `?auto_classify=ture` is reported instead of silently doing nothing.
 */
export function readBooleanFlag(query: Record<string, unknown>, name: string): boolean {
  const raw = query[name];
  if (raw === undefined) return false;
  // A repeated parameter (`?force=1&force=0`) arrives as an array: ambiguous, so it is rejected.
  if (typeof raw === 'string') {
    const value = raw.trim().toLowerCase();
    if (TRUE_VALUES.has(value) || value === '') return true; // `?force` alone means "on"
    if (FALSE_VALUES.has(value)) return false;
  }
  throw new ValidationError([{ field: name, message: `${name} must be true or false` }]);
}
