import type { Category, Priority, Status, Ticket } from '../models/ticket.js';

/** Criteria for listing tickets. Every field is optional; the given ones are combined with AND. */
export interface TicketFilters {
  /** Matches any of the listed values (e.g. `?priority=urgent,high`). */
  category?: Category[];
  priority?: Priority[];
  status?: Status[];
  assigned_to?: string;
  customer_email?: string;
  /** Case-insensitive substring match on subject and description. */
  search?: string;
}

/**
 * Storage contract. The service depends only on this interface, so the in-memory implementation
 * can be swapped for SQLite (step A7) without touching the service, routes or tests.
 *
 * Methods are async even for in-memory storage: a real database is always asynchronous,
 * and keeping one shape means callers never change.
 */
export interface TicketRepository {
  insert(ticket: Ticket): Promise<Ticket>;
  findById(id: string): Promise<Ticket | undefined>;
  /** Returns matching tickets, newest first. */
  list(filters?: TicketFilters): Promise<Ticket[]>;
  /** Replaces a stored ticket. Returns `undefined` when the id does not exist. */
  update(ticket: Ticket): Promise<Ticket | undefined>;
  /** Returns `true` when a ticket was deleted. */
  delete(id: string): Promise<boolean>;
}
