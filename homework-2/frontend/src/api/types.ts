/**
 * Types of the backend's JSON contract (see backend/src/models). They are copied, not imported:
 * the frontend talks to the API over HTTP and must not depend on backend source files.
 * Keep them in sync with the backend; the API_REFERENCE documents the same shapes.
 */

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

export interface ClassificationResult {
  category: Category;
  priority: Priority;
  confidence: number;
  category_confidence: number;
  priority_confidence: number;
  reasoning: string;
  keywords_found: string[];
}

export interface StoredClassification extends ClassificationResult {
  classified_at: string;
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
  resolved_at: string | null;
  assigned_to: string | null;
  tags: string[];
  metadata: TicketMetadata;
  classification: StoredClassification | null;
  manual_override: boolean;
}

/** Body of POST /tickets. Optional fields get server defaults. */
export interface NewTicket {
  customer_id: string;
  customer_email: string;
  customer_name: string;
  subject: string;
  description: string;
  category?: Category;
  priority?: Priority;
  status?: Status;
  assigned_to?: string | null;
  tags?: string[];
  metadata?: Partial<TicketMetadata>;
}

/** Body of PUT /tickets/:id: any subset of the editable fields. */
export type TicketUpdate = Partial<Omit<NewTicket, 'metadata'>> & { metadata?: Partial<TicketMetadata> };

export interface TicketFilters {
  category?: Category[];
  priority?: Priority[];
  status?: Status[];
  assigned_to?: string;
  customer_email?: string;
  search?: string;
}

export interface AutoClassifyOutcome extends ClassificationResult {
  ticket_id: string;
  applied: boolean;
  ticket: Ticket;
}

export interface ClassificationDecision {
  id: string;
  ticket_id: string;
  at: string;
  actor: 'system' | 'agent';
  action: 'auto_classified' | 'manual_override';
  category: Category;
  priority: Priority;
  previous_category: Category;
  previous_priority: Priority;
  confidence: number | null;
  reasoning: string | null;
  keywords_found: string[];
  applied: boolean;
}

export interface FieldError {
  field: string;
  message: string;
}

export interface ImportSummary {
  format: 'csv' | 'json' | 'xml';
  total: number;
  successful: number;
  failed: number;
  created_ids: string[];
  failures: { record: number; location: string; errors: FieldError[] }[];
}
