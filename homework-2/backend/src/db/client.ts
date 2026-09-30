import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type AppDatabase = BetterSQLite3Database<typeof schema>;

/** ./drizzle next to package.json. Same relative path from src/db (dev) and dist/db (build). */
const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle');

export interface DatabaseHandle {
  db: AppDatabase;
  close(): void;
}

/**
 * Opens (or creates) the SQLite database and brings its schema up to date.
 * Pass ':memory:' for a throwaway database that lives only as long as the process (used by tests).
 */
export function openDatabase(path: string): DatabaseHandle {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  // WAL lets reads continue while a write is in progress, and is faster for this kind of workload.
  sqlite.pragma('journal_mode = WAL');
  // Wait up to 5 s for a lock instead of failing immediately with SQLITE_BUSY.
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite, { schema });
  // Applies every migration in ./drizzle that this database has not seen yet (tracked in __drizzle_migrations).
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return { db, close: () => sqlite.close() };
}
