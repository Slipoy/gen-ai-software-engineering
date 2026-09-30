import { describe, expect, it } from 'vitest';
import { buildFixtures } from '../scripts/generate-fixtures.js';
import { classifyTicket } from '../src/classification/classifier.js';
import { parseCsv } from '../src/importers/csvImporter.js';
import { parseJson } from '../src/importers/jsonImporter.js';
import { parseXml } from '../src/importers/xmlImporter.js';
import { readFixture } from './helpers.js';

describe('sample data fixtures', () => {
  it('are up to date with the generator (run `npm run generate:fixtures` if this fails)', () => {
    for (const [name, content] of Object.entries(buildFixtures())) {
      expect(readFixture(name), name).toBe(content);
    }
  });

  it('contain the required number of tickets: 50 CSV, 20 JSON, 30 XML', () => {
    expect(parseCsv(readFixture('sample_tickets.csv'))).toHaveLength(50);
    expect(parseJson(readFixture('sample_tickets.json'))).toHaveLength(20);
    expect(parseXml(readFixture('sample_tickets.xml'))).toHaveLength(30);
  });

  it('cover every category and priority', () => {
    const all = [
      ...parseCsv(readFixture('sample_tickets.csv')),
      ...parseJson(readFixture('sample_tickets.json')),
      ...parseXml(readFixture('sample_tickets.xml')),
    ].map((record) => record.data);

    expect(new Set(all.map((t) => t.category))).toEqual(
      new Set(['account_access', 'technical_issue', 'billing_question', 'feature_request', 'bug_report', 'other']),
    );
    expect(new Set(all.map((t) => t.priority))).toEqual(new Set(['urgent', 'high', 'medium', 'low']));
  });

  it('are classified in line with their labels (accuracy on all 100 sample tickets)', () => {
    const all = [
      ...parseCsv(readFixture('sample_tickets.csv')),
      ...parseJson(readFixture('sample_tickets.json')),
      ...parseXml(readFixture('sample_tickets.xml')),
    ].map((record) => record.data as { subject: string; description: string; category: string; priority: string });

    const results = all.map((ticket) => ({ ticket, result: classifyTicket(ticket) }));
    const categoryHits = results.filter(({ ticket, result }) => ticket.category === result.category).length;
    const priorityHits = results.filter(({ ticket, result }) => ticket.priority === result.priority).length;

    // The generator's templates were tuned against the classifier, so anything below 95% means a rule regressed.
    expect(categoryHits / all.length).toBeGreaterThanOrEqual(0.95);
    expect(priorityHits / all.length).toBeGreaterThanOrEqual(0.95);
  });
});
