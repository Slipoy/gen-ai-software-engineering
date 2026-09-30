import type { FieldError } from '../errors.js';
import {
  CATEGORIES,
  DEVICE_TYPES,
  LIMITS,
  PRIORITIES,
  SOURCES,
  STATUSES,
  TICKET_DEFAULTS,
  type NewTicketInput,
  type TicketMetadata,
  type TicketUpdate,
} from '../models/ticket.js';

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: FieldError[] };

/**
 * Validation is written as small "parsers": each takes an unknown value and either returns a clean,
 * typed value or records an error and returns INVALID. Checking every field before giving up
 * lets the client see all problems in a single response.
 */
const INVALID = Symbol('invalid');
type Parsed<T> = T | typeof INVALID;
type Parser<T> = (value: unknown, field: string, errors: FieldError[]) => Parsed<T>;

// A pragmatic check (something@something.tld, no spaces). Full RFC 5322 validation is famously
// complex and rejects almost nothing extra in practice; real ownership is proven by sending mail.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const SERVER_OWNED_FIELDS = new Set(['id', 'created_at', 'updated_at', 'resolved_at']);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function lengthMessage(field: string, { min, max }: { min?: number; max: number }) {
  if (min === undefined) return `${field} must be at most ${max} characters`;
  if (min === 1) return `${field} must not be empty and must be at most ${max} characters`;
  return `${field} must be between ${min} and ${max} characters`;
}

/** Trimmed string within the given length limits. */
function text(limits: { min?: number; max: number }): Parser<string> {
  return (value, field, errors) => {
    if (typeof value !== 'string') {
      errors.push({ field, message: `${field} must be a string` });
      return INVALID;
    }
    const trimmed = value.trim();
    if (trimmed.length < (limits.min ?? 0) || trimmed.length > limits.max) {
      errors.push({ field, message: lengthMessage(field, limits) });
      return INVALID;
    }
    return trimmed;
  };
}

/** Like `text`, but `null` (or an empty string) means "no value". */
function nullableText(limits: { min?: number; max: number }): Parser<string | null> {
  const parse = text(limits);
  return (value, field, errors) => {
    if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
    return parse(value, field, errors);
  };
}

function oneOf<const T extends readonly string[]>(allowed: T): Parser<T[number]> {
  return (value, field, errors) => {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
      return value as T[number];
    }
    errors.push({ field, message: `${field} must be one of: ${allowed.join(', ')}` });
    return INVALID;
  };
}

function nullableOneOf<const T extends readonly string[]>(allowed: T): Parser<T[number] | null> {
  const parse = oneOf(allowed);
  return (value, field, errors) => (value === null || value === '' ? null : parse(value, field, errors));
}

const email: Parser<string> = (value, field, errors) => {
  const parsed = text({ min: 1, max: LIMITS.customer_email.max })(value, field, errors);
  if (parsed === INVALID) return INVALID;
  if (!EMAIL_PATTERN.test(parsed)) {
    errors.push({ field, message: `${field} must be a valid email address` });
    return INVALID;
  }
  // The domain part is case-insensitive and nearly all providers ignore case in the local part too.
  return parsed.toLowerCase();
};

/** Tags are trimmed, lowercased and de-duplicated so "Billing" and "billing " are the same tag. */
const tags: Parser<string[]> = (value, field, errors) => {
  if (!Array.isArray(value)) {
    errors.push({ field, message: `${field} must be an array of strings` });
    return INVALID;
  }
  const result = new Set<string>();
  let valid = true;
  value.forEach((tag, index) => {
    const parsed = text(LIMITS.tag)(tag, `${field}[${index}]`, errors);
    if (parsed === INVALID) valid = false;
    else result.add(parsed.toLowerCase());
  });
  if (result.size > LIMITS.tags.max) {
    errors.push({ field, message: `${field} must contain at most ${LIMITS.tags.max} tags` });
    return INVALID;
  }
  return valid ? [...result] : INVALID;
};

const METADATA_PARSERS = {
  source: oneOf(SOURCES),
  browser: nullableText(LIMITS.browser),
  device_type: nullableOneOf(DEVICE_TYPES),
} satisfies { [K in keyof TicketMetadata]: Parser<TicketMetadata[K]> };

/** Parses the fields of `metadata` that are present; unknown keys are reported. */
function metadata(value: unknown, field: string, errors: FieldError[]): Parsed<Partial<TicketMetadata>> {
  if (!isObject(value)) {
    errors.push({ field, message: `${field} must be an object` });
    return INVALID;
  }
  const result: Partial<TicketMetadata> = {};
  let valid = true;
  for (const [key, raw] of Object.entries(value)) {
    const parser = METADATA_PARSERS[key as keyof TicketMetadata];
    if (!parser) {
      errors.push({ field: `${field}.${key}`, message: `Unknown field ${field}.${key}` });
      valid = false;
      continue;
    }
    const parsed = parser(raw, `${field}.${key}`, errors);
    if (parsed === INVALID) valid = false;
    else (result as Record<string, unknown>)[key] = parsed;
  }
  return valid ? result : INVALID;
}

type EditableField = Exclude<keyof NewTicketInput, 'metadata'>;

const FIELD_PARSERS = {
  customer_id: text(LIMITS.customer_id),
  customer_email: email,
  customer_name: text(LIMITS.customer_name),
  subject: text(LIMITS.subject),
  description: text(LIMITS.description),
  category: oneOf(CATEGORIES),
  priority: oneOf(PRIORITIES),
  status: oneOf(STATUSES),
  assigned_to: nullableText(LIMITS.assigned_to),
  tags,
} satisfies { [K in EditableField]: Parser<NewTicketInput[K]> };

const REQUIRED_ON_CREATE: readonly string[] = ['customer_id', 'customer_email', 'customer_name', 'subject', 'description'];

/** Drops required fields that are `null`: they already got a dedicated error, so skip the generic one. */
const withoutNullRequired = (body: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(body).filter(([key, value]) => !(value === null && REQUIRED_ON_CREATE.includes(key))));

/**
 * Runs the parser of every key present in `body`, rejecting unknown and server-owned keys.
 * Shared by create and update, which differ only in required fields and defaults.
 */
function parseFields(body: Record<string, unknown>, errors: FieldError[]): TicketUpdate {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;

    if (SERVER_OWNED_FIELDS.has(key)) {
      errors.push({ field: key, message: `${key} is set by the server and cannot be provided` });
      continue;
    }
    if (key === 'metadata') {
      const parsed = metadata(value, key, errors);
      if (parsed !== INVALID) result.metadata = parsed;
      continue;
    }

    const parser = FIELD_PARSERS[key as EditableField] as Parser<unknown> | undefined;
    if (!parser) {
      errors.push({ field: key, message: `Unknown field ${key}` });
      continue;
    }
    // `null` is only meaningful for nullable fields; the nullable parsers accept it, the others reject it.
    const parsed = parser(value, key, errors);
    if (parsed !== INVALID) result[key] = parsed;
  }

  return result as TicketUpdate;
}

/** Validates the body of `POST /tickets` (and each imported record) and applies defaults. */
export function validateNewTicket(body: unknown): ValidationResult<NewTicketInput> {
  if (!isObject(body)) {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const errors: FieldError[] = [];
  for (const field of REQUIRED_ON_CREATE) {
    if (body[field] === undefined || body[field] === null) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  const parsed = parseFields(withoutNullRequired(body), errors);
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      customer_id: parsed.customer_id!,
      customer_email: parsed.customer_email!,
      customer_name: parsed.customer_name!,
      subject: parsed.subject!,
      description: parsed.description!,
      category: parsed.category ?? TICKET_DEFAULTS.category,
      priority: parsed.priority ?? TICKET_DEFAULTS.priority,
      status: parsed.status ?? TICKET_DEFAULTS.status,
      assigned_to: parsed.assigned_to ?? null,
      tags: parsed.tags ?? [],
      metadata: {
        source: parsed.metadata?.source ?? TICKET_DEFAULTS.source,
        browser: parsed.metadata?.browser ?? null,
        device_type: parsed.metadata?.device_type ?? null,
      },
    },
  };
}

/** Validates the body of `PUT /tickets/:id`: any subset of fields, but at least one. */
export function validateTicketUpdate(body: unknown): ValidationResult<TicketUpdate> {
  if (!isObject(body)) {
    return { ok: false, errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const errors: FieldError[] = [];
  for (const field of REQUIRED_ON_CREATE) {
    if (body[field] === null) errors.push({ field, message: `${field} cannot be null` });
  }

  const parsed = parseFields(withoutNullRequired(body), errors);
  if (errors.length > 0) return { ok: false, errors };
  if (Object.keys(parsed).length === 0) {
    return { ok: false, errors: [{ field: 'body', message: 'Provide at least one field to update' }] };
  }
  return { ok: true, value: parsed };
}
