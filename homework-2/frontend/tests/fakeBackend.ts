import type { AutoClassifyOutcome, ClassificationDecision, Ticket } from '../src/api/types';
import { makeTicket, mockApi, on, type FakeRequest } from './utils';

/**
 * A stateful in-memory stand-in for the backend, for page-level tests: create, update, delete and classify
 * change the data, so a test can click through a whole flow and see the result on screen.
 * Only what the UI uses is implemented; the real rules are tested in the backend's own suite.
 */
export function fakeBackend(initial: Ticket[] = []) {
  const tickets = new Map(initial.map((ticket) => [ticket.id, ticket]));
  const decisions: ClassificationDecision[] = [];
  let nextId = 1;

  const list = (query: URLSearchParams) => {
    const values = (name: string) => query.get(name)?.split(',');
    const search = query.get('search')?.toLowerCase();
    return [...tickets.values()].filter(
      (t) =>
        (!values('category') || values('category')!.includes(t.category)) &&
        (!values('priority') || values('priority')!.includes(t.priority)) &&
        (!values('status') || values('status')!.includes(t.status)) &&
        (!search || `${t.subject} ${t.description}`.toLowerCase().includes(search)),
    );
  };

  const notFound = (id: string) => ({ status: 404, body: { error: 'Not found', message: `Ticket ${id} not found` } });

  const classify = (ticket: Ticket, force: boolean): AutoClassifyOutcome => {
    const result = {
      category: 'billing_question' as const,
      priority: 'high' as const,
      confidence: 0.9,
      category_confidence: 0.95,
      priority_confidence: 0.85,
      reasoning: 'Categorized as billing_question (score 5) based on "refund". Priority high because of "asap".',
      keywords_found: ['refund', 'asap'],
    };
    const applied = force || !ticket.manual_override;
    const updated: Ticket = {
      ...ticket,
      classification: { ...result, classified_at: new Date().toISOString() },
      ...(applied && { category: result.category, priority: result.priority, manual_override: false }),
    };
    tickets.set(ticket.id, updated);
    decisions.push({
      id: `d-${decisions.length + 1}`,
      ticket_id: ticket.id,
      at: new Date().toISOString(),
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
    return { ticket_id: ticket.id, ...result, applied, ticket: updated };
  };

  const requests = mockApi(
    on('GET', '/health', () => ({ body: { status: 'ok' } })),
    on('GET', '/tickets', (req) => ({ body: list(req.query) })),
    on('POST', '/tickets/import', () => ({ body: { format: 'csv', total: 0, successful: 0, failed: 0, created_ids: [], failures: [] } })),
    on('GET', '/tickets/:id/classifications', (_req, { id }) => (tickets.has(id!) ? { body: decisions.filter((d) => d.ticket_id === id) } : notFound(id!))),
    on('GET', '/tickets/:id', (_req, { id }) => (tickets.has(id!) ? { body: tickets.get(id!) } : notFound(id!))),
    on('POST', '/tickets', (req: FakeRequest) => {
      const body = req.body as Partial<Ticket>;
      const ticket = makeTicket({
        ...body,
        id: `new-${nextId++}`,
        metadata: { source: 'web_form', browser: null, device_type: null, ...body.metadata },
        manual_override: Boolean(body.category || body.priority),
      });
      tickets.set(ticket.id, ticket);
      return { status: 201, body: req.query.get('auto_classify') === 'true' ? classify(ticket, false).ticket : ticket };
    }),
    on('PUT', '/tickets/:id', (req, { id }) => {
      const current = tickets.get(id!);
      if (!current) return notFound(id!);
      const changes = req.body as Partial<Ticket>;
      const manual = changes.category !== undefined || changes.priority !== undefined;
      const updated = { ...current, ...changes, metadata: { ...current.metadata, ...changes.metadata }, manual_override: current.manual_override || manual };
      tickets.set(id!, updated);
      if (manual) {
        decisions.push({
          id: `d-${decisions.length + 1}`,
          ticket_id: id!,
          at: new Date().toISOString(),
          actor: 'agent',
          action: 'manual_override',
          category: updated.category,
          priority: updated.priority,
          previous_category: current.category,
          previous_priority: current.priority,
          confidence: null,
          reasoning: null,
          keywords_found: [],
          applied: true,
        });
      }
      return { body: updated };
    }),
    on('DELETE', '/tickets/:id', (_req, { id }) => (tickets.delete(id!) ? { status: 204 } : notFound(id!))),
    on('POST', '/tickets/:id/auto-classify', (req, { id }) =>
      tickets.has(id!) ? { body: classify(tickets.get(id!)!, req.query.get('force') === 'true') } : notFound(id!),
    ),
  );

  return { tickets, decisions, requests };
}
