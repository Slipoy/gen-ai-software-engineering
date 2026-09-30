import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, OPEN_STATUSES } from '../src/lib/labels';
import { formatAge, formatDateTime } from '../src/lib/time';
import {
  EMPTY_FORM,
  formFromTicket,
  parseTags,
  toNewTicket,
  toTicketUpdate,
  validateTicketForm,
  type TicketFormValues,
} from '../src/lib/validation';
import { makeTicket } from './utils';

const validForm = (overrides: Partial<TicketFormValues> = {}): TicketFormValues => ({
  ...EMPTY_FORM,
  customer_name: 'Jane Doe',
  customer_email: 'jane@example.com',
  customer_id: 'C-1',
  subject: 'Cannot log in',
  description: 'The login page rejects my new password.',
  ...overrides,
});

describe('validateTicketForm (mirrors the backend rules)', () => {
  it('accepts a valid form', () => {
    expect(validateTicketForm(validForm())).toEqual({});
  });

  it('reports every missing required field', () => {
    expect(Object.keys(validateTicketForm(EMPTY_FORM)).sort()).toEqual(
      ['customer_email', 'customer_id', 'customer_name', 'description', 'subject'].sort(),
    );
  });

  it.each([
    ['plain', 'Enter an email like name@example.com'],
    ['a@b', 'Enter an email like name@example.com'],
    ['a b@example.com', 'Enter an email like name@example.com'],
    [`${'x'.repeat(250)}@example.com`, 'Email must be at most 254 characters'],
  ])('rejects email %j', (email, message) => {
    expect(validateTicketForm(validForm({ customer_email: email })).customer_email).toBe(message);
  });

  it('enforces length limits and says the current length', () => {
    expect(validateTicketForm(validForm({ description: 'too short' })).description).toBe(
      'Description must be at least 10 characters (now 9)',
    );
    expect(validateTicketForm(validForm({ subject: 'x'.repeat(201) })).subject).toBe(
      'Subject must be at most 200 characters (now 201)',
    );
    expect(validateTicketForm(validForm({ browser: 'x'.repeat(101) })).browser).toMatch(/at most 100/);
  });

  it('limits the number and length of tags', () => {
    const many = Array.from({ length: 21 }, (_, i) => `t${i}`).join(', ');
    expect(validateTicketForm(validForm({ tags: many })).tags).toBe('At most 20 tags');
    expect(validateTicketForm(validForm({ tags: 'x'.repeat(51) })).tags).toBe('Each tag must be at most 50 characters');
  });
});

describe('form conversions', () => {
  it('parses tags like the backend: trimmed, lowercased, de-duplicated', () => {
    expect(parseTags(' Login, VIP,, login ')).toEqual(['login', 'vip']);
    expect(parseTags('')).toEqual([]);
  });

  it('builds a create body and leaves out "let the classifier decide"', () => {
    const body = toNewTicket(validForm({ tags: 'Billing', browser: ' ', assigned_to: '' }));
    expect(body).not.toHaveProperty('category');
    expect(body).not.toHaveProperty('priority');
    expect(body).toMatchObject({ assigned_to: null, tags: ['billing'], metadata: { source: 'web_form', browser: null, device_type: null } });

    expect(toNewTicket(validForm({ category: 'bug_report', priority: 'low', device_type: 'mobile' }))).toMatchObject({
      category: 'bug_report',
      priority: 'low',
      metadata: { device_type: 'mobile' },
    });
  });

  it('round-trips a ticket through the edit form without inventing changes', () => {
    const ticket = makeTicket({ tags: ['a', 'b'], assigned_to: 'agent.smith', category: 'bug_report', priority: 'high' });
    const form = formFromTicket(ticket);

    expect(form.tags).toBe('a, b');
    expect(toTicketUpdate(form, ticket)).toEqual({});
  });

  it('sends only the fields that changed (a category or priority in the body is a manual override)', () => {
    const ticket = makeTicket({ customer_email: 'jane@example.com', metadata: { source: 'email', browser: null, device_type: null } });
    const form = { ...formFromTicket(ticket), assigned_to: 'agent.jones', customer_email: 'JANE@example.com', browser: 'Safari 17' };

    // The email differs only in case, which the server normalises anyway, so it is not sent.
    expect(toTicketUpdate(form, ticket)).toEqual({ assigned_to: 'agent.jones', metadata: { browser: 'Safari 17' } });
  });

  it('includes every kind of change when they happen', () => {
    const ticket = makeTicket();
    const form: TicketFormValues = {
      ...formFromTicket(ticket),
      customer_name: 'New Name',
      customer_email: 'new@example.com',
      customer_id: 'NEW-1',
      subject: 'New subject',
      description: 'A completely new description.',
      category: 'billing_question',
      priority: 'urgent',
      status: 'closed',
      tags: 'x',
      source: 'phone',
      device_type: 'tablet',
    };
    expect(Object.keys(toTicketUpdate(form, ticket)).sort()).toEqual(
      ['category', 'customer_email', 'customer_id', 'customer_name', 'description', 'metadata', 'priority', 'status', 'subject', 'tags'].sort(),
    );
    expect(toTicketUpdate(form, ticket).metadata).toEqual({ source: 'phone', device_type: 'tablet' });
  });
});

describe('time and labels', () => {
  const now = new Date('2026-01-10T12:00:00Z');

  it.each([
    ['2026-01-10T11:59:30Z', 'now'],
    ['2026-01-10T11:52:00Z', '8m'],
    ['2026-01-10T09:00:00Z', '3h'],
    ['2026-01-08T12:00:00Z', '2d'],
    ['2025-12-01T12:00:00Z', '1 Dec'],
  ])('formats the age of %s as %s', (iso, expected) => {
    expect(formatAge(iso, now)).toBe(expected);
  });

  it('formats a full date and time', () => {
    expect(formatDateTime('2026-01-10T12:00:00Z')).toMatch(/10 Jan/);
  });

  it('has a label for every category and open statuses for the queue', () => {
    expect(Object.keys(CATEGORY_LABELS)).toHaveLength(6);
    expect(OPEN_STATUSES).toEqual(['new', 'in_progress', 'waiting_customer']);
  });
});
