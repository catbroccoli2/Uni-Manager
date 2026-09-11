/**
 * Applies pending migrations from the command line (`npm run db:migrate`).
 *
 * This is the same `ensureDatabaseReady` the app calls on first request, not a
 * parallel implementation — running it here is only a convenience for applying a
 * migration without starting the dev server.
 */
// ../lib/db/client, not ../lib/db: the latter is guarded with `server-only`,
// which throws outside a React Server Component and would break this script.
import { ensureDatabaseReady } from '../lib/db/client';
import { resolveDatabasePath } from '../lib/db/path';

async function main(): Promise<void> {
  const file = resolveDatabasePath();
  console.log(`Migrating ${file}`);
  await ensureDatabaseReady();
  console.log('Up to date.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
