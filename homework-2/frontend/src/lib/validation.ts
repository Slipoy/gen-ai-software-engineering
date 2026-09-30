import type { Category, DeviceType, NewTicket, Priority, Source, Status, Ticket, TicketUpdate } from '../api/types';

/**
 * Client-side validation mirroring the backend rules (backend/src/validators/ticketValidator.ts).
 * It gives instant feedback while typing; the server still validates everything, and its field
 * errors are shown the same way, so a rule that drifts here is caught on submit.
 */
export const LIMITS = {
  subject: { min: 1, max: 200 },
  description: { min: 10, max: 2000 },
  customer_id: { min: 1, max: 100 },
  customer_name: { min: 1, max: 100 },
  customer_email: { max: 254 },
  assigned_to: { max: 100 },
  browser: { max: 100 },
  tag: { max: 50 },
  tags: { max: 20 },
} as const;

// Same pragmatic check as the backend: something@something.tld, no spaces.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** What the form edits. Every value is a string, as HTML inputs give them; '' means "not set". */
export interface TicketFormValues {
  customer_name: string;
  customer_email: string;
  customer_id: string;
  subject: string;
  description: string;
  /** '' = let the classifier decide (create only). */
  category: Category | '';
  priority: Priority | '';
  status: Status;
  assigned_to: string;
  /** Comma-separated, e.g. "login, vip". */
  tags: string;
  source: Source;
  browser: string;
  device_type: DeviceType | '';
}

export type FormErrors = Partial<Record<keyof TicketFormValues, string>>;

export const EMPTY_FORM: TicketFormValues = {
  customer_name: '',
  customer_email: '',
  customer_id: '',
  subject: '',
  description: '',
  category: '',
  priority: '',
  status: 'new',
  assigned_to: '',
  tags: '',
  source: 'web_form',
  browser: '',
  device_type: '',
};

export function formFromTicket(ticket: Ticket): TicketFormValues {
  return {
    customer_name: ticket.customer_name,
    customer_email: ticket.customer_email,
    customer_id: ticket.customer_id,
    subject: ticket.subject,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    assigned_to: ticket.assigned_to ?? '',
    tags: ticket.tags.join(', '),
    source: ticket.metadata.source,
    browser: ticket.metadata.browser ?? '',
    device_type: ticket.metadata.device_type ?? '',
  };
}

/** "login, VIP,, login " → ["login", "vip"], matching how the backend normalises tags. */
export function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

function lengthError(label: string, value: string, { min = 0, max }: { min?: number; max: number }): string | undefined {
  const length = value.trim().length;
  if (min > 0 && length === 0) return `${label} is required`;
  if (length < min) return `${label} must be at least ${min} characters (now ${length})`;
  if (length > max) return `${label} must be at most ${max} characters (now ${length})`;
  return undefined;
}

export function validateTicketForm(values: TicketFormValues): FormErrors {
  const errors: FormErrors = {
    customer_name: lengthError('Name', values.customer_name, LIMITS.customer_name),
    customer_id: lengthError('Customer ID', values.customer_id, LIMITS.customer_id),
    subject: lengthError('Subject', values.subject, LIMITS.subject),
    description: lengthError('Description', values.description, LIMITS.description),
    assigned_to: lengthError('Assignee', values.assigned_to, LIMITS.assigned_to),
    browser: lengthError('Browser', values.browser, LIMITS.browser),
  };

  const email = values.customer_email.trim();
  if (!email) errors.customer_email = 'Email is required';
  else if (email.length > LIMITS.customer_email.max) errors.customer_email = `Email must be at most ${LIMITS.customer_email.max} characters`;
  else if (!EMAIL_PATTERN.test(email)) errors.customer_email = 'Enter an email like name@example.com';

  const tags = parseTags(values.tags);
  const longTag = tags.find((tag) => tag.length > LIMITS.tag.max);
  if (tags.length > LIMITS.tags.max) errors.tags = `At most ${LIMITS.tags.max} tags`;
  else if (longTag) errors.tags = `Each tag must be at most ${LIMITS.tag.max} characters`;

  // Drop the keys without an error, so `Object.keys(errors).length === 0` means "valid".
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message)) as FormErrors;
}

/** Form values → body of POST /tickets. Empty category/priority are left out so the server applies defaults. */
export function toNewTicket(values: TicketFormValues): NewTicket {
  return {
    customer_name: values.customer_name.trim(),
    customer_email: values.customer_email.trim(),
    customer_id: values.customer_id.trim(),
    subject: values.subject.trim(),
    description: values.description.trim(),
    ...(values.category && { category: values.category }),
    ...(values.priority && { priority: values.priority }),
    status: values.status,
    assigned_to: values.assigned_to.trim() || null,
    tags: parseTags(values.tags),
    metadata: {
      source: values.source,
      browser: values.browser.trim() || null,
      device_type: values.device_type || null,
    },
  };
}

/**
 * Only the fields that changed → body of PUT /tickets/:id. Sending just the changes matters:
 * a category or priority in the body counts as a manual override on the server.
 */
export function toTicketUpdate(values: TicketFormValues, original: Ticket): TicketUpdate {
  const next = toNewTicket(values);
  const update: TicketUpdate = {};
  const set = <K extends keyof TicketUpdate>(key: K, value: TicketUpdate[K]) => {
    update[key] = value;
  };

  if (next.customer_name !== original.customer_name) set('customer_name', next.customer_name);
  if (next.customer_email.toLowerCase() !== original.customer_email) set('customer_email', next.customer_email);
  if (next.customer_id !== original.customer_id) set('customer_id', next.customer_id);
  if (next.subject !== original.subject) set('subject', next.subject);
  if (next.description !== original.description) set('description', next.description);
  if (next.category && next.category !== original.category) set('category', next.category);
  if (next.priority && next.priority !== original.priority) set('priority', next.priority);
  if (next.status !== original.status) set('status', next.status);
  if (next.assigned_to !== original.assigned_to) set('assigned_to', next.assigned_to);
  if (next.tags!.join(',') !== original.tags.join(',')) set('tags', next.tags);

  const metadata: NonNullable<TicketUpdate['metadata']> = {};
  if (next.metadata!.source !== original.metadata.source) metadata.source = next.metadata!.source;
  if (next.metadata!.browser !== original.metadata.browser) metadata.browser = next.metadata!.browser;
  if (next.metadata!.device_type !== original.metadata.device_type) metadata.device_type = next.metadata!.device_type;
  if (Object.keys(metadata).length > 0) set('metadata', metadata);

  return update;
}
