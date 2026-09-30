import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { classifyTicket } from '../src/classification/classifier.js';
import { createLogger } from '../src/logger.js';
import { readBooleanFlag } from '../src/validators/queryFlags.js';
import { createTestApp, fakeClock, uploadFile, validTicket } from './helpers.js';

const classify = (subject: string, description = 'No further details were provided by the customer.') =>
  classifyTicket({ subject, description });

describe('classifier: categories', () => {
  it.each([
    ['account_access', 'Cannot log in after password reset', 'The login page rejects my new password.'],
    ['account_access', '2FA code never arrives', 'I am locked out because the verification code SMS does not come.'],
    ['technical_issue', 'App crashes on startup', 'The mobile app crashes every time I open it, showing an error.'],
    ['billing_question', 'Charged twice this month', 'I see two charges on my card for the Pro plan, please refund one.'],
    ['feature_request', 'Dark mode', 'It would be great if you could add dark mode to the dashboard.'],
    ['bug_report', 'Export button broken', 'Steps to reproduce:\n1. Open reports\n2. Click Export\nExpected: a CSV file. Actual: nothing.'],
    ['other', 'Hello', 'I have a general question about your company history.'],
  ])('classifies as %s: %s', (category, subject, description) => {
    expect(classifyTicket({ subject, description }).category).toBe(category);
  });

  it('prefers bug_report over technical_issue when reproduction details are present', () => {
    const withoutRepro = classify('Report export gives an error', 'Exporting a report shows an error message.');
    const withRepro = classify(
      'Report export gives an error',
      'Exporting a report shows an error message. Steps to reproduce: open Reports, click Export. Expected: file, actual: error.',
    );

    expect(withoutRepro.category).toBe('technical_issue');
    expect(withRepro.category).toBe('bug_report');
  });

  it('matches whole words only and ignores case and curly apostrophes', () => {
    expect(classify('Question about PayPal integration').keywords_found).not.toContain('pay');
    expect(classify('I CAN’T ACCESS my account').keywords_found).toContain("can't access");
  });

  it('weights keywords in the subject higher than in the description', () => {
    const subjectBilling = classify('Invoice question', 'The app crashes when I open it.');
    const descriptionBilling = classify('App crashes', 'Also a question about my invoice.');

    expect(subjectBilling.category).toBe('billing_question');
    expect(descriptionBilling.category).toBe('technical_issue');
  });
});

describe('classifier: priority', () => {
  it.each([
    ['urgent', "I can't access the admin panel"],
    ['urgent', 'Critical: production down since 9am'],
    ['urgent', 'Possible security issue with shared links'],
    ['high', 'Important: this is blocking our release'],
    ['high', 'Please fix ASAP'],
    ['low', 'Minor cosmetic issue on the settings page'],
    ['low', 'Just a suggestion about the menu'],
    ['medium', 'The report takes a while to generate'],
  ])('assigns %s: %s', (priority, subject) => {
    expect(classify(subject).priority).toBe(priority);
  });

  it('lets the most severe level win and lowers confidence when levels conflict', () => {
    const result = classify('Minor but critical: security settings page');

    expect(result.priority).toBe('urgent');
    expect(result.priority_confidence).toBe(0.7);
    expect(result.reasoning).toMatch(/outranks low keywords/);
  });
});

describe('classifier: confidence, reasoning, keywords', () => {
  it('returns a 0..1 confidence that grows with evidence and falls with ambiguity', () => {
    const strong = classify('Cannot log in, password reset and 2FA both fail');
    const weak = classify('Slow page');
    const ambiguous = classify('Invoice page crashes');
    const none = classify('Hello there');

    for (const r of [strong, weak, ambiguous, none]) {
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
    expect(strong.category_confidence).toBeGreaterThan(weak.category_confidence);
    expect(strong.category_confidence).toBeGreaterThan(ambiguous.category_confidence);
    expect(none).toMatchObject({ category: 'other', priority: 'medium', category_confidence: 0.25, priority_confidence: 0.5 });
  });

  it('explains the decision and lists the keywords it used', () => {
    const result = classify("Can't access billing invoices", 'I need my invoice urgently, please.');

    expect(result.category).toBe('billing_question');
    expect(result.reasoning).toMatch(/^Categorized as billing_question \(score \d+\) based on "invoices"/);
    expect(result.reasoning).toMatch(/Priority urgent because of "can't access"/);
    expect(result.keywords_found).toEqual(expect.arrayContaining(['invoices', "can't access"]));
  });

  it('is deterministic: the same text always gives the same result', () => {
    const text = { subject: 'App crashes on login', description: 'Error after the update, steps to reproduce below.' };
    expect(classifyTicket(text)).toEqual(classifyTicket(text));
  });
});

describe('POST /tickets/:id/auto-classify', () => {
  let app: ReturnType<typeof createTestApp>['app'];
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    clock = fakeClock();
    app = createTestApp({ now: clock.now }).app;
  });

  const create = (body: Record<string, unknown>, query = '') => request(app).post(`/tickets${query}`).send(validTicket(body));

  it('classifies a ticket, stores the result and updates category and priority', async () => {
    const { body: ticket } = await create({ subject: "Can't access my account", description: 'The login page keeps rejecting my password.' });
    expect(ticket).toMatchObject({ category: 'other', priority: 'medium', classification: null, manual_override: false });

    clock.advance(5000);
    const res = await request(app).post(`/tickets/${ticket.id}/auto-classify`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ticket_id: ticket.id,
      category: 'account_access',
      priority: 'urgent',
      applied: true,
      keywords_found: expect.arrayContaining(["can't access", 'login', 'password']),
    });
    expect(res.body.confidence).toBeGreaterThan(0.8);
    expect(typeof res.body.reasoning).toBe('string');

    const stored = (await request(app).get(`/tickets/${ticket.id}`)).body;
    expect(stored).toMatchObject({ category: 'account_access', priority: 'urgent', updated_at: '2026-01-01T10:00:05.000Z' });
    expect(stored.classification).toMatchObject({ confidence: res.body.confidence, classified_at: '2026-01-01T10:00:05.000Z' });
  });

  it('returns 404 for an unknown ticket and 400 for an invalid flag', async () => {
    expect((await request(app).post('/tickets/unknown/auto-classify')).status).toBe(404);

    const { body: ticket } = await create({});
    const res = await request(app).post(`/tickets/${ticket.id}/auto-classify?force=maybe`);
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual([{ field: 'force', message: 'force must be true or false' }]);
  });

  it('auto-runs on creation with ?auto_classify=true', async () => {
    const res = await create({ subject: 'Refund for double charge', description: 'I was charged twice, please refund.' }, '?auto_classify=true');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ category: 'billing_question', manual_override: false });
    expect(res.body.classification.category).toBe('billing_question');

    const history = (await request(app).get(`/tickets/${res.body.id}/classifications`)).body;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ actor: 'system', action: 'auto_classified', previous_category: 'other', applied: true });
  });

  it('keeps values chosen by the client on creation (manual override)', async () => {
    const res = await create(
      { subject: 'Refund please', description: 'I was charged twice, please refund.', category: 'other', priority: 'low' },
      '?auto_classify=1',
    );

    expect(res.body).toMatchObject({ category: 'other', priority: 'low', manual_override: true });
    // The classifier still ran and its opinion is stored for the agent to see.
    expect(res.body.classification.category).toBe('billing_question');
  });

  it('respects a manual override made with PUT, unless ?force=true', async () => {
    const { body: ticket } = await create({ subject: 'Invoice is wrong', description: 'The invoice total does not match the plan price.' });

    const put = await request(app).put(`/tickets/${ticket.id}`).send({ category: 'technical_issue' });
    expect(put.body.manual_override).toBe(true);

    const kept = await request(app).post(`/tickets/${ticket.id}/auto-classify`);
    expect(kept.body).toMatchObject({ category: 'billing_question', applied: false });
    expect(kept.body.ticket.category).toBe('technical_issue');

    const forced = await request(app).post(`/tickets/${ticket.id}/auto-classify?force=true`);
    expect(forced.body.applied).toBe(true);
    expect(forced.body.ticket).toMatchObject({ category: 'billing_question', manual_override: false });
  });

  it('logs every decision, automatic and manual, in order', async () => {
    const { body: ticket } = await create({ subject: 'App crashes on start', description: 'The app crashes right after the splash screen.' });

    await request(app).post(`/tickets/${ticket.id}/auto-classify`);
    clock.advance(1000);
    await request(app).put(`/tickets/${ticket.id}`).send({ priority: 'urgent', status: 'in_progress' });
    clock.advance(1000);
    await request(app).put(`/tickets/${ticket.id}`).send({ status: 'resolved' }); // not a classification change
    await request(app).post(`/tickets/${ticket.id}/auto-classify`);

    const res = await request(app).get(`/tickets/${ticket.id}/classifications`);
    expect(res.status).toBe(200);
    expect(res.body.map((d: { actor: string; action: string; applied: boolean }) => [d.actor, d.action, d.applied])).toEqual([
      ['system', 'auto_classified', true],
      ['agent', 'manual_override', true],
      ['system', 'auto_classified', false],
    ]);
    expect(res.body[1]).toMatchObject({ priority: 'urgent', previous_priority: 'medium', confidence: null });

    expect((await request(app).get('/tickets/unknown/classifications')).status).toBe(404);
  });

  it('classifies imported tickets with ?auto_classify=true', async () => {
    const csv = [
      'customer_id,customer_email,customer_name,subject,description',
      'C-1,a@example.com,Ann,Locked out of my account,I cannot access my account after the 2FA reset.',
      'C-2,b@example.com,Ben,Feature idea,It would be great to export reports to PDF.',
    ].join('\n');

    const res = await uploadFile(app, csv, 'tickets.csv', '?auto_classify=true');
    expect(res.body.successful).toBe(2);

    const tickets = (await request(app).get('/tickets')).body;
    expect(tickets.map((t: { category: string }) => t.category).sort()).toEqual(['account_access', 'feature_request']);
  });
});

describe('supporting pieces', () => {
  it('reads boolean flags', () => {
    expect(readBooleanFlag({}, 'x')).toBe(false);
    expect(readBooleanFlag({ x: 'TRUE' }, 'x')).toBe(true);
    expect(readBooleanFlag({ x: '' }, 'x')).toBe(true);
    expect(readBooleanFlag({ x: 'no' }, 'x')).toBe(false);
    expect(() => readBooleanFlag({ x: ['1', '0'] }, 'x')).toThrow();
  });

  it('writes decisions as JSON lines, and stays silent in tests unless LOG_LEVEL is set', () => {
    const lines: string[] = [];
    createLogger({ NODE_ENV: 'test' }, (line) => lines.push(line)).info('ignored');
    createLogger({ LOG_LEVEL: 'silent' }, (line) => lines.push(line)).info('ignored');
    createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'info' }, (line) => lines.push(line)).info('classification_decision', { ticket_id: 't-1' });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 'info', event: 'classification_decision', ticket_id: 't-1' });
  });
});
