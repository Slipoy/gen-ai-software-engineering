import { HttpError } from '../errors.js';

export const IMPORT_FORMATS = ['csv', 'json', 'xml'] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

/**
 * One record read from a file, already shaped like a create-ticket request
 * (e.g. CSV columns are turned into nested `metadata` and a `tags` array).
 * It is NOT validated yet: the same validator as `POST /tickets` checks it afterwards.
 */
export interface ParsedRecord {
  data: Record<string, unknown>;
  /** Where the record is in the file, for error messages: "line 7" for CSV, "ticket 3" for JSON/XML. */
  location: string;
}

/** The file itself cannot be read (broken syntax, wrong structure). Individual bad records are not this. */
export class ImportFormatError extends HttpError {
  constructor(format: ImportFormat, message: string) {
    super(400, 'Invalid import file', `Could not read ${format.toUpperCase()} file: ${message}`);
    this.name = 'ImportFormatError';
  }
}
