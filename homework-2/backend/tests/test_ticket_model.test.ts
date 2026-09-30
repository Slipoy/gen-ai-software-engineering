import { describe, expect, it } from 'vitest';
import { validateNewTicket, validateTicketUpdate } from '../src/validators/ticketValidator.js';
import { validTicket } from './helpers.js';

/** Returns the error messages for one field, or fails the test if validation passed. */
function errorsFor(result: ReturnType<typeof validateNewTicket>, field: string) {
  if (result.ok) throw new Error('Expected validation to fail');
  return result.errors.filter((e) => e.field === field).map((e) => e.message);
}

describe('validateNewTicket', () => {
  it('accepts a minimal ticket and applies defaults', () => {
    const result = validateNewTicket(validTicket());

    expect(result).toEqual({
      ok: true,
      value: {
        ...validTicket(),
        category: 'other',
        priority: 'medium',
        status: 'new',
        assigned_to: null,
        tags: [],
        metadata: { source: 'api', browser: null, device_type: null },
      },
    });
  });

  it('accepts a fully populated ticket', () => {
    const result = validateNewTicket(
      validTicket({
        category: 'account_access',
        priority: 'urgent',
        status: 'in_progress',
        assigned_to: 'agent.smith',
        tags: ['login', 'password'],
        metadata: { source: 'web_form', browser: 'Chrome 128', device_type: 'desktop' },
      }),
    );

    expect(result.ok).toBe(true);
  });

  it('reports every missing required field at once', () => {
    const result = validateNewTicket({});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.field).sort()).toEqual(
        ['customer_email', 'customer_id', 'customer_name', 'description', 'subject'].sort(),
      );
      expect(result.errors.every((e) => e.message.endsWith('is required'))).toBe(true);
    }
  });

  it('treats null in a required field as missing (one error, not two)', () => {
    expect(errorsFor(validateNewTicket(validTicket({ subject: null })), 'subject')).toEqual(['subject is required']);
  });

  it.each(['plainaddress', 'missing-at.example.com', 'user@', 'user@domain', 'user name@example.com', 'a@b.c'])(
    'rejects invalid email %j',
    (value) => {
      expect(errorsFor(validateNewTicket(validTicket({ customer_email: value })), 'customer_email')).toEqual([
        'customer_email must be a valid email address',
      ]);
    },
  );

  it('normalizes email to lowercase and trims whitespace', () => {
    const result = validateNewTicket(validTicket({ customer_email: '  Jane.Doe@Example.COM ', subject: '  Hello  ' }));

    expect(result.ok && result.value.customer_email).toBe('jane.doe@example.com');
    expect(result.ok && result.value.subject).toBe('Hello');
  });

  it.each([
    ['subject', '', 'subject must not be empty and must be at most 200 characters'],
    ['subject', '   ', 'subject must not be empty and must be at most 200 characters'],
    ['subject', 'x'.repeat(201), 'subject must not be empty and must be at most 200 characters'],
    ['description', 'too short', 'description must be between 10 and 2000 characters'],
    ['description', 'x'.repeat(2001), 'description must be between 10 and 2000 characters'],
  ])('enforces length limits: %s = %j', (field, value, message) => {
    expect(errorsFor(validateNewTicket(validTicket({ [field]: value })), field)).toEqual([message]);
  });

  it('accepts values exactly at the length limits', () => {
    expect(validateNewTicket(validTicket({ subject: 'x', description: 'x'.repeat(10) })).ok).toBe(true);
    expect(validateNewTicket(validTicket({ subject: 'x'.repeat(200), description: 'x'.repeat(2000) })).ok).toBe(true);
  });

  it.each([
    ['category', 'billing'],
    ['priority', 'critical'],
    ['status', 'open'],
  ])('rejects %s outside the enum', (field, value) => {
    const [message] = errorsFor(validateNewTicket(validTicket({ [field]: value })), field);
    expect(message).toMatch(new RegExp(`^${field} must be one of: `));
  });

  it('validates nested metadata and reports errors with dotted paths', () => {
    const result = validateNewTicket(
      validTicket({ metadata: { source: 'fax', device_type: 'watch', browser: 'x'.repeat(101), os: 'macOS' } }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.field).sort()).toEqual(
        ['metadata.browser', 'metadata.device_type', 'metadata.os', 'metadata.source'].sort(),
      );
    }
    expect(errorsFor(validateNewTicket(validTicket({ metadata: 'web' })), 'metadata')).toEqual([
      'metadata must be an object',
    ]);
  });

  it('normalizes tags and rejects invalid ones', () => {
    const ok = validateNewTicket(validTicket({ tags: ['Billing', ' billing ', 'VIP'] }));
    expect(ok.ok && ok.value.tags).toEqual(['billing', 'vip']);

    expect(errorsFor(validateNewTicket(validTicket({ tags: 'billing' })), 'tags')).toEqual([
      'tags must be an array of strings',
    ]);
    expect(errorsFor(validateNewTicket(validTicket({ tags: ['ok', 42] })), 'tags[1]')).toEqual([
      'tags[1] must be a string',
    ]);
    const tooMany = Array.from({ length: 21 }, (_, i) => `tag${i}`);
    expect(errorsFor(validateNewTicket(validTicket({ tags: tooMany })), 'tags')).toEqual([
      'tags must contain at most 20 tags',
    ]);
  });

  it('rejects unknown fields and server-owned fields', () => {
    const result = validateNewTicket(validTicket({ id: 'abc', created_at: '2024-01-01', priorty: 'high' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          { field: 'id', message: 'id is set by the server and cannot be provided' },
          { field: 'created_at', message: 'created_at is set by the server and cannot be provided' },
          { field: 'priorty', message: 'Unknown field priorty' },
        ]),
      );
    }
  });

  it.each([null, [], 'text', 42])('rejects a non-object body %j', (body) => {
    expect(validateNewTicket(body)).toEqual({
      ok: false,
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    });
  });

  it('rejects wrong types for string fields', () => {
    expect(errorsFor(validateNewTicket(validTicket({ customer_name: 42 })), 'customer_name')).toEqual([
      'customer_name must be a string',
    ]);
  });

  it('treats null or empty assigned_to and browser as "not set"', () => {
    const result = validateNewTicket(validTicket({ assigned_to: '', metadata: { browser: null } }));
    expect(result.ok && result.value.assigned_to).toBeNull();
    expect(result.ok && result.value.metadata.browser).toBeNull();
  });
});

describe('validateTicketUpdate', () => {
  it('accepts a partial update with only the given fields', () => {
    expect(validateTicketUpdate({ status: 'resolved', assigned_to: 'agent.smith' })).toEqual({
      ok: true,
      value: { status: 'resolved', assigned_to: 'agent.smith' },
    });
  });

  it('allows clearing a nullable field with null', () => {
    expect(validateTicketUpdate({ assigned_to: null })).toEqual({ ok: true, value: { assigned_to: null } });
  });

  it('refuses to null out a required field', () => {
    expect(validateTicketUpdate({ subject: null })).toEqual({
      ok: false,
      errors: [{ field: 'subject', message: 'subject cannot be null' }],
    });
  });

  it('requires at least one field', () => {
    expect(validateTicketUpdate({})).toEqual({
      ok: false,
      errors: [{ field: 'body', message: 'Provide at least one field to update' }],
    });
  });

  it('applies the same rules as create', () => {
    const result = validateTicketUpdate({ priority: 'asap', customer_email: 'nope', resolved_at: '2024-01-01' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field).sort()).toEqual(['customer_email', 'priority', 'resolved_at']);
  });

  it('rejects a non-object body', () => {
    expect(validateTicketUpdate('status=resolved').ok).toBe(false);
  });
});
