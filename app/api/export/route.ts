import { asc } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '@/lib/db';
import {
  assessments,
  contentSources,
  gradeBands,
  semesters,
  timetableEntries,
  units,
} from '@/db/schema';
import { todayIso } from '@/lib/dates';

/**
 * PRD.md §6.6: one-click export of everything to JSON.
 *
 * A route handler rather than a Server Action, which is the one place the
 * Server-Actions decision does not reach: an action returns a value to the
 * client, it cannot return a response carrying Content-Disposition, and a
 * download is exactly a response with Content-Disposition.
 *
 * Every table is included, Phase 2's content sources and timetable entries as
 * well, because a backup that quietly omits a table is not a backup. There is
 * no import counterpart — §6.6 asks for export only.
 */

/** Bumped only when the shape changes in a way an importer would need to know. */
const SCHEMA_VERSION = 1;

export async function GET(): Promise<Response> {
  await ensureDatabaseReady();

  const [
    semesterRows,
    unitRows,
    assessmentRows,
    contentSourceRows,
    timetableRows,
    bandRows,
  ] = await Promise.all([
    db.select().from(semesters).orderBy(asc(semesters.id)),
    db.select().from(units).orderBy(asc(units.id)),
    db.select().from(assessments).orderBy(asc(assessments.id)),
    db.select().from(contentSources).orderBy(asc(contentSources.id)),
    db.select().from(timetableEntries).orderBy(asc(timetableEntries.id)),
    db.select().from(gradeBands).orderBy(asc(gradeBands.sortOrder)),
  ]);

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      semesters: semesterRows.length,
      units: unitRows.length,
      assessments: assessmentRows.length,
      contentSources: contentSourceRows.length,
      timetableEntries: timetableRows.length,
      gradeBands: bandRows.length,
    },
    semesters: semesterRows,
    units: unitRows,
    assessments: assessmentRows,
    contentSources: contentSourceRows,
    timetableEntries: timetableRows,
    gradeBands: bandRows,
  };

  // Pretty-printed: this is a personal backup a human may well open and read,
  // and the size difference is irrelevant at one student's scale.
  const body = JSON.stringify(payload, null, 2);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="uni-manager-${todayIso()}.json"`,
      // A backup must never come from a cache.
      'Cache-Control': 'no-store',
    },
  });
}
