/**
 * Load test: starts the API in-process on a throwaway SQLite database, seeds it, then hammers a few
 * endpoints with autocannon and prints a Markdown table (copied into TESTING_GUIDE.md).
 *
 *   npm run bench
 *
 * Unlike tests/test_performance, this measures throughput (requests per second) and latency
 * percentiles under sustained concurrent load, so it is a script to run on demand, not a test.
 */
import type { AddressInfo } from 'node:net';
import autocannon from 'autocannon';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db/client.js';
import { SqliteClassificationLog } from '../src/repositories/sqliteClassificationLog.js';
import { SqliteTicketRepository } from '../src/repositories/sqliteTicketRepository.js';
import { TicketService } from '../src/services/ticketService.js';

const DURATION_SECONDS = Number(process.env.BENCH_DURATION ?? 5);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 20);
const SEED_TICKETS = 2000;

const ticketBody = JSON.stringify({
  customer_id: 'BENCH-1',
  customer_email: 'bench@example.com',
  customer_name: 'Bench User',
  subject: 'Charged twice this month',
  description: 'I see two charges on my card for the same plan. Please refund one of them ASAP.',
});

async function main() {
  const { db, close } = openDatabase(':memory:');
  const service = new TicketService(new SqliteTicketRepository(db), { classificationLog: new SqliteClassificationLog(db) });

  const categories = ['account_access', 'technical_issue', 'billing_question', 'feature_request', 'bug_report', 'other'] as const;
  const priorities = ['urgent', 'high', 'medium', 'low'] as const;
  for (let i = 0; i < SEED_TICKETS; i++) {
    await service.create({
      ...JSON.parse(ticketBody),
      customer_id: `SEED-${i}`,
      category: categories[i % categories.length],
      priority: priorities[i % priorities.length],
      status: 'new',
      assigned_to: null,
      tags: [],
      metadata: { source: 'api', browser: null, device_type: null },
    });
  }
  const [sample] = await service.list();

  const server = createApp({ ticketService: service }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const scenarios = [
    { name: 'GET /tickets/:id', path: `/tickets/${sample!.id}`, method: 'GET' as const },
    { name: 'GET /tickets (combined filter)', path: '/tickets?category=billing_question,technical_issue&priority=urgent,high', method: 'GET' as const },
    { name: 'POST /tickets', path: '/tickets', method: 'POST' as const, body: ticketBody },
    { name: 'POST /tickets?auto_classify=true', path: '/tickets?auto_classify=true', method: 'POST' as const, body: ticketBody },
    { name: `POST /tickets/:id/auto-classify`, path: `/tickets/${sample!.id}/auto-classify`, method: 'POST' as const },
  ];

  console.log(`Seeded ${SEED_TICKETS} tickets. ${CONNECTIONS} connections, ${DURATION_SECONDS}s per scenario.\n`);
  const rows: string[] = [];
  for (const scenario of scenarios) {
    const result = await autocannon({
      url: url + scenario.path,
      method: scenario.method,
      body: scenario.body,
      headers: { 'content-type': 'application/json' },
      connections: CONNECTIONS,
      duration: DURATION_SECONDS,
    });
    const errors = result.errors + result.non2xx;
    rows.push(
      `| ${scenario.name} | ${Math.round(result.requests.average).toLocaleString('en')} | ${result.latency.p50} | ${result.latency.p97_5} | ${result.latency.p99} | ${errors} |`,
    );
    console.error(`  done: ${scenario.name}`);
  }

  console.log('| Scenario | Req/s (avg) | p50 ms | p97.5 ms | p99 ms | Errors |');
  console.log('|---|---:|---:|---:|---:|---:|');
  for (const row of rows) console.log(row);
  console.log(`\nNode ${process.version}, ${process.platform}/${process.arch}`);

  server.close();
  close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
