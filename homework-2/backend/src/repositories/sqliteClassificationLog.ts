import { asc, eq, sql } from 'drizzle-orm';
import type { AppDatabase } from '../db/client.js';
import { classificationDecisions } from '../db/schema.js';
import type { ClassificationDecision } from '../models/classification.js';
import type { ClassificationLog } from './classificationLog.js';

/** ClassificationLog backed by the `classification_decisions` table. */
export class SqliteClassificationLog implements ClassificationLog {
  constructor(private readonly db: AppDatabase) {}

  async append(decision: ClassificationDecision): Promise<void> {
    this.db.insert(classificationDecisions).values(decision).run();
  }

  async listByTicket(ticketId: string): Promise<ClassificationDecision[]> {
    return this.db
      .select()
      .from(classificationDecisions)
      .where(eq(classificationDecisions.ticket_id, ticketId))
      // rowid keeps insertion order for decisions logged within the same millisecond.
      .orderBy(asc(classificationDecisions.at), asc(sql`rowid`))
      .all();
  }
}
