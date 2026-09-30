/** Runtime settings, read once from environment variables with safe defaults. */
export interface Config {
  port: number;
  /** SQLite file path, relative to the working directory, or ':memory:' for a throwaway database. */
  dbPath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${env.PORT}"`);
  }
  const dbPath = env.DB_PATH?.trim() || 'data/tickets.db';
  return { port, dbPath };
}
