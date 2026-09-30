import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { detectFormat } from '../src/importers/index.js';
import { parseJson } from '../src/importers/jsonImporter.js';
import { MAX_IMPORT_RECORDS } from '../src/services/importService.js';
import { MAX_IMPORT_FILE_BYTES } from '../src/routes/tickets.js';
import { createTestApp, failedFields, uploadFile, uploadFixture, validTicket } from './helpers.js';

let app: ReturnType<typeof createTestApp>['app'];
beforeEach(() => {
  app = createTestApp().app;
});

describe('JSON parsing (unit)', () => {
  it('accepts a top-level array or a { tickets: [...] } wrapper', () => {
    const tickets = [validTicket(), validTicket({ customer_id: 'CUST-002' })];

    expect(parseJson(JSON.stringify(tickets)).map((r) => r.location)).toEqual(['ticket 1', 'ticket 2']);
    expect(parseJson(JSON.stringify({ tickets }))).toHaveLength(2);
  });

  it('rejects JSON of the wrong shape', () => {
    expect(() => parseJson('{"ticket": {}}')).toThrow(/expected an array of tickets/);
    expect(() => parseJson('"just a string"')).toThrow(/expected an array of tickets/);
  });
});

describe('POST /tickets/import with JSON', () => {
  it('imports nested metadata and tags as-is', async () => {
    const ticket = validTicket({ tags: ['VIP'], metadata: { source: 'chat', browser: 'Safari 17', device_type: 'tablet' } });
    const res = await uploadFile(app, JSON.stringify([ticket]), 'tickets.json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ format: 'json', total: 1, successful: 1, failed: 0 });

    const stored = (await request(app).get(`/tickets/${res.body.created_ids[0]}`)).body;
    expect(stored).toMatchObject({ tags: ['vip'], metadata: { source: 'chat', browser: 'Safari 17', device_type: 'tablet' } });
  });

  it('reports invalid records, including non-objects, and keeps the rest', async () => {
    const content = JSON.stringify([validTicket(), 42, validTicket({ subject: '', id: 'custom' })]);
    const res = await uploadFile(app, content, 'tickets.json');

    expect(res.body).toMatchObject({ total: 3, successful: 1, failed: 2 });
    expect(res.body.failures[0]).toEqual({
      record: 2,
      location: 'ticket 2',
      errors: [{ field: 'body', message: 'Request body must be a JSON object' }],
    });
    expect(res.body.failures[1].errors.map((e: { field: string }) => e.field).sort()).toEqual(['id', 'subject']);
  });

  it('returns 400 for broken JSON syntax', async () => {
    const res = await uploadFile(app, '[{"customer_id": "CUST-001",', 'tickets.json');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^Could not read JSON file: /);
  });

  it('returns 400 for an empty array and 413 for too many records', async () => {
    expect((await uploadFile(app, '[]', 'tickets.json')).status).toBe(400);

    const tooMany = JSON.stringify(Array.from({ length: MAX_IMPORT_RECORDS + 1 }, () => ({})));
    const res = await uploadFile(app, tooMany, 'tickets.json');
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Too many records');
  });
});

describe('upload handling and format detection', () => {
  it('requires a file in the "file" field', async () => {
    const noFile = await request(app).post('/tickets/import');
    expect(noFile.status).toBe(400);
    expect(noFile.body.error).toBe('No file uploaded');

    const wrongField = await request(app).post('/tickets/import').attach('upload', Buffer.from('[]'), 'tickets.json');
    expect(wrongField.status).toBe(400);
    expect(wrongField.body.error).toBe('Invalid upload');
  });

  it('rejects files over the size limit with 413', async () => {
    const res = await request(app)
      .post('/tickets/import')
      .attach('file', Buffer.alloc(MAX_IMPORT_FILE_BYTES + 1, ' '), 'tickets.json');
    expect(res.status).toBe(413);
  });

  it('detects the format from ?format, then the extension, then the MIME type', async () => {
    expect(detectFormat({ format: 'XML', filename: 'data.csv' })).toBe('xml');
    expect(detectFormat({ filename: 'Export.JSON' })).toBe('json');
    expect(detectFormat({ filename: 'export', mimeType: 'text/csv; charset=utf-8' })).toBe('csv');
    expect(() => detectFormat({ format: 'yaml' })).toThrow(/format must be one of/);
    expect(() => detectFormat({ filename: 'tickets.txt', mimeType: 'text/plain' })).toThrow(/Cannot tell the file format/);

    const viaQuery = await uploadFile(app, JSON.stringify([validTicket()]), 'upload.dat', '?format=json');
    expect(viaQuery.body.successful).toBe(1);

    const unknown = await uploadFile(app, 'hello', 'notes.txt');
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe('Unsupported format');
  });
});

describe('JSON sample fixtures', () => {
  it('imports all 20 tickets from sample_tickets.json', async () => {
    const res = await uploadFixture(app, 'sample_tickets.json');
    expect(res.body).toMatchObject({ format: 'json', total: 20, successful: 20, failed: 0 });
  });

  it('reports exactly the broken records of invalid_tickets.json', async () => {
    const res = await uploadFixture(app, 'invalid_tickets.json');

    expect(res.body).toMatchObject({ total: 6, successful: 2, failed: 4 });
    expect(failedFields(res.body)).toEqual([['customer_email'], ['description'], ['category', 'priority'], ['subject']]);
  });

  it('rejects malformed.json and wrong_structure.json as whole files', async () => {
    expect((await uploadFixture(app, 'malformed.json')).status).toBe(400);

    const wrong = await uploadFixture(app, 'wrong_structure.json');
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toMatch(/expected an array of tickets/);
  });
});
