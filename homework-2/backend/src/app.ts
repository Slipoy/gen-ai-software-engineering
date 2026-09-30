import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Builds the Express application without starting a server.
 * Tests call it directly to get a fresh, isolated app; `index.ts` calls it and then `listen()`s.
 */
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
