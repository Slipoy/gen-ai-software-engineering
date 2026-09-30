import { parse } from 'csv-parse/sync';
import { ImportFormatError, type ParsedRecord } from './types.js';

const METADATA_PREFIX = 'metadata_';
const TAG_SEPARATOR = ';';

/**
 * Turns one flat CSV row into the nested shape the validator expects.
 *
 * CSV has no nesting or arrays, so the file format is:
 * - `tags` holds tags separated by ";"            → tags: ["a", "b"]
 * - `metadata_source`, `metadata_browser`, ...     → metadata: { source, browser, ... }
 * - an empty cell means "not provided", so defaults apply (CSV cannot tell "" from missing)
 */
export function csvRowToTicket(row: Record<string, string>): Record<string, unknown> {
  const ticket: Record<string, unknown> = {};
  const metadata: Record<string, unknown> = {};

  for (const [column, rawValue] of Object.entries(row)) {
    const value = rawValue.trim();
    if (value === '') continue;

    if (column.startsWith(METADATA_PREFIX)) {
      metadata[column.slice(METADATA_PREFIX.length)] = value;
    } else if (column === 'tags') {
      ticket.tags = value.split(TAG_SEPARATOR).map((tag) => tag.trim()).filter(Boolean);
    } else {
      ticket[column] = value;
    }
  }

  if (Object.keys(metadata).length > 0) ticket.metadata = metadata;
  return ticket;
}

export function parseCsv(content: string): ParsedRecord[] {
  let rows: { record: Record<string, string>; info: { lines: number } }[];
  try {
    rows = parse(content, {
      columns: (header: string[]) => header.map((name) => name.trim().toLowerCase()),
      bom: true, // Excel adds a byte-order mark to UTF-8 CSV files
      skip_empty_lines: true,
      info: true,
    });
  } catch (error) {
    throw new ImportFormatError('csv', (error as Error).message);
  }

  return rows.map(({ record, info }) => ({
    data: csvRowToTicket(record),
    location: `line ${info.lines}`,
  }));
}
