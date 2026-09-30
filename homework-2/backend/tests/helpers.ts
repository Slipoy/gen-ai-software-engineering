import request from 'supertest';
import { createApp } from '../src/app.js';
import { InMemoryTicketRepository } from '../src/repositories/inMemoryTicketRepository.js';
import { TicketService } from '../src/services/ticketService.js';

/** A minimal valid create request; tests override one field at a time. */
export const validTicket = (overrides: Record<string, unknown> = {}) => ({
  customer_id: 'CUST-001',
  customer_email: 'jane.doe@example.com',
  customer_name: 'Jane Doe',
  subject: 'Cannot log in after password reset',
  description: 'I reset my password yesterday and now the login page says my credentials are invalid.',
  ...overrides,
});

/** A clock the test can move forward, so timestamps are predictable. */
export function fakeClock(start = '2026-01-01T10:00:00.000Z') {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    advance: (ms: number) => {
      current += ms;
    },
  };
}

/** A fresh app with its own empty in-memory store. */
export function createTestApp(options: { now?: () => Date } = {}) {
  const service = new TicketService(new InMemoryTicketRepository(), options);
  return { app: createApp({ ticketService: service }), service };
}

/** Uploads `content` to POST /tickets/import as a multipart file. */
export function uploadFile(app: ReturnType<typeof createApp>, content: string, filename: string, query = '') {
  return request(app).post(`/tickets/import${query}`).attach('file', Buffer.from(content, 'utf8'), filename);
}
