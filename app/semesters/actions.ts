'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '@/lib/db';
import { SEMESTER_STATUSES, semesters } from '@/db/schema';
import {
  failure,
  oneOf,
  optionalText,
  requiredId,
  requiredNumber,
  requiredText,
  type ActionResult,
} from '@/lib/form';
import { isValidIsoDate } from '@/lib/dates';

/**
 * Mutations live in Server Actions rather than under app/api/, a deliberate
 * departure from CLAUDE.md's convention agreed with the user: the inline
 * assessment table needs optimistic updates without a fetch round-trip, and
 * running one entity through actions and another through REST would be worse
 * than picking one. The export endpoint stays a route handler, because it
 * returns a file download and an action cannot.
 */

/** A malformed value from a date input is treated as "not set" rather than an error. */
function readDate(form: FormData, field: string): string | null {
  const value = optionalText(form, field);
  if (value === null || !isValidIsoDate(value)) return null;
  return value;
}

/**
 * Only one semester may be 'current'. Enforced here rather than with a partial
 * unique index because the intent on save is "make this one current", not
 * "reject this because another one is" — a constraint would turn the natural
 * action into an error the user has to resolve by hand.
 */
async function demoteOtherCurrentSemesters(keepId: number): Promise<void> {
  await db
    .update(semesters)
    .set({ status: 'past' })
    // and(), not JavaScript &&: `a && b` on two SQL condition objects evaluates
    // to b alone, which would silently archive every other semester.
    .where(and(eq(semesters.status, 'current'), ne(semesters.id, keepId)));
}

export async function createSemester(form: FormData): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const name = requiredText(form, 'name', 'Semester name');
    const year = requiredNumber(form, 'year', 'Year');
    const status = oneOf(form, 'status', SEMESTER_STATUSES, 'upcoming');

    const [created] = await db
      .insert(semesters)
      .values({
        name,
        year,
        status,
        startDate: readDate(form, 'startDate'),
        endDate: readDate(form, 'endDate'),
      })
      .returning();

    if (created && status === 'current') await demoteOtherCurrentSemesters(created.id);

    revalidatePath('/semesters');
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateSemester(form: FormData): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const id = requiredId(form, 'id');
    const status = oneOf(form, 'status', SEMESTER_STATUSES, 'upcoming');

    await db
      .update(semesters)
      .set({
        name: requiredText(form, 'name', 'Semester name'),
        year: requiredNumber(form, 'year', 'Year'),
        status,
        startDate: readDate(form, 'startDate'),
        endDate: readDate(form, 'endDate'),
      })
      .where(eq(semesters.id, id));

    if (status === 'current') await demoteOtherCurrentSemesters(id);

    revalidatePath('/semesters');
    revalidatePath(`/semesters/${id}`);
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

/**
 * PRD.md §6.1's "archive". Archiving is `status: 'past'` rather than a separate
 * flag — the lifecycle already lives in `status`, and two overlapping ways to
 * say "not current" would inevitably disagree.
 */
export async function setSemesterStatus(form: FormData): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const id = requiredId(form, 'id');
    const status = oneOf(form, 'status', SEMESTER_STATUSES, 'past');

    await db.update(semesters).set({ status }).where(eq(semesters.id, id));
    if (status === 'current') await demoteOtherCurrentSemesters(id);

    revalidatePath('/semesters');
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSemester(form: FormData): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const id = requiredId(form, 'id');
    // Units and their assessments go with it, via ON DELETE CASCADE.
    await db.delete(semesters).where(eq(semesters.id, id));

    revalidatePath('/semesters');
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
