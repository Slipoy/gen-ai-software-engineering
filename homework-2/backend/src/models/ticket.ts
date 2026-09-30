/**
 * Ticket data model from the assignment. Field names are snake_case because that is the
 * public JSON contract (the same names appear in CSV/JSON/XML imports).
 *
 * Each enum is declared once as a readonly array: the array is used for runtime validation,
 * and the union type is derived from it, so the two can never drift apart.
 */

import type { StoredClassification } from './classification.js';

export const CATEGORIES = [
  'account_access',
  'technical_issue',
  'billing_question',
  'feature_request',
  'bug_report',
  'other',
] as const;

export const PRIORITIES = ['urgent', 'high', 'medium', 'low'] as const;

export const STATUSES = ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed'] as const;

export const SOURCES = ['web_form', 'email', 'api', 'chat', 'phone'] as const;

export const DEVICE_TYPES = ['desktop', 'mobile', 'tablet'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];
export type Source = (typeof SOURCES)[number];
export type DeviceType = (typeof DEVICE_TYPES)[number];

export interface TicketMetadata {
  source: Source;
  browser: string | null;
  device_type: DeviceType | null;
}

export interface Ticket {
  id: string;
  customer_id: string;
  customer_email: string;
  customer_name: string;
  subject: string;
  description: string;
  category: Category;
  priority: Priority;
  status: Status;
  created_at: string;
  updated_at: string;
  /** Set by the server when the status becomes `resolved` or `closed`. */
  resolved_at: string | null;
  assigned_to: string | null;
  tags: string[];
  metadata: TicketMetadata;
  /** Latest automatic classification, including its confidence. `null` until the classifier has run. */
  classification: StoredClassification | null;
  /**
   * True when a person chose category/priority (on create or via PUT). The classifier then keeps
   * their values instead of overwriting them, unless it is run with `force`.
   */
  manual_override: boolean;
}

/** Fields a client sends to create a ticket. Everything the server owns (id, timestamps) is excluded. */
export interface NewTicketInput {
  customer_id: string;
  customer_email: string;
  customer_name: string;
  subject: string;
  description: string;
  category: Category;
  priority: Priority;
  status: Status;
  assigned_to: string | null;
  tags: string[];
  metadata: TicketMetadata;
}

/** Fields a client may change with `PUT /tickets/:id`. Every field is optional. */
export type TicketUpdate = Partial<Omit<NewTicketInput, 'metadata'>> & {
  metadata?: Partial<TicketMetadata>;
};

/** Defaults applied when a create request leaves an optional field out. */
export const TICKET_DEFAULTS = {
  category: 'other',
  priority: 'medium',
  status: 'new',
  source: 'api',
} as const satisfies { category: Category; priority: Priority; status: Status; source: Source };

/** Length limits. Subject and description limits come from the assignment; the rest are sensible caps. */
export const LIMITS = {
  subject: { min: 1, max: 200 },
  description: { min: 10, max: 2000 },
  customer_id: { min: 1, max: 100 },
  customer_name: { min: 1, max: 100 },
  customer_email: { max: 254 },
  assigned_to: { min: 1, max: 100 },
  browser: { max: 100 },
  tag: { min: 1, max: 50 },
  tags: { max: 20 },
} as const;
