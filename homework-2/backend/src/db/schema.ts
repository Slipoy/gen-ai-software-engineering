import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ClassificationActor, StoredClassification } from '../models/classification.js';
import type { Category, DeviceType, Priority, Source, Status } from '../models/ticket.js';

/**
 * Database tables, described in TypeScript. Drizzle uses this file for two things:
 * - typed queries (a typo in a column name is a compile error),
 * - `npm run db:generate`, which compares it with the last migration and writes the SQL for the difference.
 *
 * SQLite has only a few storage types (TEXT, INTEGER, REAL, BLOB), so:
 * - enums are TEXT, typed with `$type<...>()` and guarded by the app's validator,
 * - booleans are INTEGER 0/1 (`mode: 'boolean'` converts them),
 * - arrays and nested objects that are always read whole are JSON in a TEXT column.
 */
export const tickets = sqliteTable(
  'tickets',
  {
    id: text('id').primaryKey(),
    customer_id: text('customer_id').notNull(),
    customer_email: text('customer_email').notNull(),
    customer_name: text('customer_name').notNull(),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    category: text('category').$type<Category>().notNull(),
    priority: text('priority').$type<Priority>().notNull(),
    status: text('status').$type<Status>().notNull(),
    created_at: text('created_at').notNull(),
    updated_at: text('updated_at').notNull(),
    resolved_at: text('resolved_at'),
    assigned_to: text('assigned_to'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
    // metadata is flattened into columns so it can be filtered on later (e.g. "all phone tickets").
    metadata_source: text('metadata_source').$type<Source>().notNull(),
    metadata_browser: text('metadata_browser'),
    metadata_device_type: text('metadata_device_type').$type<DeviceType>(),
    classification: text('classification', { mode: 'json' }).$type<StoredClassification>(),
    manual_override: integer('manual_override', { mode: 'boolean' }).notNull(),
  },
  (table) => [
    // Indexes for the filters of GET /tickets and its default sort order.
    index('tickets_category_idx').on(table.category),
    index('tickets_priority_idx').on(table.priority),
    index('tickets_status_idx').on(table.status),
    index('tickets_assigned_to_idx').on(table.assigned_to),
    index('tickets_customer_email_idx').on(table.customer_email),
    index('tickets_created_at_idx').on(table.created_at),
  ],
);

/**
 * Audit log of classification decisions. Deliberately no foreign key to `tickets`:
 * the log must survive when a ticket is deleted (that is the point of an audit trail).
 */
export const classificationDecisions = sqliteTable(
  'classification_decisions',
  {
    id: text('id').primaryKey(),
    ticket_id: text('ticket_id').notNull(),
    at: text('at').notNull(),
    actor: text('actor').$type<ClassificationActor>().notNull(),
    action: text('action').$type<'auto_classified' | 'manual_override'>().notNull(),
    category: text('category').$type<Category>().notNull(),
    priority: text('priority').$type<Priority>().notNull(),
    previous_category: text('previous_category').$type<Category>().notNull(),
    previous_priority: text('previous_priority').$type<Priority>().notNull(),
    confidence: real('confidence'),
    reasoning: text('reasoning'),
    keywords_found: text('keywords_found', { mode: 'json' }).$type<string[]>().notNull(),
    applied: integer('applied', { mode: 'boolean' }).notNull(),
  },
  (table) => [index('classification_decisions_ticket_idx').on(table.ticket_id, table.at)],
);

export type TicketRow = typeof tickets.$inferSelect;
