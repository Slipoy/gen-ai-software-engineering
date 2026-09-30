import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { TransactionService } from '../src/services/transactionService.js';
import { TransactionStore } from '../src/store/transactionStore.js';

let app: ReturnType<typeof createApp>;
let service: TransactionService;

beforeEach(() => {
  service = new TransactionService(new TransactionStore());
  app = createApp({ service, rateLimit: false });
});

const deposit = (toAccount: string, amount: number, currency = 'USD') =>
  request(app).post('/transactions').send({ type: 'deposit', toAccount, amount, currency });

describe('POST /transactions', () => {
  it('creates a deposit and returns 201 with the full model', async () => {
    const res = await deposit('ACC-12345', 100.5);

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/transactions/${res.body.id}`);
    expect(res.body).toMatchObject({
      fromAccount: null,
      toAccount: 'ACC-12345',
      amount: 100.5,
      currency: 'USD',
      type: 'deposit',
      status: 'completed',
    });
    expect(res.body.id).toEqual(expect.any(String));
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('completes a transfer when funds are available', async () => {
    await deposit('ACC-12345', 200);
    const res = await request(app)
      .post('/transactions')
      .send({ type: 'transfer', fromAccount: 'ACC-12345', toAccount: 'ACC-67890', amount: 100.5, currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('completed');
  });

  it('stores an overdrawing withdrawal as failed and leaves the balance intact', async () => {
    await deposit('ACC-12345', 50);
    const res = await request(app)
      .post('/transactions')
      .send({ type: 'withdrawal', fromAccount: 'ACC-12345', amount: 80, currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('failed');
    expect(res.body.failureReason).toMatch(/Insufficient funds/);

    const balance = await request(app).get('/accounts/ACC-12345/balance');
    expect(balance.body.balances).toEqual({ USD: 50 });
  });

  it('checks funds per currency', async () => {
    await deposit('ACC-12345', 100, 'EUR');
    const res = await request(app)
      .post('/transactions')
      .send({ type: 'withdrawal', fromAccount: 'ACC-12345', amount: 10, currency: 'USD' });

    expect(res.body.status).toBe('failed');
  });
});

describe('validation', () => {
  it('returns every field error in the documented format', async () => {
    const res = await request(app)
      .post('/transactions')
      .send({ type: 'transfer', fromAccount: 'ACC-1', toAccount: 'ACC-67890', amount: -5, currency: 'XYZ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        { field: 'amount', message: 'Amount must be a positive number' },
        expect.objectContaining({ field: 'currency' }),
        expect.objectContaining({ field: 'fromAccount' }),
      ]),
    );
  });

  it.each([
    [0, 'Amount must be a positive number'],
    ['100', 'Amount must be a positive number'],
    [10.123, 'Amount must have at most 2 decimal places'],
  ])('rejects amount %j', async (amount, message) => {
    const res = await request(app)
      .post('/transactions')
      .send({ type: 'deposit', toAccount: 'ACC-12345', amount, currency: 'USD' });

    expect(res.status).toBe(400);
    expect(res.body.details).toContainEqual({ field: 'amount', message });
  });

  it('accepts amounts with exactly two decimals that are not exact in binary (0.29, 1.15)', async () => {
    expect((await deposit('ACC-12345', 0.29)).status).toBe(201);
    expect((await deposit('ACC-12345', 1.15)).status).toBe(201);
  });

  it.each(['ACC-1234', 'ACC-123456', 'acc-12345', 'ACC-12 45', 'ACC_12345'])('rejects account %s', async (account) => {
    const res = await deposit(account, 10);
    expect(res.status).toBe(400);
    expect(res.body.details).toContainEqual(expect.objectContaining({ field: 'toAccount' }));
  });

  it('accepts alphanumeric account ids', async () => {
    expect((await deposit('ACC-AB12z', 10)).status).toBe(201);
  });

  it.each(['usd', 'XYZ', 'US', 42])('rejects currency %j', async (currency) => {
    const res = await request(app)
      .post('/transactions')
      .send({ type: 'deposit', toAccount: 'ACC-12345', amount: 10, currency });
    expect(res.body.details).toContainEqual(expect.objectContaining({ field: 'currency' }));
  });

  it('requires the right accounts for each type', async () => {
    const noTo = await request(app).post('/transactions').send({ type: 'deposit', amount: 10, currency: 'USD' });
    expect(noTo.body.details).toContainEqual({ field: 'toAccount', message: 'toAccount is required for a deposit' });

    const same = await request(app)
      .post('/transactions')
      .send({ type: 'transfer', fromAccount: 'ACC-12345', toAccount: 'ACC-12345', amount: 10, currency: 'USD' });
    expect(same.body.details).toContainEqual({ field: 'toAccount', message: 'Cannot transfer to the same account' });
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await request(app).post('/transactions').set('Content-Type', 'application/json').send('{"amount":');
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('body');
  });
});

describe('GET /transactions and /transactions/:id', () => {
  it('lists all transactions and fetches one by id', async () => {
    const created = await deposit('ACC-12345', 10);
    await deposit('ACC-67890', 20);

    const list = await request(app).get('/transactions');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);

    const one = await request(app).get(`/transactions/${created.body.id}`);
    expect(one.status).toBe(200);
    expect(one.body).toEqual(created.body);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/transactions/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('filtering (Task 3)', () => {
  beforeEach(() => {
    const seed = [
      { type: 'deposit', toAccount: 'ACC-12345', amount: 500, currency: 'USD', timestamp: '2024-01-05T10:00:00.000Z' },
      { type: 'deposit', toAccount: 'ACC-67890', amount: 300, currency: 'USD', timestamp: '2024-01-15T10:00:00.000Z' },
      { type: 'transfer', fromAccount: 'ACC-12345', toAccount: 'ACC-67890', amount: 100, currency: 'USD', timestamp: '2024-01-31T23:30:00.000Z' },
      { type: 'withdrawal', fromAccount: 'ACC-12345', amount: 50, currency: 'USD', timestamp: '2024-02-02T09:00:00.000Z' },
    ] as const;
    for (const { timestamp, ...input } of seed) service.create(input, { timestamp });
  });

  it('filters by account (as sender or receiver)', async () => {
    const res = await request(app).get('/transactions?accountId=ACC-67890');
    expect(res.body).toHaveLength(2);
  });

  it('filters by type', async () => {
    const res = await request(app).get('/transactions?type=transfer');
    expect(res.body.map((tx: { type: string }) => tx.type)).toEqual(['transfer']);
  });

  it('treats a date-only `to` as the end of that day', async () => {
    const res = await request(app).get('/transactions?from=2024-01-01&to=2024-01-31');
    expect(res.body).toHaveLength(3);
  });

  it('combines filters', async () => {
    const res = await request(app).get('/transactions?accountId=ACC-12345&type=deposit&from=2024-01-01&to=2024-01-31');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].amount).toBe(500);
  });

  it.each([
    ['type=refund', 'type'],
    ['accountId=123', 'accountId'],
    ['from=2024-13-45', 'from'],
    ['from=2024-02-01&to=2024-01-01', 'from'],
  ])('rejects invalid filter %s', async (query, field) => {
    const res = await request(app).get(`/transactions?${query}`);
    expect(res.status).toBe(400);
    expect(res.body.details).toContainEqual(expect.objectContaining({ field }));
  });
});

describe('accounts', () => {
  beforeEach(async () => {
    await deposit('ACC-12345', 1000);
    await deposit('ACC-12345', 50, 'EUR');
    await request(app)
      .post('/transactions')
      .send({ type: 'transfer', fromAccount: 'ACC-12345', toAccount: 'ACC-67890', amount: 250.25, currency: 'USD' });
    await request(app)
      .post('/transactions')
      .send({ type: 'withdrawal', fromAccount: 'ACC-12345', amount: 0.1, currency: 'USD' });
  });

  it('returns the balance per currency without float drift', async () => {
    const res = await request(app).get('/accounts/ACC-12345/balance');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accountId: 'ACC-12345', balances: { USD: 749.65, EUR: 50 } });
  });

  it('returns 404 for an account without transactions and 400 for a malformed id', async () => {
    expect((await request(app).get('/accounts/ACC-00000/balance')).status).toBe(404);
    expect((await request(app).get('/accounts/nope/balance')).status).toBe(400);
  });

  it('returns a summary (Option A)', async () => {
    const res = await request(app).get('/accounts/ACC-12345/summary');
    expect(res.body).toMatchObject({
      totalDeposits: { USD: 1000, EUR: 50 },
      totalWithdrawals: { USD: 0.1 },
      totalTransfersOut: { USD: 250.25 },
      totalTransfersIn: {},
      transactionCount: 4,
    });
    expect(res.body.mostRecentTransactionDate).toEqual(expect.any(String));
  });

  it('calculates simple interest (Option B)', async () => {
    const res = await request(app).get('/accounts/ACC-67890/interest?rate=0.05&days=30');
    // 250.25 × 0.05 × 30 / 365 = 1.0284...
    expect(res.body.interest).toEqual({ USD: 1.03 });
    expect(res.body.projectedBalances).toEqual({ USD: 251.28 });
  });

  it('validates interest parameters', async () => {
    const res = await request(app).get('/accounts/ACC-67890/interest?rate=5&days=1.5');
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(['rate', 'days']);
  });
});

describe('GET /transactions/export (Option C)', () => {
  it('exports filtered transactions as CSV', async () => {
    await deposit('ACC-12345', 10);
    await deposit('ACC-67890', 20);

    const res = await request(app).get('/transactions/export?format=csv&accountId=ACC-12345');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="transactions.csv"/);

    const lines = res.text.trim().split('\r\n');
    expect(lines[0]).toBe('id,fromAccount,toAccount,amount,currency,type,timestamp,status,failureReason');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(',ACC-12345,10,USD,deposit,');
  });

  it('rejects unsupported formats', async () => {
    expect((await request(app).get('/transactions/export?format=xml')).status).toBe(400);
  });
});

describe('rate limiting (Option D)', () => {
  it('returns 429 after the limit is reached and resets after the window', async () => {
    let now = 0;
    const limited = createApp({ rateLimit: { limit: 3, windowMs: 60_000, now: () => now } });

    for (let i = 0; i < 3; i++) expect((await request(limited).get('/health')).status).toBe(200);

    const blocked = await request(limited).get('/health');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBe('60');

    now = 60_000;
    expect((await request(limited).get('/health')).status).toBe(200);
  });
});
