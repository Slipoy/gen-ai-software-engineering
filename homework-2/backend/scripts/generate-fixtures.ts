/**
 * Generates the sample data files in tests/fixtures/.
 *
 *   npm run generate:fixtures
 *
 * The output is deterministic: a seeded random generator means the same files come out on every run,
 * so regenerating never produces a noisy diff, and tests can rely on exact contents.
 *
 * Each ticket is built from a hand-written template that knows its intended category and priority.
 * Those labels are written into the files, and the classifier accuracy test compares its own
 * result with them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Category, DeviceType, Priority, Source, Status } from '../src/models/ticket.js';

export const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures');

/** mulberry32: a tiny seeded PRNG. Math.random() cannot be seeded, so it would change the files every run. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Template {
  category: Category;
  subject: string;
  description: string;
  tags: string[];
  /** Fixed priority for templates whose text already implies one (a typo is never urgent). */
  priority?: Priority;
}

const TEMPLATES: Template[] = [
  // account_access
  { category: 'account_access', subject: 'Cannot log in after password reset', description: 'I reset my password this morning, but the login page still says my credentials are invalid.', tags: ['login', 'password'] },
  { category: 'account_access', subject: '2FA code never arrives', description: 'The verification code SMS for two-factor authentication never reaches my phone, so I am locked out.', tags: ['2fa'] },
  { category: 'account_access', subject: 'Account locked after several attempts', description: 'My account is locked after a few failed sign in attempts. How long do I have to wait to log in again?', tags: ['login', 'locked'] },
  { category: 'account_access', subject: 'SSO login redirects in a loop', description: 'When I sign in with single sign-on, the page keeps redirecting back to the login screen.', tags: ['sso', 'login'] },
  { category: 'account_access', subject: 'Password reset email not received', description: 'I requested a password reset link three times, but no email has arrived, not even in spam.', tags: ['password', 'email'] },
  // technical_issue
  { category: 'technical_issue', subject: 'App crashes on startup', description: 'The mobile app crashes every time I open it. It shows the splash screen and then closes.', tags: ['crash', 'mobile'] },
  { category: 'technical_issue', subject: 'Dashboard does not load', description: 'The dashboard is stuck on a blank page and the browser console shows a timeout error.', tags: ['dashboard'] },
  { category: 'technical_issue', subject: 'Calendar sync stopped working', description: 'The calendar sync with our Google account stopped working yesterday; new events no longer appear.', tags: ['sync', 'calendar'] },
  { category: 'technical_issue', subject: 'Uploads fail with an error', description: 'Every file upload fails with an error message saying the server is unavailable. Nothing gets saved.', tags: ['upload'] },
  { category: 'technical_issue', subject: 'Reports page is very slow', description: 'The reports page takes more than a minute to open and often freezes the browser tab.', tags: ['performance', 'reports'] },
  // billing_question
  { category: 'billing_question', subject: 'Charged twice this month', description: 'I see two charges on my credit card for the same subscription this month. Please refund one of them.', tags: ['billing', 'refund'] },
  { category: 'billing_question', subject: 'Invoice shows the wrong company name', description: 'Our latest invoice has the old company name on it. We need a corrected invoice for accounting.', tags: ['invoice'] },
  { category: 'billing_question', subject: 'Question about annual plan pricing', description: 'What is the price difference between the monthly and the annual plan, and can we switch mid-year?', tags: ['pricing', 'plan'] },
  { category: 'billing_question', subject: 'Refund for cancelled subscription', description: 'I cancelled my subscription last week but was still billed for the next month. Can I get a refund?', tags: ['refund', 'subscription'] },
  { category: 'billing_question', subject: 'Payment method update failed', description: 'I tried to update the card used for payment, but the billing page does not save the new card.', tags: ['payment', 'card'] },
  // feature_request
  { category: 'feature_request', subject: 'Dark mode for the web app', description: 'It would be great to have a dark mode in the web app. Many of us work late and the white screen is tiring.', tags: ['ui', 'dark-mode'] },
  { category: 'feature_request', subject: 'Export reports to PDF', description: 'We would like to export reports to PDF so we can attach them to our monthly management summary.', tags: ['reports', 'export'] },
  { category: 'feature_request', subject: 'Integration with Slack', description: 'Please add an integration with Slack so new ticket updates can be posted to our team channel.', tags: ['integration', 'slack'] },
  { category: 'feature_request', subject: 'Bulk edit for contacts', description: 'It would be nice to edit several contacts at once. An improvement like this would save us hours.', tags: ['contacts'] },
  { category: 'feature_request', subject: 'Custom fields on tickets', description: 'Could you add support for custom fields on tickets? We need to track the contract number.', tags: ['tickets', 'customization'] },
  // bug_report
  { category: 'bug_report', subject: 'Export button does nothing', description: 'Steps to reproduce:\n1. Open Reports\n2. Click Export\nExpected result: a CSV download. Actual result: nothing happens.', tags: ['export', 'reports'] },
  { category: 'bug_report', subject: 'Date picker shows the wrong month', description: 'Since the last update the date picker opens on the previous month. Steps to reproduce: open any form with a date field.', tags: ['date-picker', 'regression'] },
  { category: 'bug_report', subject: 'Search ignores the status filter', description: 'To reproduce: filter tickets by status Closed and search for any word. Expected: only closed tickets. Actual: all tickets.', tags: ['search', 'filters'] },
  { category: 'bug_report', subject: 'Avatar upload rotates photos', description: 'Steps to reproduce: upload a portrait photo taken on a phone. Expected behavior: upright avatar. Actual behavior: rotated 90 degrees.', tags: ['avatar'] },
  { category: 'bug_report', subject: 'Typo on the settings page', description: 'There is a typo in the heading of the notification settings page: it says Notifcations.', tags: ['typo', 'ui'], priority: 'low' },
  // other
  { category: 'other', subject: 'Question about your office hours', description: 'What are the opening hours of your support team during public holidays?', tags: ['general'] },
  { category: 'other', subject: 'Partnership inquiry', description: 'We are a consulting company and would be interested in becoming a reseller. Who should we talk to?', tags: ['sales'] },
  { category: 'other', subject: 'Thank you for the quick help', description: 'Just wanted to say thank you to Maria from your team for solving our issue so quickly yesterday.', tags: ['feedback'] },
  { category: 'other', subject: 'Request for a product demo', description: 'Our new team lead asks for a short product demo for the whole department next week.', tags: ['demo'] },
  { category: 'other', subject: 'Where can I find your GDPR documents?', description: 'Our legal team asks for your data processing agreement and a list of sub-processors.', tags: ['legal'] },
];

/** Sentences appended to push the priority, using the keywords from the assignment's priority rules. */
const PRIORITY_SUFFIX: Record<Priority, string[]> = {
  urgent: ['This is critical for our business.', 'Please treat this as urgent.', 'We see this as a security concern.'],
  high: ['This is blocking our team.', 'Please help ASAP.', 'This is important for tomorrow.'],
  medium: ['', 'Thanks in advance.', 'Let me know if you need more details.'],
  low: ['It is only a minor issue.', 'No rush, this is minor.', 'Just a suggestion.'],
};

const FIRST_NAMES = ['Anna', 'Ben', 'Carla', 'David', 'Elena', 'Farid', 'Grace', 'Hugo', 'Ines', 'Jonas', 'Kira', 'Liam', 'Maya', 'Noah', 'Olga', 'Pavel', 'Rosa', 'Sven', 'Tara', 'Yuki'];
const LAST_NAMES = ['Keller', 'Novak', 'Rossi', 'Schmidt', 'Moreau', 'Silva', 'Kowalski', 'Jensen', 'Ortiz', 'Tanaka', 'Weber', 'Fischer'];
const DOMAINS = ['example.com', 'acme.test', 'northwind.example', 'contoso.example'];
const AGENTS = ['agent.smith', 'agent.jones', 'agent.garcia'];
const SOURCES: Source[] = ['web_form', 'email', 'api', 'chat', 'phone'];
const DEVICES: DeviceType[] = ['desktop', 'mobile', 'tablet'];
const BROWSERS = ['Chrome 128', 'Firefox 130', 'Safari 17', 'Edge 128'];
const STATUSES: [Status, number][] = [['new', 5], ['in_progress', 3], ['waiting_customer', 1], ['resolved', 1], ['closed', 1]];
const PRIORITIES: [Priority, number][] = [['urgent', 2], ['high', 3], ['medium', 4], ['low', 2]];

export interface SampleTicket {
  customer_id: string;
  customer_email: string;
  customer_name: string;
  subject: string;
  description: string;
  category: Category;
  priority: Priority;
  status: Status;
  assigned_to: string | null;
  tags: string[];
  metadata: { source: Source; browser: string | null; device_type: DeviceType };
}

function makeTickets(count: number, seed: number, idPrefix: string): SampleTicket[] {
  const random = seededRandom(seed);
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const weighted = <T>(items: [T, number][]) => {
    let roll = random() * items.reduce((sum, [, w]) => sum + w, 0);
    for (const [item, weight] of items) if ((roll -= weight) < 0) return item;
    return items[0]![0];
  };

  return Array.from({ length: count }, (_, index) => {
    // Walk the templates in order so every category is represented, then vary everything else.
    const template = TEMPLATES[(index * 7) % TEMPLATES.length]!;
    const priority = template.priority ?? weighted(PRIORITIES);
    const suffix = template.priority ? '' : pick(PRIORITY_SUFFIX[priority]);
    const status = weighted(STATUSES);
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const source = pick(SOURCES);
    const device = pick(DEVICES);

    return {
      customer_id: `${idPrefix}-${String(index + 1).padStart(4, '0')}`,
      customer_email: `${first}.${last}@${pick(DOMAINS)}`.toLowerCase(),
      customer_name: `${first} ${last}`,
      subject: template.subject,
      description: suffix ? `${template.description} ${suffix}` : template.description,
      category: template.category,
      priority,
      status,
      assigned_to: status === 'new' ? null : pick(AGENTS),
      tags: template.tags,
      // Phone and email tickets have no browser.
      metadata: { source, browser: source === 'phone' || source === 'email' ? null : pick(BROWSERS), device_type: device },
    };
  });
}

// ---------- writers ----------

const CSV_COLUMNS = [
  'customer_id', 'customer_email', 'customer_name', 'subject', 'description', 'category', 'priority', 'status',
  'assigned_to', 'tags', 'metadata_source', 'metadata_browser', 'metadata_device_type',
] as const;

/** RFC 4180: quote a cell when it contains a comma, a quote or a line break; double inner quotes. */
const csvCell = (value: string | null) => {
  const text = value ?? '';
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

function toCsv(tickets: SampleTicket[]): string {
  const rows = tickets.map((t) =>
    [
      t.customer_id, t.customer_email, t.customer_name, t.subject, t.description, t.category, t.priority, t.status,
      t.assigned_to, t.tags.join(';'), t.metadata.source, t.metadata.browser, t.metadata.device_type,
    ].map(csvCell).join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

const xmlEscape = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function toXml(tickets: SampleTicket[]): string {
  const element = (name: string, value: string | null, indent: string) =>
    value === null ? `${indent}<${name}/>` : `${indent}<${name}>${xmlEscape(value)}</${name}>`;

  const body = tickets.map((t) => {
    const i = '    ';
    return [
      '  <ticket>',
      element('customer_id', t.customer_id, i),
      element('customer_email', t.customer_email, i),
      element('customer_name', t.customer_name, i),
      element('subject', t.subject, i),
      element('description', t.description, i),
      element('category', t.category, i),
      element('priority', t.priority, i),
      element('status', t.status, i),
      element('assigned_to', t.assigned_to, i),
      `${i}<tags>${t.tags.map((tag) => `<tag>${xmlEscape(tag)}</tag>`).join('')}</tags>`,
      `${i}<metadata>`,
      element('source', t.metadata.source, `${i}  `),
      element('browser', t.metadata.browser, `${i}  `),
      element('device_type', t.metadata.device_type, `${i}  `),
      `${i}</metadata>`,
      '  </ticket>',
    ].join('\n');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<tickets>\n${body.join('\n')}\n</tickets>\n`;
}

// ---------- invalid data for negative tests ----------

/** Two valid records around records that each break exactly one rule, so the expected failures are obvious. */
function invalidRecords(): Record<string, unknown>[] {
  const [a, b] = makeTickets(2, 99, 'INV');
  const base = { ...a! };
  return [
    a!,
    { ...base, customer_id: 'INV-BAD-EMAIL', customer_email: 'not-an-email' },
    { ...base, customer_id: 'INV-SHORT', description: 'Too short' },
    { ...base, customer_id: 'INV-ENUM', priority: 'critical', category: 'billing' },
    { ...base, customer_id: 'INV-MISSING', subject: '' },
    b!,
  ];
}

/** Builds every fixture file in memory: file name → content. */
export function buildFixtures(): Record<string, string> {
  const invalid = invalidRecords() as unknown as SampleTicket[];
  return {
    // Different seeds and id prefixes, so the three files do not contain the same customers.
    'sample_tickets.csv': toCsv(makeTickets(50, 1, 'CSV')),
    'sample_tickets.json': JSON.stringify(makeTickets(20, 2, 'JSON'), null, 2) + '\n',
    'sample_tickets.xml': toXml(makeTickets(30, 3, 'XML')),

    'invalid_tickets.csv': toCsv(invalid),
    'invalid_tickets.json': JSON.stringify(invalid, null, 2) + '\n',
    'invalid_tickets.xml': toXml(invalid),

    // Files that cannot be parsed at all.
    'malformed.csv': 'customer_id,customer_email,subject\nC-1,"jane@example.com,Unclosed quote\n',
    'malformed.json': '[{"customer_id": "C-1", "customer_email": "jane@example.com",\n',
    'malformed.xml': '<tickets>\n  <ticket><subject>Missing closing tags</ticket>\n</tickets>\n',
    'wrong_structure.json': '{"data": {"items": []}}\n',
    'header_only.csv': `${CSV_COLUMNS.join(',')}\n`,
  };
}

function main() {
  mkdirSync(FIXTURES_DIR, { recursive: true });
  console.log(`Writing fixtures to ${FIXTURES_DIR}`);
  for (const [name, content] of Object.entries(buildFixtures())) {
    writeFileSync(join(FIXTURES_DIR, name), content);
    console.log(`  ${name.padEnd(24)} ${content.length.toLocaleString('en')} bytes`);
  }
}

// Run only when executed as a script, not when a test imports buildFixtures().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
