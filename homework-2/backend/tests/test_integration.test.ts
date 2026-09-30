import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, fakeClock, recordsToCsv, sampleCsvRecords, uploadFile, uploadFixture, validTicket } from './helpers.js';

/**
 * End-to-end workflows (Task 6). Unlike the API tests, each scenario chains several endpoints the way a
 * real client would, and runs against a server listening on a real port with a real (in-memory) SQLite
 * database, so concurrent requests really overlap.
 */
let server: Server;
let baseUrl: string;
let clock: ReturnType<typeof fakeClock>;

beforeEach(async () => {
  clock = fakeClock();
  const { app } = createTestApp({ now: clock.now });
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, () => resolve(listening)); // port 0 = any free port
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const api = () => request(baseUrl);

/** sample_tickets.csv without the category and priority columns, so the classifier has to decide. */
function unlabelledSampleCsv() {
  const { columns, records } = sampleCsvRecords();
  const csv = recordsToCsv(records, columns.filter((name) => name !== 'category' && name !== 'priority'));
  return { csv, labels: records };
}

describe('integration: complete ticket lifecycle', () => {
  it('create → classify → assign → wait → resolve → close → reopen → delete, with history', async () => {
    // 1. A customer writes in; the ticket is classified on creation.
    const created = await api()
      .post('/tickets?auto_classify=true')
      .send(validTicket({ subject: "Can't access my account", description: 'The login page rejects my password since this morning.' }));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'new', category: 'account_access', priority: 'urgent' });
    const id = created.body.id as string;

    // 2. An agent picks it up.
    clock.advance(60_000);
    const assigned = await api().put(`/tickets/${id}`).send({ status: 'in_progress', assigned_to: 'agent.smith' });
    expect(assigned.body).toMatchObject({ status: 'in_progress', assigned_to: 'agent.smith', resolved_at: null });

    // 3. The agent asks the customer something, then lowers the priority after talking to them.
    clock.advance(60_000);
    await api().put(`/tickets/${id}`).send({ status: 'waiting_customer' });
    const lowered = await api().put(`/tickets/${id}`).send({ priority: 'high' });
    expect(lowered.body).toMatchObject({ priority: 'high', manual_override: true });

    // 4. Resolved, then closed: resolved_at is set once and kept.
    clock.advance(60_000);
    const resolved = await api().put(`/tickets/${id}`).send({ status: 'resolved' });
    expect(resolved.body.resolved_at).toBe('2026-01-01T10:03:00.000Z');
    clock.advance(60_000);
    const closed = await api().put(`/tickets/${id}`).send({ status: 'closed' });
    expect(closed.body.resolved_at).toBe('2026-01-01T10:03:00.000Z');

    // 5. The customer writes back: reopening clears resolved_at.
    const reopened = await api().put(`/tickets/${id}`).send({ status: 'in_progress' });
    expect(reopened.body.resolved_at).toBeNull();

    // 6. The history shows who decided what.
    const history = (await api().get(`/tickets/${id}/classifications`)).body;
    expect(history.map((d: { actor: string }) => d.actor)).toEqual(['system', 'agent']);

    // 7. Deleted: gone from reads and lists.
    expect((await api().delete(`/tickets/${id}`)).status).toBe(204);
    expect((await api().get(`/tickets/${id}`)).status).toBe(404);
    expect((await api().get('/tickets')).body).toEqual([]);
  });
});

describe('integration: bulk import with auto-classification', () => {
  it('classifies 50 unlabelled imported tickets in line with the reference labels', async () => {
    const { csv, labels } = unlabelledSampleCsv();
    const summary = (await uploadFile(baseUrl, csv, 'tickets.csv', '?auto_classify=true')).body;
    expect(summary).toMatchObject({ total: 50, successful: 50, failed: 0 });

    const tickets = (await api().get('/tickets')).body as { customer_id: string; category: string; priority: string; classification: unknown; manual_override: boolean }[];
    const byCustomer = new Map(labels.map((label) => [label.customer_id, label]));
    const correct = tickets.filter((t) => byCustomer.get(t.customer_id)?.category === t.category).length;

    expect(tickets.every((t) => t.classification !== null && t.manual_override === false)).toBe(true);
    expect(correct / tickets.length).toBeGreaterThanOrEqual(0.95);
  });

  it('keeps categories that the source file already set (manual override) but still stores an opinion', async () => {
    await uploadFixture(baseUrl, 'sample_tickets.json', '?auto_classify=true');
    const tickets = (await api().get('/tickets')).body as { manual_override: boolean; classification: unknown }[];

    expect(tickets).toHaveLength(20);
    expect(tickets.every((t) => t.manual_override && t.classification !== null)).toBe(true);
  });
});

describe('integration: concurrent operations', () => {
  it('handles 50 simultaneous creates: all succeed, all ids unique, nothing lost', async () => {
    const responses = await Promise.all(
      Array.from({ length: 50 }, (_, i) => api().post('/tickets').send(validTicket({ customer_id: `PAR-${i}` }))),
    );

    expect(responses.every((r) => r.status === 201)).toBe(true);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(50);
    expect((await api().get('/tickets')).body).toHaveLength(50);
  });

  it('handles 25 simultaneous mixed reads, updates and classifications of the same ticket without errors', async () => {
    const { body: ticket } = await api().post('/tickets').send(validTicket());

    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, i) => {
        if (i % 3 === 0) return api().get(`/tickets/${ticket.id}`);
        if (i % 3 === 1) return api().put(`/tickets/${ticket.id}`).send({ tags: [`tag-${i}`] });
        return api().post(`/tickets/${ticket.id}/auto-classify`);
      }),
    );

    expect(responses.map((r) => r.status).every((s) => s === 200)).toBe(true);
    const final = (await api().get(`/tickets/${ticket.id}`)).body;
    // Last write wins; the ticket must still be complete and valid.
    expect(final.tags).toHaveLength(1);
    expect(final.classification).not.toBeNull();
  });

  it('imports three files at the same time', async () => {
    const results = await Promise.all([
      uploadFixture(baseUrl, 'sample_tickets.csv'),
      uploadFixture(baseUrl, 'sample_tickets.json'),
      uploadFixture(baseUrl, 'sample_tickets.xml'),
    ]);

    expect(results.map((r) => r.body.successful)).toEqual([50, 20, 30]);
    expect((await api().get('/tickets')).body).toHaveLength(100);
  });
});

describe('integration: combined filtering', () => {
  it('filters by category and priority together, matching the fixture data exactly', async () => {
    await Promise.all(['sample_tickets.csv', 'sample_tickets.json', 'sample_tickets.xml'].map((name) => uploadFixture(baseUrl, name)));
    const all = (await api().get('/tickets')).body as { category: string; priority: string; status: string }[];
    expect(all).toHaveLength(100);

    const cases = [
      { category: ['technical_issue'], priority: ['urgent'] },
      { category: ['billing_question', 'account_access'], priority: ['high', 'urgent'] },
      { category: ['bug_report'], priority: ['low', 'medium'], status: ['new'] },
    ];
    for (const filter of cases) {
      const query = Object.entries(filter).map(([key, values]) => `${key}=${values.join(',')}`).join('&');
      const expected = all.filter((t) =>
        Object.entries(filter).every(([key, values]) => values.includes(t[key as keyof typeof t])),
      );

      const res = await api().get(`/tickets?${query}`);
      expect(res.status, query).toBe(200);
      expect(res.body.length, query).toBe(expected.length);
      expect(res.body.every((t: { category: string; priority: string }) => filter.category.includes(t.category) && filter.priority.includes(t.priority))).toBe(true);
    }
  });
});
