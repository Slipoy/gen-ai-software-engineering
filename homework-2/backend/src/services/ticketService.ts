import { randomUUID } from 'node:crypto';
import { classifyTicket, type ClassifiableText } from '../classification/classifier.js';
import { NotFoundError } from '../errors.js';
import { logger as defaultLogger, type Logger } from '../logger.js';
import type { ClassificationDecision, ClassificationResult } from '../models/classification.js';
import type { NewTicketInput, Status, Ticket, TicketUpdate } from '../models/ticket.js';
import { InMemoryClassificationLog, type ClassificationLog } from '../repositories/classificationLog.js';
import type { TicketFilters, TicketRepository } from '../repositories/ticketRepository.js';

/** Statuses that mean "work on this ticket is finished". */
const FINISHED_STATUSES: ReadonlySet<Status> = new Set(['resolved', 'closed']);

export interface TicketServiceOptions {
  /** Injectable clock so tests can control timestamps. */
  now?: () => Date;
  /** Injectable id generator so tests can predict ids. */
  generateId?: () => string;
  /** Where classification decisions are recorded. */
  classificationLog?: ClassificationLog;
  /** The classifier; replaceable, e.g. by an LLM-based one, without touching this service. */
  classify?: (text: ClassifiableText) => ClassificationResult;
  logger?: Logger;
}

export interface CreateOptions {
  /** Run the classifier before saving (the "auto-run on creation" flag). */
  autoClassify?: boolean;
  /** The client chose category/priority itself; see `Ticket.manual_override`. */
  manualOverride?: boolean;
}

export interface AutoClassifyOutcome extends ClassificationResult {
  ticket_id: string;
  /** False when a manual override kept the agent's category/priority. */
  applied: boolean;
  ticket: Ticket;
}

/**
 * Business rules for tickets. Knows nothing about HTTP (that is the router's job)
 * and nothing about where data is stored (that is the repository's job).
 */
export class TicketService {
  private readonly now: () => Date;
  private readonly generateId: () => string;
  private readonly classificationLog: ClassificationLog;
  private readonly classify: (text: ClassifiableText) => ClassificationResult;
  private readonly logger: Logger;

  constructor(
    private readonly repository: TicketRepository,
    {
      now = () => new Date(),
      generateId = randomUUID,
      classificationLog = new InMemoryClassificationLog(),
      classify = classifyTicket,
      logger = defaultLogger,
    }: TicketServiceOptions = {},
  ) {
    this.now = now;
    this.generateId = generateId;
    this.classificationLog = classificationLog;
    this.classify = classify;
    this.logger = logger;
  }

  async create(input: NewTicketInput, { autoClassify = false, manualOverride = false }: CreateOptions = {}): Promise<Ticket> {
    const timestamp = this.now().toISOString();
    const ticket: Ticket = {
      id: this.generateId(),
      ...input,
      created_at: timestamp,
      updated_at: timestamp,
      resolved_at: FINISHED_STATUSES.has(input.status) ? timestamp : null,
      classification: null,
      manual_override: manualOverride,
    };

    if (!autoClassify) return this.repository.insert(ticket);

    // Classify before the first save, so an auto-classified ticket is written once, already complete.
    // The decision is logged after the save, so the log never mentions a ticket that failed to store.
    const result = this.classify(ticket);
    const applied = !ticket.manual_override;
    const saved = await this.repository.insert(this.withClassification(ticket, result, applied, timestamp));
    await this.recordAutoDecision(ticket, result, applied, timestamp);
    return saved;
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

  /**
   * Applies a partial update. `metadata` is merged field by field, everything else is replaced.
   * Setting category or priority here is a manual override and is written to the decision log.
   */
  async update(id: string, changes: TicketUpdate): Promise<Ticket> {
    const current = await this.get(id);
    const timestamp = this.now().toISOString();
    const { metadata, ...fields } = changes;
    const isManualClassification = fields.category !== undefined || fields.priority !== undefined;

    const next: Ticket = {
      ...current,
      ...fields,
      metadata: { ...current.metadata, ...metadata },
      updated_at: timestamp,
      resolved_at: this.nextResolvedAt(current, fields.status ?? current.status, timestamp),
      manual_override: current.manual_override || isManualClassification,
    };

    const saved = await this.repository.update(next);
    // The ticket could have been deleted between `get` and `update` by a concurrent request.
    if (!saved) throw new NotFoundError(`Ticket ${id} not found`);

    if (isManualClassification) {
      await this.appendDecision({
        ticket_id: id,
        at: timestamp,
        actor: 'agent',
        action: 'manual_override',
        category: saved.category,
        priority: saved.priority,
        previous_category: current.category,
        previous_priority: current.priority,
        confidence: null,
        reasoning: null,
        keywords_found: [],
        applied: true,
      });
    }
    return saved;
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.repository.delete(id);
    if (!deleted) throw new NotFoundError(`Ticket ${id} not found`);
  }

  /**
   * Runs the classifier on an existing ticket (`POST /tickets/:id/auto-classify`).
   * The result is always stored and logged; category/priority change only when there is no
   * manual override, or when `force` is set (which also clears the override).
   */
  async autoClassify(id: string, { force = false }: { force?: boolean } = {}): Promise<AutoClassifyOutcome> {
    const current = await this.get(id);
    const timestamp = this.now().toISOString();
    const result = this.classify(current);
    const applied = force || !current.manual_override;

    const next = this.withClassification(current, result, applied, timestamp);
    const saved = await this.repository.update({ ...next, updated_at: timestamp });
    if (!saved) throw new NotFoundError(`Ticket ${id} not found`);

    await this.recordAutoDecision(current, result, applied, timestamp);
    return { ticket_id: id, ...result, applied, ticket: saved };
  }

  /** The decision log for one ticket, oldest first. */
  async classificationHistory(id: string): Promise<ClassificationDecision[]> {
    await this.get(id);
    return this.classificationLog.listByTicket(id);
  }

  private withClassification(ticket: Ticket, result: ClassificationResult, applied: boolean, timestamp: string): Ticket {
    return {
      ...ticket,
      classification: { ...result, classified_at: timestamp },
      ...(applied && { category: result.category, priority: result.priority, manual_override: false }),
    };
  }

  private recordAutoDecision(ticket: Ticket, result: ClassificationResult, applied: boolean, at: string) {
    return this.appendDecision({
      ticket_id: ticket.id,
      at,
      actor: 'system',
      action: 'auto_classified',
      category: result.category,
      priority: result.priority,
      previous_category: ticket.category,
      previous_priority: ticket.priority,
      confidence: result.confidence,
      reasoning: result.reasoning,
      keywords_found: result.keywords_found,
      applied,
    });
  }

  /** Every decision goes to the log store (queryable per ticket) and to the application log (stdout). */
  private async appendDecision(decision: Omit<ClassificationDecision, 'id'>) {
    const entry: ClassificationDecision = { id: this.generateId(), ...decision };
    await this.classificationLog.append(entry);
    this.logger.info('classification_decision', { ...entry });
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
