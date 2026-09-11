/**
 * The database entry point for everything inside the Next.js app.
 *
 * `server-only` makes importing this from a client component a build error
 * rather than a runtime surprise — without it, a stray import would try to
 * bundle libsql (and the database path, and the schema) into the browser.
 *
 * The actual implementation lives in ./client, unguarded, because `server-only`
 * throws under plain Node: the package resolves to a throwing module outside
 * React Server Components, which would take down `npm run db:migrate` and any
 * other CLI script. Scripts import ./client directly; app code imports this.
 */
import 'server-only';

export { db, ensureDatabaseReady, type Database } from './client';
