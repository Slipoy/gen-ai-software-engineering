import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { InMemoryTicketRepository } from '../src/repositories/inMemoryTicketRepository.js';
import { TicketService } from '../src/services/ticketService.js';
import { fakeClock, validTicket } from './helpers.js';

let app: ReturnType<typeof createApp>;
let clock: ReturnType<typeof fakeClock>;

beforeEach(() => {
  clock = fakeClock();
  app = createApp({ ticketService: new TicketService(new InMemoryTicketRepository(), { now: clock.now }) });
});

const createTicket = (overrides: Record<string, unknown> = {}) =>
  request(app).post('/tickets').send(validTicket(overrides));

describe('app skeleton', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found', message: 'Route GET /does-not-exist does not exist' });
  });

  it('returns 400 for a malformed JSON body', async () => {
    const res = await request(app).post('/tickets').set('Content-Type', 'application/json').send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ field: 'body', message: 'Request body must be valid JSON' }]);
  });
});

describe('POST /tickets', () => {
  it('creates a ticket: 201, Location header, server-owned fields filled in', async () => {
    const res = await createTicket();

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/tickets/${res.body.id}`);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body).toMatchObject({
      ...validTicket(),
      category: 'other',
      priority: 'medium',
      status: 'new',
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:00:00.000Z',
      resolved_at: null,
      assigned_to: null,
      tags: [],
      metadata: { source: 'api', browser: null, device_type: null },
    });
  });

  it('returns 400 with all validation errors', async () => {
    const res = await createTicket({ customer_email: 'not-an-email', priority: 'asap', subject: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details.map((d: { field: string }) => d.field).sort()).toEqual([
      'customer_email',
      'priority',
      'subject',
    ]);
  });

  it('sets resolved_at when a ticket is created already resolved', async () => {
    const res = await createTicket({ status: 'resolved' });
    expect(res.body.resolved_at).toBe('2026-01-01T10:00:00.000Z');
  });
});

describe('GET /tickets/:id', () => {
  it('returns the stored ticket', async () => {
    const created = await createTicket();
    const res = await request(app).get(`/tickets/${created.body.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created.body);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/tickets/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found', message: 'Ticket 00000000-0000-0000-0000-000000000000 not found' });
  });
});

describe('GET /tickets', () => {
  beforeEach(async () => {
    await createTicket({ subject: 'Invoice is wrong', category: 'billing_question', priority: 'high' });
    clock.advance(1000);
    await createTicket({ subject: 'App crashes on start', category: 'technical_issue', priority: 'urgent', status: 'in_progress', assigned_to: 'agent.smith' });
    clock.advance(1000);
    await createTicket({ subject: 'Dark mode please', category: 'feature_request', priority: 'low', customer_email: 'bob@example.com' });
  });

  it('lists all tickets, newest first', async () => {
    const res = await request(app).get('/tickets');

    expect(res.status).toBe(200);
    expect(res.body.map((t: { subject: string }) => t.subject)).toEqual([
      'Dark mode please',
      'App crashes on start',
      'Invoice is wrong',
    ]);
  });

  it('filters by category, priority and status', async () => {
    const byCategory = await request(app).get('/tickets?category=billing_question');
    expect(byCategory.body.map((t: { subject: string }) => t.subject)).toEqual(['Invoice is wrong']);

    const byPriority = await request(app).get('/tickets?priority=urgent');
    expect(byPriority.body).toHaveLength(1);

    const byStatus = await request(app).get('/tickets?status=new');
    expect(byStatus.body).toHaveLength(2);
  });

  it('accepts comma-separated values and combines filters with AND', async () => {
    const anyOf = await request(app).get('/tickets?priority=urgent,high');
    expect(anyOf.body).toHaveLength(2);

    const combined = await request(app).get('/tickets?priority=urgent,high&status=new');
    expect(combined.body.map((t: { subject: string }) => t.subject)).toEqual(['Invoice is wrong']);
  });

  it('filters by assignee, customer email and free-text search', async () => {
    const assigned = await request(app).get('/tickets?assigned_to=agent.smith');
    expect(assigned.body.map((t: { subject: string }) => t.subject)).toEqual(['App crashes on start']);

    const byEmail = await request(app).get('/tickets?customer_email=BOB@example.com');
    expect(byEmail.body.map((t: { subject: string }) => t.subject)).toEqual(['Dark mode please']);

    const search = await request(app).get('/tickets?search=CRASHES');
    expect(search.body).toHaveLength(1);
  });

  it('returns 400 for an invalid filter value', async () => {
    const res = await request(app).get('/tickets?priority=urgent,critical&status=');

    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(['priority', 'status']);
  });

  it('rejects a repeated enum parameter and an empty text filter', async () => {
    const res = await request(app).get('/tickets?status=new&status=closed&search=%20');

    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(['status', 'search']);
  });
});

describe('PUT /tickets/:id', () => {
  it('updates only the given fields and refreshes updated_at', async () => {
    const created = await createTicket({ metadata: { source: 'email', browser: 'Firefox' } });
    clock.advance(60_000);

    const res = await request(app)
      .put(`/tickets/${created.body.id}`)
      .send({ status: 'in_progress', assigned_to: 'agent.smith', metadata: { device_type: 'mobile' } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      subject: created.body.subject,
      status: 'in_progress',
      assigned_to: 'agent.smith',
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:01:00.000Z',
      // metadata is merged, not replaced
      metadata: { source: 'email', browser: 'Firefox', device_type: 'mobile' },
    });

    const reloaded = await request(app).get(`/tickets/${created.body.id}`);
    expect(reloaded.body).toEqual(res.body);
  });

  it('manages resolved_at through the status lifecycle', async () => {
    const { body: ticket } = await createTicket();
    const put = (status: string) => request(app).put(`/tickets/${ticket.id}`).send({ status });

    clock.advance(1000);
    expect((await put('resolved')).body.resolved_at).toBe('2026-01-01T10:00:01.000Z');

    clock.advance(1000);
    // Closing a resolved ticket keeps the original resolution time.
    expect((await put('closed')).body.resolved_at).toBe('2026-01-01T10:00:01.000Z');

    clock.advance(1000);
    // Reopening clears it.
    expect((await put('in_progress')).body.resolved_at).toBeNull();
  });

  it('returns 400 for invalid or server-owned fields and 404 for an unknown id', async () => {
    const { body: ticket } = await createTicket();

    const invalid = await request(app).put(`/tickets/${ticket.id}`).send({ status: 'done', id: 'x' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.details.map((d: { field: string }) => d.field).sort()).toEqual(['id', 'status']);

    const empty = await request(app).put(`/tickets/${ticket.id}`).send({});
    expect(empty.status).toBe(400);

    const missing = await request(app).put('/tickets/unknown-id').send({ status: 'closed' });
    expect(missing.status).toBe(404);
  });
});

describe('DELETE /tickets/:id', () => {
  it('deletes a ticket: 204, then 404 on read and on a second delete', async () => {
    const { body: ticket } = await createTicket();

    const res = await request(app).delete(`/tickets/${ticket.id}`);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    expect((await request(app).get(`/tickets/${ticket.id}`)).status).toBe(404);
    expect((await request(app).delete(`/tickets/${ticket.id}`)).status).toBe(404);
  });
});

describe('storage isolation', () => {
  it('does not let a returned object change the stored ticket', async () => {
    const repository = new InMemoryTicketRepository();
    const service = new TicketService(repository);
    const ticket = await service.create({ ...validTicket(), category: 'other', priority: 'low', status: 'new', assigned_to: null, tags: ['a'], metadata: { source: 'api', browser: null, device_type: null } });

    ticket.tags.push('mutated');
    ticket.subject = 'mutated';

    expect(await service.get(ticket.id)).toMatchObject({ subject: validTicket().subject, tags: ['a'] });
  });

  it('reports a ticket deleted between read and write as not found', async () => {
    const repository = new InMemoryTicketRepository();
    const service = new TicketService(repository);
    const ticket = await service.create({ ...validTicket(), category: 'other', priority: 'low', status: 'new', assigned_to: null, tags: [], metadata: { source: 'api', browser: null, device_type: null } });

    // Simulate a concurrent delete that lands after the service has read the ticket.
    const originalUpdate = repository.update.bind(repository);
    repository.update = async (next) => {
      await repository.delete(next.id);
      return originalUpdate(next);
    };

    await expect(service.update(ticket.id, { status: 'closed' })).rejects.toThrow(`Ticket ${ticket.id} not found`);
  });
});
