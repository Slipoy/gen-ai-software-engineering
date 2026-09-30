import { ImportFormatError, type ParsedRecord } from './types.js';

/**
 * Accepts either a top-level array of tickets or an object wrapping it: `{ "tickets": [...] }`.
 * JSON already has the right shape (nested metadata, tags array), so records pass through as-is.
 */
export function parseJson(content: string): ParsedRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.replace(/^﻿/, ''));
  } catch (error) {
    throw new ImportFormatError('json', (error as Error).message);
  }

  const items =
    Array.isArray(parsed) ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { tickets?: unknown }).tickets)
      ? (parsed as { tickets: unknown[] }).tickets
      : undefined;

  if (!items) {
    throw new ImportFormatError('json', 'expected an array of tickets or an object with a "tickets" array');
  }

  // A non-object item (e.g. a number) is passed on unchanged; the validator reports it for that record.
  return items.map((item, index) => ({
    data: item as Record<string, unknown>,
    location: `ticket ${index + 1}`,
  }));
}
