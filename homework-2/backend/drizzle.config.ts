import { defineConfig } from 'drizzle-kit';

/**
 * Configuration for drizzle-kit, the migration generator (a development tool, not used at runtime).
 * `npm run db:generate` reads the schema and writes SQL migration files into ./drizzle.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
