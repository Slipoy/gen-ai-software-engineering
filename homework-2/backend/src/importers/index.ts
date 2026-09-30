import { HttpError } from '../errors.js';
import { parseCsv } from './csvImporter.js';
import { parseJson } from './jsonImporter.js';
import { IMPORT_FORMATS, type ImportFormat, type ParsedRecord } from './types.js';
import { parseXml } from './xmlImporter.js';

export { IMPORT_FORMATS, ImportFormatError, type ImportFormat, type ParsedRecord } from './types.js';

const PARSERS: Record<ImportFormat, (content: string) => ParsedRecord[]> = {
  csv: parseCsv,
  json: parseJson,
  xml: parseXml,
};

const MIME_TYPES: Record<string, ImportFormat> = {
  'text/csv': 'csv',
  'application/csv': 'csv',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
};

const isFormat = (value: string): value is ImportFormat => (IMPORT_FORMATS as readonly string[]).includes(value);

/**
 * Decides which parser to use, most explicit hint first:
 * 1. `?format=csv` in the URL,
 * 2. the file extension (`tickets.xml`),
 * 3. the MIME type the browser sent (often generic, e.g. application/octet-stream, so it comes last).
 */
export function detectFormat(hints: { format?: unknown; filename?: string; mimeType?: string }): ImportFormat {
  if (hints.format !== undefined) {
    const format = String(hints.format).toLowerCase();
    if (isFormat(format)) return format;
    throw new HttpError(400, 'Unsupported format', `format must be one of: ${IMPORT_FORMATS.join(', ')}`);
  }

  const extension = hints.filename?.split('.').pop()?.toLowerCase();
  if (extension && isFormat(extension)) return extension;

  const byMime = hints.mimeType && MIME_TYPES[hints.mimeType.split(';')[0]!.trim().toLowerCase()];
  if (byMime) return byMime;

  throw new HttpError(
    400,
    'Unsupported format',
    `Cannot tell the file format. Use a .csv, .json or .xml file, or pass ?format=${IMPORT_FORMATS.join('|')}`,
  );
}

export function parseImportFile(format: ImportFormat, content: string): ParsedRecord[] {
  return PARSERS[format](content);
}
