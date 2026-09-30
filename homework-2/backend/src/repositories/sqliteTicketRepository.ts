import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { tickets, type TicketRow } from '../db/schema.js';
import type { Ticket } from '../models/ticket.js';
import type { TicketFilters, TicketRepository } from './ticketRepository.js';

/** Row (flat, as stored) → Ticket (nested, as the API returns it). */
function toTicket(row: TicketRow): Ticket {
  const { metadata_source, metadata_browser, metadata_device_type, ...rest } = row;
  return {
    ...rest,
    metadata: { source: metadata_source, browser: metadata_browser, device_type: metadata_device_type },
  };
}

/** Ticket → row: the reverse of toTicket. */
function toRow(ticket: Ticket): TicketRow {
  const { metadata, ...rest } = ticket;
  return {
    ...rest,
    metadata_source: metadata.source,
    metadata_browser: metadata.browser,
    metadata_device_type: metadata.device_type,
  };
}

/** Escapes LIKE wildcards so a search for "50%" finds the text "50%" and not everything starting with "50". */
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * TicketRepository backed by SQLite through Drizzle.
 * better-sqlite3 is synchronous, so each method finishes immediately; the async signature
 * comes from the TicketRepository contract and keeps callers unchanged.
 */
export class SqliteTicketRepository implements TicketRepository {
  constructor(private readonly db: AppDatabase) {}

  async insert(ticket: Ticket): Promise<Ticket> {
    this.db.insert(tickets).values(toRow(ticket)).run();
    return structuredClone(ticket);
  }

  async findById(id: string): Promise<Ticket | undefined> {
    const row = this.db.select().from(tickets).where(eq(tickets.id, id)).get();
    return row && toTicket(row);
  }

  async list(filters: TicketFilters = {}): Promise<Ticket[]> {
    const conditions: SQL[] = [];
    if (filters.category) conditions.push(inArray(tickets.category, filters.category));
    if (filters.priority) conditions.push(inArray(tickets.priority, filters.priority));
    if (filters.status) conditions.push(inArray(tickets.status, filters.status));
    if (filters.assigned_to !== undefined) conditions.push(eq(tickets.assigned_to, filters.assigned_to));
    if (filters.customer_email !== undefined) conditions.push(eq(tickets.customer_email, filters.customer_email));
    if (filters.search) {
      const pattern = likePattern(filters.search);
      // SQLite's LIKE is case-insensitive for ASCII letters, matching the in-memory search.
      conditions.push(
        or(
          sql`${tickets.subject} LIKE ${pattern} ESCAPE '\\'`,
          sql`${tickets.description} LIKE ${pattern} ESCAPE '\\'`,
        )!,
      );
    }

    const rows = this.db
      .select()
      .from(tickets)
      .where(and(...conditions))
      .orderBy(desc(tickets.created_at), desc(tickets.id))
      .all();
    return rows.map(toTicket);
  }

  async update(ticket: Ticket): Promise<Ticket | undefined> {
    const { id, ...fields } = toRow(ticket);
    const result = this.db.update(tickets).set(fields).where(eq(tickets.id, id)).run();
    return result.changes > 0 ? structuredClone(ticket) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    return this.db.delete(tickets).where(eq(tickets.id, id)).run().changes > 0;
  }
}
