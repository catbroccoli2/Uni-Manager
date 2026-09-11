import { and, asc, count, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '@/lib/db';
import {
  assessments,
  contentSources,
  gradeBands,
  semesters,
  timetableEntries,
  units,
  type Assessment,
  type ContentSource,
  type GradeBand,
  type Semester,
  type TimetableEntry,
  type Unit,
} from '@/db/schema';
import { todayIso, addDaysIso } from '@/lib/dates';

/**
 * Every read goes through here so that `ensureDatabaseReady()` is awaited
 * exactly once per entry point. Pages call these rather than touching `db`
 * directly, which keeps the "did we migrate yet?" question in one place
 * instead of at the top of every route.
 */

export interface SemesterWithCounts extends Semester {
  unitCount: number;
}

export async function listSemesters(): Promise<SemesterWithCounts[]> {
  await ensureDatabaseReady();

  const rows = await db
    .select({
      semester: semesters,
      unitCount: count(units.id),
    })
    .from(semesters)
    .leftJoin(units, eq(units.semesterId, semesters.id))
    .groupBy(semesters.id)
    // Newest first, but the semester being studied right now always leads.
    .orderBy(
      sql`case ${semesters.status} when 'current' then 0 when 'upcoming' then 1 else 2 end`,
      desc(semesters.year),
      asc(semesters.name),
    );

  return rows.map((row) => ({ ...row.semester, unitCount: row.unitCount }));
}

export async function getSemester(id: number): Promise<Semester | null> {
  await ensureDatabaseReady();
  const [row] = await db.select().from(semesters).where(eq(semesters.id, id)).limit(1);
  return row ?? null;
}

/** A unit plus the figures the calculator needs, without loading every row twice. */
export interface UnitWithAssessments extends Unit {
  assessments: Assessment[];
}

export async function getSemesterUnits(semesterId: number): Promise<UnitWithAssessments[]> {
  await ensureDatabaseReady();

  const unitRows = await db
    .select()
    .from(units)
    .where(eq(units.semesterId, semesterId))
    .orderBy(asc(units.code), asc(units.name));

  if (unitRows.length === 0) return [];

  // One query for every assessment across the semester's units, grouped in
  // memory. A per-unit query inside the render loop would be N+1.
  const unitIds = unitRows.map((unit) => unit.id);
  const assessmentRows = await db
    .select()
    .from(assessments)
    .where(sql`${assessments.unitId} in ${unitIds}`)
    .orderBy(asc(assessments.sortOrder), asc(assessments.id));

  const byUnit = new Map<number, Assessment[]>();
  for (const row of assessmentRows) {
    const list = byUnit.get(row.unitId);
    if (list) list.push(row);
    else byUnit.set(row.unitId, [row]);
  }

  return unitRows.map((unit) => ({ ...unit, assessments: byUnit.get(unit.id) ?? [] }));
}

export interface UnitDetail extends UnitWithAssessments {
  semester: Semester;
}

export async function getUnit(id: number): Promise<UnitDetail | null> {
  await ensureDatabaseReady();

  const [row] = await db
    .select({ unit: units, semester: semesters })
    .from(units)
    .innerJoin(semesters, eq(units.semesterId, semesters.id))
    .where(eq(units.id, id))
    .limit(1);

  if (!row) return null;

  const assessmentRows = await db
    .select()
    .from(assessments)
    .where(eq(assessments.unitId, id))
    .orderBy(asc(assessments.sortOrder), asc(assessments.id));

  return { ...row.unit, semester: row.semester, assessments: assessmentRows };
}

/** An assessment carrying enough of its unit to render a strip on the board. */
export interface DueAssessment extends Assessment {
  unitId: number;
  unitName: string;
  unitCode: string | null;
  unitColor: Unit['color'];
  semesterName: string;
}

/**
 * PRD.md §6.3: everything due in the next N days across all units, plus
 * anything already overdue.
 *
 * Overdue is deliberately unbounded in the past. An assessment that slipped
 * three weeks ago is the most urgent thing on the board, and a window that
 * quietly drops it would be worse than not having a board at all.
 */
export async function getDueAssessments(windowDays: number): Promise<DueAssessment[]> {
  await ensureDatabaseReady();

  const horizon = addDaysIso(todayIso(), windowDays);

  const rows = await db
    .select({ assessment: assessments, unit: units, semester: semesters })
    .from(assessments)
    .innerJoin(units, eq(assessments.unitId, units.id))
    .innerJoin(semesters, eq(units.semesterId, semesters.id))
    .where(
      and(
        eq(assessments.completed, false),
        isNotNull(assessments.dueDate),
        lte(assessments.dueDate, horizon),
      ),
    )
    .orderBy(asc(assessments.dueDate), asc(units.code));

  return rows.map((row) => ({
    ...row.assessment,
    unitId: row.unit.id,
    unitName: row.unit.name,
    unitCode: row.unit.code,
    unitColor: row.unit.color,
    semesterName: row.semester.name,
  }));
}

/**
 * A unit's class times and readings.
 *
 * These tables have been in the schema since the first migration but had no UI
 * until the outline import could write to them. Reading them here keeps
 * imported rows visible rather than leaving them in the database unseen.
 */
export async function getUnitExtras(unitId: number): Promise<{
  timetable: TimetableEntry[];
  sources: ContentSource[];
}> {
  await ensureDatabaseReady();

  const [timetable, sources] = await Promise.all([
    db
      .select()
      .from(timetableEntries)
      .where(eq(timetableEntries.unitId, unitId))
      .orderBy(asc(timetableEntries.dayOfWeek), asc(timetableEntries.startTime)),
    db
      .select()
      .from(contentSources)
      .where(eq(contentSources.unitId, unitId))
      .orderBy(asc(contentSources.title)),
  ]);

  return { timetable, sources };
}

export async function listGradeBands(): Promise<GradeBand[]> {
  await ensureDatabaseReady();
  return db.select().from(gradeBands).orderBy(asc(gradeBands.sortOrder));
}

/** Units in the current semester, for the board's standing summary. */
export async function getCurrentSemesterUnits(): Promise<{
  semester: Semester | null;
  units: UnitWithAssessments[];
}> {
  await ensureDatabaseReady();

  const [current] = await db
    .select()
    .from(semesters)
    .where(eq(semesters.status, 'current'))
    .orderBy(desc(semesters.year))
    .limit(1);

  if (!current) return { semester: null, units: [] };
  return { semester: current, units: await getSemesterUnits(current.id) };
}

