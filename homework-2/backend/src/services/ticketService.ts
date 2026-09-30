import { randomUUID } from 'node:crypto';
import { NotFoundError } from '../errors.js';
import type { NewTicketInput, Status, Ticket, TicketUpdate } from '../models/ticket.js';
import type { TicketFilters, TicketRepository } from '../repositories/ticketRepository.js';

/** Statuses that mean "work on this ticket is finished". */
const FINISHED_STATUSES: ReadonlySet<Status> = new Set(['resolved', 'closed']);

export interface TicketServiceOptions {
  /** Injectable clock so tests can control timestamps. */
  now?: () => Date;
  /** Injectable id generator so tests can predict ids. */
  generateId?: () => string;
}

/**
 * Business rules for tickets. Knows nothing about HTTP (that is the router's job)
 * and nothing about where data is stored (that is the repository's job).
 */
export class TicketService {
  private readonly now: () => Date;
  private readonly generateId: () => string;

  constructor(
    private readonly repository: TicketRepository,
    { now = () => new Date(), generateId = randomUUID }: TicketServiceOptions = {},
  ) {
    this.now = now;
    this.generateId = generateId;
  }

  async create(input: NewTicketInput): Promise<Ticket> {
    const timestamp = this.now().toISOString();
    return this.repository.insert({
      id: this.generateId(),
      ...input,
      created_at: timestamp,
      updated_at: timestamp,
      resolved_at: FINISHED_STATUSES.has(input.status) ? timestamp : null,
    });
  }

  /** Throws NotFoundError, so callers never have to handle `undefined`. */
  async get(id: string): Promise<Ticket> {
    const ticket = await this.repository.findById(id);
    if (!ticket) throw new NotFoundError(`Ticket ${id} not found`);
    return ticket;
  }

  list(filters: TicketFilters = {}): Promise<Ticket[]> {
    return this.repository.list(filters);
  }

  /** Applies a partial update. `metadata` is merged field by field, everything else is replaced. */
  async update(id: string, changes: TicketUpdate): Promise<Ticket> {
    const current = await this.get(id);
    const timestamp = this.now().toISOString();
    const { metadata, ...fields } = changes;

    const next: Ticket = {
      ...current,
      ...fields,
      metadata: { ...current.metadata, ...metadata },
      updated_at: timestamp,
      resolved_at: this.nextResolvedAt(current, fields.status ?? current.status, timestamp),
    };

    const saved = await this.repository.update(next);
    // The ticket could have been deleted between `get` and `update` by a concurrent request.
    if (!saved) throw new NotFoundError(`Ticket ${id} not found`);
    return saved;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw new NotFoundError(`Ticket ${id} not found`);
  }

  /**
   * `resolved_at` records when work finished:
   * - set when a ticket moves into resolved/closed,
   * - kept when it moves between resolved and closed (closing a resolved ticket is not a new resolution),
   * - cleared when it is reopened.
   */
  private nextResolvedAt(current: Ticket, nextStatus: Status, timestamp: string): string | null {
    const wasFinished = FINISHED_STATUSES.has(current.status);
    const isFinished = FINISHED_STATUSES.has(nextStatus);
    if (!isFinished) return null;
    return wasFinished ? (current.resolved_at ?? timestamp) : timestamp;
  }
}
