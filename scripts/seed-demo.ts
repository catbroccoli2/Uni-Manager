/**
 * Development-only sample data (`npm run db:seed:demo`).
 *
 * Shaped to exercise the cases that actually matter rather than to look tidy:
 * a unit mid-semester with marks back, a unit whose weightings do not sum to
 * 100, an overdue assessment, and a unit that is fully graded so the calculator
 * has to handle a locked result.
 *
 * Writes to whatever UNI_MANAGER_DB_PATH points at, so it can be aimed at a
 * scratch file instead of the real database.
 */
import { db, ensureDatabaseReady } from '../lib/db/client';
import { assessments, semesters, units } from '../db/schema';
import { addDaysIso, todayIso } from '../lib/dates';

async function main(): Promise<void> {
  await ensureDatabaseReady();

  const today = todayIso();

  const [semester] = await db
    .insert(semesters)
    .values({
      name: 'Semester 1 2026',
      year: 2026,
      status: 'current',
      startDate: addDaysIso(today, -42),
      endDate: addDaysIso(today, 49),
    })
    .returning();
  if (!semester) throw new Error('semester insert failed');

  const [past] = await db
    .insert(semesters)
    .values({ name: 'Semester 2 2025', year: 2025, status: 'past' })
    .returning();

  const [digi] = await db
    .insert(units)
    .values({
      semesterId: semester.id,
      code: 'BUSM2301',
      name: 'Business Digitilization',
      color: 'amber',
      creditPoints: 12,
    })
    .returning();

  const [stats] = await db
    .insert(units)
    .values({
      semesterId: semester.id,
      code: 'STAT1020',
      name: 'Statistical Reasoning',
      color: 'cyan',
      creditPoints: 12,
    })
    .returning();

  const [ethics] = await db
    .insert(units)
    .values({
      semesterId: semester.id,
      code: 'PHIL2044',
      name: 'Ethics and Technology',
      color: 'emerald',
      creditPoints: 6,
    })
    .returning();

  if (!digi || !stats || !ethics) throw new Error('unit insert failed');

  // Mid-semester: two graded, two outstanding, weightings sum to exactly 100.
  await db.insert(assessments).values([
    {
      unitId: digi.id,
      name: 'Assessment 1: Online Test',
      dueDate: addDaysIso(today, -28),
      type: 'individual',
      weighting: 10,
      mark: 17,
      maxMark: 20,
      completed: true,
      sortOrder: 0,
    },
    {
      unitId: digi.id,
      name: 'Assessment 2: Group Report',
      dueDate: addDaysIso(today, -7),
      type: 'group',
      weighting: 40,
      mark: 23,
      maxMark: 25,
      completed: true,
      sortOrder: 1,
    },
    {
      unitId: digi.id,
      name: 'Assessment 3: Presentation',
      dueDate: addDaysIso(today, 4),
      type: 'group',
      weighting: 20,
      mark: null,
      completed: false,
      sortOrder: 2,
    },
    {
      unitId: digi.id,
      name: 'Final Examination',
      dueDate: addDaysIso(today, 38),
      type: 'individual',
      weighting: 30,
      mark: null,
      completed: false,
      sortOrder: 3,
    },
  ]);

  // Weightings sum to 85: the §7 warning has to fire, and an overdue strip.
  await db.insert(assessments).values([
    {
      unitId: stats.id,
      name: 'Problem Set 1',
      dueDate: addDaysIso(today, -21),
      type: 'individual',
      weighting: 7.5,
      mark: 18,
      maxMark: 20,
      completed: true,
      sortOrder: 0,
    },
    {
      unitId: stats.id,
      name: 'Problem Set 2',
      dueDate: addDaysIso(today, -3),
      type: 'individual',
      weighting: 7.5,
      mark: null,
      completed: false,
      notes: 'Submitted late, waiting on the mark.',
      sortOrder: 1,
    },
    {
      unitId: stats.id,
      name: 'Mid-semester Test',
      dueDate: addDaysIso(today, 1),
      type: 'individual',
      weighting: 30,
      mark: null,
      completed: false,
      sortOrder: 2,
    },
    {
      unitId: stats.id,
      name: 'Final Examination',
      dueDate: addDaysIso(today, 45),
      type: 'individual',
      weighting: 40,
      mark: null,
      completed: false,
      sortOrder: 3,
    },
  ]);

  // Fully graded: the calculator's locked-achieved / locked-missed paths.
  await db.insert(assessments).values([
    {
      unitId: ethics.id,
      name: 'Essay 1',
      dueDate: addDaysIso(today, -35),
      type: 'individual',
      weighting: 30,
      mark: 16,
      maxMark: 20,
      completed: true,
      sortOrder: 0,
    },
    {
      unitId: ethics.id,
      name: 'Seminar Participation',
      dueDate: addDaysIso(today, -14),
      type: 'team-based',
      weighting: 20,
      mark: 34,
      maxMark: 40,
      completed: true,
      sortOrder: 1,
    },
    {
      unitId: ethics.id,
      name: 'Essay 2',
      dueDate: addDaysIso(today, -2),
      type: 'individual',
      weighting: 50,
      mark: 68,
      maxMark: 100,
      completed: true,
      sortOrder: 2,
    },
  ]);

  console.log(
    `Seeded: ${semester.name}${past ? ` and ${past.name}` : ''}, ` +
      '3 units, 11 assessments.',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
