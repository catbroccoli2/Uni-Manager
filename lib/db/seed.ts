import { sql } from 'drizzle-orm';
import { gradeBands, type NewGradeBand } from '@/db/schema';
import type { Database } from './client';

/**
 * The Australian bands from PRD.md §7, as defaults only — CLAUDE.md requires
 * these stay editable in settings, since thresholds vary by institution.
 *
 * Only the floor of each band is stored; see the comment on `gradeBands` in
 * db/schema.ts for why. 'N' anchors the bottom at 0 so that every possible score
 * resolves to some band and the lookup never returns undefined.
 */
export const DEFAULT_GRADE_BANDS: readonly NewGradeBand[] = [
  { code: 'HD', label: 'High Distinction', minScore: 80, gradePoint: 4, sortOrder: 0 },
  { code: 'D', label: 'Distinction', minScore: 70, gradePoint: 3, sortOrder: 1 },
  { code: 'C', label: 'Credit', minScore: 60, gradePoint: 2, sortOrder: 2 },
  { code: 'P', label: 'Pass', minScore: 50, gradePoint: 1, sortOrder: 3 },
  { code: 'N', label: 'Fail', minScore: 0, gradePoint: 0, sortOrder: 4 },
];

/**
 * Inserts the default bands on a fresh database.
 *
 * `onConflictDoNothing` on the unique `code` column means an edited band is
 * never reset: once a row for 'HD' exists, later startups leave whatever
 * threshold the user has saved. That makes this safe to run on every boot, which
 * in turn means there is no separate "did we seed yet?" flag to get out of sync.
 */
export async function seedGradeBands(db: Database): Promise<void> {
  await db
    .insert(gradeBands)
    .values([...DEFAULT_GRADE_BANDS])
    .onConflictDoNothing({ target: gradeBands.code });
}

/** Restores the PRD.md §7 defaults, discarding any edits. Used by settings. */
export async function resetGradeBands(db: Database): Promise<void> {
  await db.delete(gradeBands);
  await db.insert(gradeBands).values([...DEFAULT_GRADE_BANDS]);
  // Keep autoincrement ids from climbing forever across repeated resets.
  await db.run(sql`DELETE FROM sqlite_sequence WHERE name = 'grade_bands'`);
}
