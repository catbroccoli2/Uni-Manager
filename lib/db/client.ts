import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from '@/db/schema';
import { resolveDatabasePath, resolveDatabaseUrl } from './path';
import { seedGradeBands } from './seed';

export type Database = LibSQLDatabase<typeof schema>;

/**
 * Next's dev server re-evaluates modules on every hot reload. Without a cache on
 * `globalThis`, each edit opens another libsql connection and runs migrations
 * again, and the process leaks file handles until it falls over. `globalThis`
 * survives module re-evaluation; a module-level `let` does not.
 */
const globalForDb = globalThis as unknown as {
  __uniManagerDb?: Database;
  __uniManagerReady?: Promise<void>;
};

function createDatabase(): Database {
  const file = resolveDatabasePath();

  // PRD.md §6.5: the database must come into existence on first run with no
  // setup step, so create the containing directory rather than expecting it.
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const client: Client = createClient({ url: resolveDatabaseUrl() });
  return drizzle(client, { schema });
}

export const db: Database = globalForDb.__uniManagerDb ?? createDatabase();
globalForDb.__uniManagerDb = db;

/**
 * Brings the database up to date: foreign keys on, migrations applied, grade
 * bands seeded.
 *
 * Every server-side entry point that reads or writes data awaits this first. The
 * promise is cached, so the work runs exactly once per process no matter how
 * many pages call it concurrently — awaiting a settled promise is free.
 */
export function ensureDatabaseReady(): Promise<void> {
  globalForDb.__uniManagerReady ??= initialise();
  return globalForDb.__uniManagerReady;
}

async function initialise(): Promise<void> {
  // SQLite ignores every FOREIGN KEY clause unless this is switched on, and it
  // is per-connection rather than stored in the file. Without it the
  // `onDelete: 'cascade'` rules in db/schema.ts are silently inert, and deleting
  // a semester would leave its units and assessments orphaned.
  await db.run('PRAGMA foreign_keys = ON');

  // Write-ahead logging: readers no longer block the writer. The dashboard reads
  // while an inline table edit writes, so this is a real win rather than a
  // reflex. It is persistent, so re-running it is a no-op.
  await db.run('PRAGMA journal_mode = WAL');

  await migrate(db, { migrationsFolder: path.join(process.cwd(), 'db', 'migrations') });
  await seedGradeBands(db);
}
