import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseXml } from '../src/importers/xmlImporter.js';
import { createTestApp, failedFields, uploadFile, uploadFixture } from './helpers.js';

const ticketXml = (overrides: Record<string, string> = {}) => {
  const fields = {
    customer_id: 'CUST-001',
    customer_email: 'jane@example.com',
    customer_name: 'Jane Doe',
    subject: 'Cannot log in',
    description: 'My password reset link does not work at all',
    ...overrides,
  };
  const body = Object.entries(fields)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join('');
  return `<ticket>${body}</ticket>`;
};

const document = (...tickets: string[]) => `<?xml version="1.0" encoding="UTF-8"?>\n<tickets>${tickets.join('\n')}</tickets>`;

let app: ReturnType<typeof createTestApp>['app'];
beforeEach(() => {
  app = createTestApp().app;
});

describe('XML parsing (unit)', () => {
  it('turns <tags><tag> into an array and keeps values as text', () => {
    const [record] = parseXml(document(ticketXml({ customer_id: '00123', tags: '<tag>login</tag><tag>vip</tag>' })));

    expect(record!.data).toMatchObject({ customer_id: '00123', tags: ['login', 'vip'] });
  });

  it('treats a single <ticket>/<tag> as a one-item list and empty elements as missing', () => {
    const [record] = parseXml(document(ticketXml({ tags: '<tag>solo</tag>', assigned_to: '' })));

    expect(record!.data.tags).toEqual(['solo']);
    expect(record!.data).not.toHaveProperty('assigned_to');
    expect(parseXml(document(ticketXml({ tags: '' })))[0]!.data.tags).toEqual([]);
  });
});

describe('POST /tickets/import with XML', () => {
  it('imports tickets with nested metadata and decoded entities', async () => {
    const xml = document(
      ticketXml({ subject: 'Billing &amp; invoices', metadata: '<source>phone</source><device_type>mobile</device_type>' }),
      ticketXml({ customer_id: 'CUST-002' }),
    );
    const res = await uploadFile(app, xml, 'tickets.xml');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ format: 'xml', total: 2, successful: 2, failed: 0 });

    const stored = (await request(app).get(`/tickets/${res.body.created_ids[0]}`)).body;
    expect(stored).toMatchObject({ subject: 'Billing & invoices', metadata: { source: 'phone', device_type: 'mobile', browser: null } });
  });

  it('reports invalid tickets by position and keeps the valid ones', async () => {
    const xml = document(ticketXml(), ticketXml({ customer_email: 'broken' }), ticketXml({ priority: 'whenever' }));
    const res = await uploadFile(app, xml, 'tickets.xml');

    expect(res.body).toMatchObject({ total: 3, successful: 1, failed: 2 });
    expect(res.body.failures.map((f: { location: string }) => f.location)).toEqual(['ticket 2', 'ticket 3']);
  });

  it('returns 400 for malformed XML, with the line number', async () => {
    const res = await uploadFile(app, '<tickets>\n<ticket><subject>Oops</ticket>\n</tickets>', 'tickets.xml');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^Could not read XML file: .*\(line 2\)$/);
  });

  it('returns 400 for a wrong root element or an empty <tickets>', async () => {
    const wrongRoot = await uploadFile(app, '<orders><order/></orders>', 'tickets.xml');
    expect(wrongRoot.status).toBe(400);
    expect(wrongRoot.body.message).toMatch(/expected a <tickets> root element/);

    const empty = await uploadFile(app, '<tickets></tickets>', 'tickets.xml');
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe('Empty import file');
  });

  it('refuses external entities (XXE) instead of reading local files', async () => {
    const xxe = `<?xml version="1.0"?>
<!DOCTYPE tickets [<!ENTITY secret SYSTEM "file:///etc/passwd">]>
<tickets>${ticketXml({ subject: '&secret;' })}</tickets>`;
    const res = await uploadFile(app, xxe, 'tickets.xml');

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('root:');
  });
});

describe('XML sample fixtures', () => {
  it('imports all 30 tickets from sample_tickets.xml, with tags and metadata', async () => {
    const res = await uploadFixture(app, 'sample_tickets.xml');

    expect(res.body).toMatchObject({ format: 'xml', total: 30, successful: 30, failed: 0 });
    const [first] = (await request(app).get('/tickets?search=password%20reset')).body;
    expect(first.tags.length).toBeGreaterThan(0);
    expect(first.metadata.source).toBeDefined();
  });

  it('reports exactly the broken records of invalid_tickets.xml', async () => {
    const res = await uploadFixture(app, 'invalid_tickets.xml');

    expect(res.body).toMatchObject({ total: 6, successful: 2, failed: 4 });
    expect(failedFields(res.body)).toEqual([['customer_email'], ['description'], ['category', 'priority'], ['subject']]);
  });

  it('rejects malformed.xml as a whole file', async () => {
    const res = await uploadFixture(app, 'malformed.xml');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^Could not read XML file/);
  });
});
