import express, { type ErrorRequestHandler } from 'express';
import { rateLimiter, type RateLimiterOptions } from './middleware/rateLimiter.js';
import { accountsRouter } from './routes/accounts.js';
import { transactionsRouter } from './routes/transactions.js';
import { TransactionService } from './services/transactionService.js';
import { TransactionStore } from './store/transactionStore.js';

export interface AppOptions {
  service?: TransactionService;
  /** Pass `false` to disable rate limiting (e.g. in tests). */
  rateLimit?: RateLimiterOptions | false;
}

export function createApp({
  service = new TransactionService(new TransactionStore()),
  rateLimit = { limit: 100, windowMs: 60_000 },
}: AppOptions = {}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  if (rateLimit) app.use(rateLimiter(rateLimit));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/transactions', transactionsRouter(service));
  app.use('/accounts', accountsRouter(service));

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', message: `Route ${req.method} ${req.path} does not exist` });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    // Malformed JSON body from express.json().
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({
        error: 'Validation failed',
        details: [{ field: 'body', message: 'Request body must be valid JSON' }],
      });
    }
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload too large' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
