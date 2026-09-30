import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { performance } from 'node:perf_hooks';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyTicket } from '../src/classification/classifier.js';
import { parseCsv } from '../src/importers/csvImporter.js';
import { createTestApp, readFixture, recordsToCsv, sampleCsvRecords, uploadFile, validTicket } from './helpers.js';

/**
 * Performance benchmarks with generous thresholds: they catch order-of-magnitude regressions
 * (an accidental O(n²), a missing index) without failing on a slow CI machine.
 * Typical numbers on a laptop are noted next to each threshold; `npm run bench` measures
 * throughput and latency percentiles against a running server for the TESTING_GUIDE table.
 */

/** Runs `fn` and returns how long it took in milliseconds. */
async function timed(fn: () => unknown | Promise<unknown>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

/** The value below which `p` percent of the samples fall (nearest-rank method). */
export function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

/** Builds a CSV with `count` rows by repeating the sample file's records with unique customer ids. */
function largeCsv(count: number): string {
  const { columns, records } = sampleCsvRecords();
  const rows = Array.from({ length: count }, (_, i) => ({ ...records[i % records.length]!, customer_id: `PERF-${i}` }));
  return recordsToCsv(rows, columns);
}

describe('performance benchmarks', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { app, service } = createTestApp();
    // 5,000 tickets so list queries run against a realistic amount of data.
    const base = { ...validTicket(), assigned_to: null, tags: [], metadata: { source: 'api' as const, browser: null, device_type: null } };
    const categories = ['account_access', 'technical_issue', 'billing_question', 'feature_request', 'bug_report', 'other'] as const;
    const priorities = ['urgent', 'high', 'medium', 'low'] as const;
    const statuses = ['new', 'in_progress', 'waiting_customer', 'resolved', 'closed'] as const;
    for (let i = 0; i < 5000; i++) {
      await service.create({
        ...base,
        customer_id: `SEED-${i}`,
        category: categories[i % categories.length]!,
        priority: priorities[i % priorities.length]!,
        status: statuses[i % statuses.length]!,
      });
    }
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 30_000);

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('classifies 1,000 tickets in under 500 ms (typically ~35 ms)', async () => {
    const texts = parseCsv(readFixture('sample_tickets.csv')).map((r) => r.data as { subject: string; description: string });
    const duration = await timed(() => {
      for (let i = 0; i < 1000; i++) classifyTicket(texts[i % texts.length]!);
    });
    expect(duration).toBeLessThan(500);
  });

  it('imports a 1,000-row CSV with auto-classification in under 3 s (typically ~0.2 s)', async () => {
    const csv = largeCsv(1000);
    let summary: { successful: number } = { successful: 0 };
    const duration = await timed(async () => {
      summary = (await uploadFile(baseUrl, csv, 'big.csv', '?auto_classify=true')).body;
    });

    expect(summary.successful).toBe(1000);
    expect(duration).toBeLessThan(3000);
  }, 10_000);

  it('answers a combined filter query over 6,000 tickets with p95 under 150 ms (typically ~3 ms)', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      samples.push(await timed(() => request(baseUrl).get('/tickets?category=billing_question,technical_issue&priority=urgent,high&status=new').expect(200)));
    }
    expect(percentile(samples, 95)).toBeLessThan(150);
  });

  it('serves 200 sequential reads by id with p95 under 25 ms (typically <1 ms)', async () => {
    const { body: ticket } = await request(baseUrl).post('/tickets').send(validTicket());
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(await timed(() => request(baseUrl).get(`/tickets/${ticket.id}`).expect(200)));
    }
    expect(percentile(samples, 95)).toBeLessThan(25);
  });

  it('completes 50 concurrent creates in under 2 s with no errors (typically ~25 ms)', async () => {
    let statuses: number[] = [];
    const duration = await timed(async () => {
      const responses = await Promise.all(
        Array.from({ length: 50 }, (_, i) => request(baseUrl).post('/tickets?auto_classify=true').send(validTicket({ customer_id: `CONC-${i}` }))),
      );
      statuses = responses.map((r) => r.status);
    });

    expect(statuses.every((status) => status === 201)).toBe(true);
    expect(duration).toBeLessThan(2000);
  });

  it('computes percentiles correctly', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(samples, 50)).toBe(50);
    expect(percentile(samples, 95)).toBe(95);
    expect(percentile(samples, 99)).toBe(99);
    expect(percentile([7], 95)).toBe(7);
  });
});
