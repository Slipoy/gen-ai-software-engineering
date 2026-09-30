import type { Ticket } from '../models/ticket.js';
import type { TicketFilters, TicketRepository } from './ticketRepository.js';

/** Returns true when the ticket satisfies every filter that is set. */
export function matchesFilters(ticket: Ticket, filters: TicketFilters): boolean {
  if (filters.category && !filters.category.includes(ticket.category)) return false;
  if (filters.priority && !filters.priority.includes(ticket.priority)) return false;
  if (filters.status && !filters.status.includes(ticket.status)) return false;
  if (filters.assigned_to !== undefined && ticket.assigned_to !== filters.assigned_to) return false;
  if (filters.customer_email !== undefined && ticket.customer_email !== filters.customer_email) return false;
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    const haystack = `${ticket.subject}\n${ticket.description}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/**
 * Keeps tickets in a Map inside the process. Data disappears on restart.
 * Stored objects are copied on the way in and out, so callers can never mutate the store by accident.
 */
export class InMemoryTicketRepository implements TicketRepository {
  private readonly tickets = new Map<string, Ticket>();

  async insert(ticket: Ticket): Promise<Ticket> {
    this.tickets.set(ticket.id, structuredClone(ticket));
    return structuredClone(ticket);
  }

  async findById(id: string): Promise<Ticket | undefined> {
    const ticket = this.tickets.get(id);
    return ticket && structuredClone(ticket);
  }

  async list(filters: TicketFilters = {}): Promise<Ticket[]> {
    return [...this.tickets.values()]
      .filter((ticket) => matchesFilters(ticket, filters))
      // ISO timestamps sort correctly as strings; the id breaks ties for tickets created in the same millisecond.
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
      .map((ticket) => structuredClone(ticket));
  }

  async update(ticket: Ticket): Promise<Ticket | undefined> {
    if (!this.tickets.has(ticket.id)) return undefined;
    this.tickets.set(ticket.id, structuredClone(ticket));
    return structuredClone(ticket);
  }

  async delete(id: string): Promise<boolean> {
    return this.tickets.delete(id);
  }
}
