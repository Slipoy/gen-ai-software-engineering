import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { InMemoryTicketRepository } from './repositories/inMemoryTicketRepository.js';
import { ticketsRouter } from './routes/tickets.js';
import { TicketService } from './services/ticketService.js';

export interface AppDependencies {
  ticketService?: TicketService;
}

/**
 * Builds the Express application without starting a server.
 * Tests call it directly to get a fresh, isolated app; `index.ts` calls it and then `listen()`s.
 * Dependencies can be passed in (e.g. a service with a fake clock); otherwise defaults are created.
 */
export function createApp({
  ticketService = new TicketService(new InMemoryTicketRepository()),
}: AppDependencies = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/tickets', ticketsRouter(ticketService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
