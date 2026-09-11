import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Absolute path to the SQLite file.
 *
 * The default deliberately sits OUTSIDE this repo. The project folder lives in
 * OneDrive, and file-sync tools are actively dangerous for a live SQLite
 * database: SQLite's durability guarantees assume it is the only thing touching
 * the `.db`, `.db-wal` and `.db-shm` files. A sync client races the writer for
 * all three and can restore a stale copy of one but not the others, which
 * SQLite then reads as a torn database. The failure mode is silent corruption,
 * not a helpful error.
 *
 * Set UNI_MANAGER_DB_PATH to put the file anywhere else — including back at
 * ./data/unit-manager.db, as PRD.md §10 describes, if this repo ever moves off
 * a synced drive.
 */
export function resolveDatabasePath(): string {
  const override = process.env.UNI_MANAGER_DB_PATH?.trim();
  if (override) return path.resolve(override);
  return path.join(os.homedir(), '.unimanager', 'unit-manager.db');
}

/**
 * The same location as a `file:` URL, which is what libsql's client expects.
 *
 * Built with pathToFileURL rather than string concatenation because Windows
 * paths (`C:\Users\...`) need drive-letter and separator handling that naive
 * `'file:' + p` gets wrong.
 */
export function resolveDatabaseUrl(): string {
  return pathToFileURL(resolveDatabasePath()).href;
}
