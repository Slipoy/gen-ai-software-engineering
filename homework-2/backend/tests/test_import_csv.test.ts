import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { csvRowToTicket, parseCsv } from '../src/importers/csvImporter.js';
import { createTestApp, uploadFile } from './helpers.js';

const HEADER =
  'customer_id,customer_email,customer_name,subject,description,category,priority,status,assigned_to,tags,metadata_source,metadata_browser,metadata_device_type';

const ROW_1 =
  'CUST-001,jane@example.com,Jane Doe,Cannot log in,My password reset link does not work at all,account_access,urgent,new,,login;password,web_form,Chrome 128,desktop';
const ROW_2 =
  'CUST-002,bob@example.com,Bob Stone,"Invoice total, wrong","I was charged twice for the ""Pro"" plan in March",billing_question,high,,agent.smith,billing,email,,';

let app: ReturnType<typeof createTestApp>['app'];
beforeEach(() => {
  app = createTestApp().app;
});

describe('CSV parsing (unit)', () => {
  it('maps flat columns to nested metadata and splits tags on ";"', () => {
    expect(
      csvRowToTicket({
        subject: 'Hi',
        tags: ' login ; password ;',
        metadata_source: 'email',
        metadata_device_type: 'mobile',
        assigned_to: '',
      }),
    ).toEqual({
      subject: 'Hi',
      tags: ['login', 'password'],
      metadata: { source: 'email', device_type: 'mobile' },
    });
  });

  it('handles quoted fields with commas and escaped quotes, a BOM, blank lines and header case', () => {
    const csv = `﻿${HEADER.toUpperCase()}\n${ROW_1}\n\n${ROW_2}\n`;
    const records = parseCsv(csv);

    expect(records).toHaveLength(2);
    expect(records[1]!.data).toMatchObject({
      subject: 'Invoice total, wrong',
      description: 'I was charged twice for the "Pro" plan in March',
    });
    // Line numbers count the header and the blank line, so they match what an editor shows.
    expect(records.map((r) => r.location)).toEqual(['line 2', 'line 4']);
  });
});

describe('POST /tickets/import with CSV', () => {
  it('imports every valid row and returns a summary', async () => {
    const res = await uploadFile(app, `${HEADER}\n${ROW_1}\n${ROW_2}\n`, 'tickets.csv');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ format: 'csv', total: 2, successful: 2, failed: 0, failures: [] });
    expect(res.body.created_ids).toHaveLength(2);

    const list = await request(app).get('/tickets?category=account_access');
    expect(list.body[0]).toMatchObject({
      customer_email: 'jane@example.com',
      priority: 'urgent',
      tags: ['login', 'password'],
      metadata: { source: 'web_form', browser: 'Chrome 128', device_type: 'desktop' },
    });
  });

  it('applies defaults for empty cells', async () => {
    const res = await uploadFile(app, `${HEADER}\n${ROW_2}\n`, 'tickets.csv');
    const ticket = (await request(app).get(`/tickets/${res.body.created_ids[0]}`)).body;

    expect(ticket).toMatchObject({ status: 'new', assigned_to: 'agent.smith', metadata: { source: 'email', browser: null, device_type: null } });
  });

  it('keeps valid rows and reports invalid ones with line numbers (partial success)', async () => {
    const badEmail = ROW_1.replace('jane@example.com', 'not-an-email');
    const badPriority = ROW_2.replace(',high,', ',critical,');
    const res = await uploadFile(app, `${HEADER}\n${ROW_1}\n${badEmail}\n${badPriority}\n`, 'tickets.csv');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, successful: 1, failed: 2 });
    expect(res.body.failures).toEqual([
      { record: 2, location: 'line 3', errors: [{ field: 'customer_email', message: 'customer_email must be a valid email address' }] },
      { record: 3, location: 'line 4', errors: [expect.objectContaining({ field: 'priority' })] },
    ]);
  });

  it('reports an unknown column as an error on each row', async () => {
    const res = await uploadFile(app, `${HEADER},priorty\n${ROW_1},high\n`, 'tickets.csv');

    expect(res.body.failed).toBe(1);
    expect(res.body.failures[0].errors).toContainEqual({ field: 'priorty', message: 'Unknown field priorty' });
  });

  it('returns 400 for a malformed CSV file', async () => {
    const unclosedQuote = await uploadFile(app, `${HEADER}\n${ROW_1.replace('Jane Doe', '"Jane Doe')}\n`, 'tickets.csv');
    expect(unclosedQuote.status).toBe(400);
    expect(unclosedQuote.body.error).toBe('Invalid import file');
    expect(unclosedQuote.body.message).toMatch(/^Could not read CSV file: /);

    const wrongColumnCount = await uploadFile(app, `${HEADER}\n${ROW_1},extra\n`, 'tickets.csv');
    expect(wrongColumnCount.status).toBe(400);
  });

  it('returns 400 for a file with only a header', async () => {
    const res = await uploadFile(app, `${HEADER}\n`, 'tickets.csv');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Empty import file', message: 'The file contains no tickets' });
  });
});
