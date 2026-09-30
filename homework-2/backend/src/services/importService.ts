import { HttpError, type FieldError } from '../errors.js';
import { parseImportFile, type ImportFormat } from '../importers/index.js';
import { choosesClassification, validateNewTicket } from '../validators/ticketValidator.js';
import type { TicketService } from './ticketService.js';

/** Protects the server from a single request creating an unbounded number of tickets. */
export const MAX_IMPORT_RECORDS = 5000;

export interface ImportFailure {
  /** 1-based position of the record among all records in the file. */
  record: number;
  /** Human-readable position: "line 7" (CSV) or "ticket 3" (JSON/XML). */
  location: string;
  errors: FieldError[];
}

export interface ImportSummary {
  format: ImportFormat;
  total: number;
  successful: number;
  failed: number;
  created_ids: string[];
  failures: ImportFailure[];
}

/**
 * Bulk import. Valid records are created, invalid ones are reported and skipped
 * ("partial success"), so one typo does not throw away a whole file of good tickets.
 */
export class ImportService {
  constructor(private readonly tickets: TicketService) {}

  async importFile(format: ImportFormat, content: string, { autoClassify = false } = {}): Promise<ImportSummary> {
    // Throws ImportFormatError (400) when the file itself is unreadable.
    const records = parseImportFile(format, content);

    if (records.length === 0) {
      throw new HttpError(400, 'Empty import file', 'The file contains no tickets');
    }
    if (records.length > MAX_IMPORT_RECORDS) {
      throw new HttpError(
        413,
        'Too many records',
        `The file contains ${records.length} tickets; the limit is ${MAX_IMPORT_RECORDS} per import`,
      );
    }

    const summary: ImportSummary = { format, total: records.length, successful: 0, failed: 0, created_ids: [], failures: [] };

    // Sequential on purpose: keeps tickets in file order and avoids flooding the database in A7.
    for (const [index, { data, location }] of records.entries()) {
      const result = validateNewTicket(data);
      if (!result.ok) {
        summary.failures.push({ record: index + 1, location, errors: result.errors });
        continue;
      }
      // A category/priority given in the file counts as a decision made by the source system.
      const ticket = await this.tickets.create(result.value, { autoClassify, manualOverride: choosesClassification(data) });
      summary.created_ids.push(ticket.id);
    }

    summary.successful = summary.created_ids.length;
    summary.failed = summary.failures.length;
    return summary;
  }
}
