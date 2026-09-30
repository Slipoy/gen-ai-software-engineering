import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/client.js';
import type { ClassificationDecision } from '../src/models/classification.js';
import type { Ticket } from '../src/models/ticket.js';
import { InMemoryClassificationLog, type ClassificationLog } from '../src/repositories/classificationLog.js';
import { InMemoryTicketRepository } from '../src/repositories/inMemoryTicketRepository.js';
import { SqliteClassificationLog } from '../src/repositories/sqliteClassificationLog.js';
import { SqliteTicketRepository } from '../src/repositories/sqliteTicketRepository.js';
import type { TicketRepository } from '../src/repositories/ticketRepository.js';
import { TicketService } from '../src/services/ticketService.js';

let sequence = 0;
function ticket(overrides: Partial<Ticket> = {}): Ticket {
  sequence += 1;
  return {
    id: `ticket-${String(sequence).padStart(3, '0')}`,
    customer_id: 'CUST-001',
    customer_email: 'jane@example.com',
    customer_name: 'Jane Doe',
    subject: 'Cannot log in',
    description: 'The login page rejects my password.',
    category: 'account_access',
    priority: 'high',
    status: 'new',
    created_at: `2026-01-01T10:00:${String(sequence % 60).padStart(2, '0')}.000Z`,
    updated_at: '2026-01-01T10:00:00.000Z',
    resolved_at: null,
    assigned_to: null,
    tags: ['login'],
    metadata: { source: 'web_form', browser: 'Chrome 128', device_type: 'desktop' },
    classification: null,
    manual_override: false,
    ...overrides,
  };
}

/**
 * Contract tests: the SAME tests run against every implementation of the interface.
 * If both pass, the service can use either one, which is what the A3 → A7 swap relies on.
 */
const implementations: [string, () => { tickets: TicketRepository; log: ClassificationLog }][] = [
  ['in-memory', () => ({ tickets: new InMemoryTicketRepository(), log: new InMemoryClassificationLog() })],
  [
    'SQLite',
    () => {
      const { db } = openDatabase(':memory:');
      return { tickets: new SqliteTicketRepository(db), log: new SqliteClassificationLog(db) };
    },
  ],
];

describe.each(implementations)('TicketRepository contract: %s', (_name, create) => {
  let repo: TicketRepository;
  beforeEach(() => {
    repo = create().tickets;
  });

  it('stores and returns a ticket with every field intact, including nested and JSON fields', async () => {
    const original = ticket({
      tags: ['a', 'b'],
      assigned_to: 'agent.smith',
      resolved_at: '2026-01-02T00:00:00.000Z',
      manual_override: true,
      metadata: { source: 'phone', browser: null, device_type: null },
      classification: {
        category: 'account_access',
        priority: 'urgent',
        confidence: 0.9,
        category_confidence: 0.95,
        priority_confidence: 0.85,
        reasoning: 'Matched "login".',
        keywords_found: ['login'],
        classified_at: '2026-01-01T10:00:00.000Z',
      },
    });

    await repo.insert(original);
    expect(await repo.findById(original.id)).toEqual(original);
    expect(await repo.findById('missing')).toBeUndefined();
  });

  it('returns copies, so changing a returned object does not change the stored ticket', async () => {
    const stored = await repo.insert(ticket());
    stored.tags.push('mutated');
    stored.subject = 'mutated';

    const fetched = (await repo.findById(stored.id))!;
    expect(fetched.subject).toBe('Cannot log in');
    fetched.tags.push('mutated again');
    expect((await repo.findById(stored.id))!.tags).toEqual(['login']);
  });

  it('lists newest first and applies every filter with AND', async () => {
    const older = await repo.insert(ticket({ category: 'billing_question', priority: 'low', created_at: '2026-01-01T09:00:00.000Z' }));
    const newer = await repo.insert(ticket({ status: 'in_progress', assigned_to: 'agent.smith', created_at: '2026-01-01T11:00:00.000Z' }));
    const other = await repo.insert(ticket({ customer_email: 'bob@example.com', subject: 'Invoice 50% off?', created_at: '2026-01-01T10:00:00.000Z' }));

    expect((await repo.list()).map((t) => t.id)).toEqual([newer.id, other.id, older.id]);
    expect((await repo.list({ category: ['billing_question'] })).map((t) => t.id)).toEqual([older.id]);
    expect((await repo.list({ priority: ['high', 'low'], status: ['new'] })).map((t) => t.id)).toEqual([other.id, older.id]);
    expect((await repo.list({ assigned_to: 'agent.smith' })).map((t) => t.id)).toEqual([newer.id]);
    expect((await repo.list({ customer_email: 'bob@example.com' })).map((t) => t.id)).toEqual([other.id]);
  });

  it('searches subject and description case-insensitively, treating % and _ literally', async () => {
    const percent = await repo.insert(ticket({ subject: 'Invoice 50% off?' }));
    await repo.insert(ticket({ subject: 'Invoice 500 euros' }));
    const underscore = await repo.insert(ticket({ description: 'Error in module user_profile when saving.' }));

    expect((await repo.list({ search: 'INVOICE' })).length).toBe(2);
    expect((await repo.list({ search: '50%' })).map((t) => t.id)).toEqual([percent.id]);
    expect((await repo.list({ search: 'user_profile' })).map((t) => t.id)).toEqual([underscore.id]);
    expect(await repo.list({ search: 'nothing like this' })).toEqual([]);
  });

  it('updates an existing ticket and reports a missing one', async () => {
    const stored = await repo.insert(ticket());

    const updated = await repo.update({ ...stored, status: 'closed', tags: [] });
    expect(updated).toMatchObject({ status: 'closed', tags: [] });
    expect(await repo.findById(stored.id)).toMatchObject({ status: 'closed', tags: [] });
    expect(await repo.update(ticket({ id: 'missing' }))).toBeUndefined();
  });

  it('deletes a ticket and reports whether anything was deleted', async () => {
    const stored = await repo.insert(ticket());

    expect(await repo.delete(stored.id)).toBe(true);
    expect(await repo.findById(stored.id)).toBeUndefined();
    expect(await repo.delete(stored.id)).toBe(false);
  });
});

describe.each(implementations)('ClassificationLog contract: %s', (_name, create) => {
  let log: ClassificationLog;
  beforeEach(() => {
    log = create().log;
  });

  const decision = (overrides: Partial<ClassificationDecision>): ClassificationDecision => ({
    id: `d-${Math.random()}`,
    ticket_id: 't-1',
    at: '2026-01-01T10:00:00.000Z',
    actor: 'system',
    action: 'auto_classified',
    category: 'bug_report',
    priority: 'high',
    previous_category: 'other',
    previous_priority: 'medium',
    confidence: 0.8,
    reasoning: 'Because.',
    keywords_found: ['bug'],
    applied: true,
    ...overrides,
  });

  it('returns decisions for one ticket, oldest first, in insertion order within the same instant', async () => {
    await log.append(decision({ id: 'second', at: '2026-01-01T10:00:01.000Z' }));
    await log.append(decision({ id: 'first-a', at: '2026-01-01T10:00:00.000Z' }));
    await log.append(decision({ id: 'first-b', at: '2026-01-01T10:00:00.000Z', actor: 'agent', confidence: null, reasoning: null, applied: false }));
    await log.append(decision({ id: 'other-ticket', ticket_id: 't-2' }));

    const entries = await log.listByTicket('t-1');
    expect(entries.map((d) => d.id)).toEqual(['first-a', 'first-b', 'second']);
    expect(entries[1]).toMatchObject({ actor: 'agent', confidence: null, reasoning: null, applied: false, keywords_found: ['bug'] });
    expect(await log.listByTicket('nobody')).toEqual([]);
  });
});

describe('SQLite database file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tickets-db-'));
  const path = join(dir, 'nested', 'tickets.db');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('creates missing folders, keeps data across restarts and does not re-run migrations', async () => {
    const first = openDatabase(path);
    const service = new TicketService(new SqliteTicketRepository(first.db), { classificationLog: new SqliteClassificationLog(first.db) });
    const created = await service.create(
      {
        customer_id: 'C-1',
        customer_email: 'jane@example.com',
        customer_name: 'Jane',
        subject: 'Refund please',
        description: 'I was charged twice for my plan.',
        category: 'other',
        priority: 'medium',
        status: 'new',
        assigned_to: null,
        tags: [],
        metadata: { source: 'api', browser: null, device_type: null },
      },
      { autoClassify: true },
    );
    first.close();

    // "Restart": open the same file again. Migrations are already recorded, so this must not fail.
    const second = openDatabase(path);
    const reopened = new TicketService(new SqliteTicketRepository(second.db), { classificationLog: new SqliteClassificationLog(second.db) });
    expect(await reopened.get(created.id)).toEqual(created);
    expect(await reopened.classificationHistory(created.id)).toHaveLength(1);
    second.close();
  });
});

describe('TicketService with a repository that loses the ticket mid-update', () => {
  it('reports a ticket deleted between read and write as not found', async () => {
    const repository = new InMemoryTicketRepository();
    const service = new TicketService(repository);
    const stored = await repository.insert(ticket());

    // Simulate a concurrent DELETE that lands after the service has read the ticket.
    const originalUpdate = repository.update.bind(repository);
    repository.update = async (next) => {
      await repository.delete(next.id);
      return originalUpdate(next);
    };

    await expect(service.update(stored.id, { status: 'closed' })).rejects.toThrow(`Ticket ${stored.id} not found`);
    await expect(service.autoClassify(stored.id)).rejects.toThrow(`Ticket ${stored.id} not found`);
  });
});
