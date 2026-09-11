import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseUrl } from './lib/db/path';

/**
 * Used by `npm run db:generate` to diff db/schema.ts and emit SQL into
 * db/migrations.
 *
 * Applying those migrations is deliberately NOT drizzle-kit's job here — see
 * lib/db/index.ts. The app has to be able to migrate itself on first run to meet
 * PRD.md §6.5's "zero setup" requirement, and once that code exists, having the
 * CLI apply migrations by a second, separate mechanism just creates two paths
 * that can disagree about what state the database is in.
 */
export default defineConfig({
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: resolveDatabaseUrl(),
  },
  // Column names in db/schema.ts are written out explicitly in snake_case, so no
  // automatic casing conversion is wanted.
  casing: 'snake_case',
  strict: true,
  verbose: true,
});
