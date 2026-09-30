import type { Category, Priority, Source, Status } from '../api/types';

/** Human-readable names for the API's enum values. The API keeps snake_case; the UI never shows it raw. */
export const CATEGORY_LABELS: Record<Category, string> = {
  account_access: 'Account access',
  technical_issue: 'Technical issue',
  billing_question: 'Billing',
  feature_request: 'Feature request',
  bug_report: 'Bug report',
  other: 'Other',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const STATUS_LABELS: Record<Status, string> = {
  new: 'New',
  in_progress: 'In progress',
  waiting_customer: 'Waiting',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const SOURCE_LABELS: Record<Source, string> = {
  web_form: 'Web form',
  email: 'Email',
  api: 'API',
  chat: 'Chat',
  phone: 'Phone',
};

/** Statuses that still need work. The queue shows these by default. */
export const OPEN_STATUSES: Status[] = ['new', 'in_progress', 'waiting_customer'];
