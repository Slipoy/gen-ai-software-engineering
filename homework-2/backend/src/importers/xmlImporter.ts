import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ImportFormatError, type ParsedRecord } from './types.js';

/**
 * Expected structure:
 *
 *   <tickets>
 *     <ticket>
 *       <customer_email>jane@example.com</customer_email>
 *       ...
 *       <tags><tag>login</tag><tag>vip</tag></tags>
 *       <metadata><source>email</source><device_type>mobile</device_type></metadata>
 *     </ticket>
 *   </tickets>
 */
const parser = new XMLParser({
  // Without this a single <ticket> or <tag> would become an object instead of a one-item array.
  isArray: (_name, jpath) => jpath === 'tickets.ticket' || jpath === 'tickets.ticket.tags.tag',
  // Keep every value as text ("00123" must not become 123); the validator decides what is valid.
  parseTagValue: false,
  trimValues: true,
  ignoreAttributes: true,
});

/** XML has no notion of an empty list, so `<tags/>` arrives as "" and `<tags><tag>a</tag></tags>` as { tag: [...] }. */
function normalizeTicket(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const ticket = { ...(raw as Record<string, unknown>) };

  if ('tags' in ticket) {
    const tags = ticket.tags;
    ticket.tags = tags === '' ? [] : typeof tags === 'object' && tags !== null && 'tag' in tags ? (tags as { tag: unknown }).tag : tags;
  }
  // An empty element such as <assigned_to/> means "no value".
  for (const [key, value] of Object.entries(ticket)) {
    if (value === '') delete ticket[key];
  }
  return ticket;
}

export function parseXml(content: string): ParsedRecord[] {
  const text = content.replace(/^﻿/, '');
  const validation = XMLValidator.validate(text);
  if (validation !== true) {
    throw new ImportFormatError('xml', `${validation.err.msg} (line ${validation.err.line})`);
  }

  let document: Record<string, unknown>;
  try {
    document = parser.parse(text);
  } catch (error) {
    // For example a DOCTYPE with external entities, which the parser refuses for security reasons (XXE).
    throw new ImportFormatError('xml', (error as Error).message);
  }

  const root = document.tickets;
  if (root === undefined) {
    throw new ImportFormatError('xml', 'expected a <tickets> root element');
  }
  // `<tickets></tickets>` parses to "" — a valid, empty file.
  const tickets = typeof root === 'object' && root !== null ? ((root as { ticket?: unknown[] }).ticket ?? []) : [];

  return tickets.map((ticket, index) => ({
    data: normalizeTicket(ticket) as Record<string, unknown>,
    location: `ticket ${index + 1}`,
  }));
}
