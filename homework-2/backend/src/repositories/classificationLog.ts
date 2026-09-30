import type { ClassificationDecision } from '../models/classification.js';

/**
 * Append-only store of classification decisions (an audit log): entries are added, never edited.
 * Same pattern as TicketRepository — an interface now, a SQLite table in step A7.
 */
export interface ClassificationLog {
  append(decision: ClassificationDecision): Promise<void>;
  /** Decisions for one ticket, oldest first. */
  listByTicket(ticketId: string): Promise<ClassificationDecision[]>;
}

export class InMemoryClassificationLog implements ClassificationLog {
  private readonly decisions: ClassificationDecision[] = [];

  async append(decision: ClassificationDecision): Promise<void> {
    this.decisions.push(structuredClone(decision));
  }

  async listByTicket(ticketId: string): Promise<ClassificationDecision[]> {
    return this.decisions.filter((d) => d.ticket_id === ticketId).map((d) => structuredClone(d));
  }
}
