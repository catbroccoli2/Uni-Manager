'use server';

import { revalidatePath } from 'next/cache';
import { asc, eq, sql } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '@/lib/db';
import { ASSESSMENT_TYPES, assessments, type Assessment, type AssessmentType } from '@/db/schema';
import { isValidIsoDate } from '@/lib/dates';
import { weightingAllowance } from '@/lib/grades';
import type { ActionResult } from '@/lib/form';

/**
 * These take typed objects rather than FormData, unlike the semester and unit
 * actions. The rack edits one cell at a time from a client component, so there
 * is no form to serialise and no benefit to pretending there is — and passing a
 * typed patch means the client cannot send a field the server does not expect.
 */

export interface AssessmentPatch {
  id: number;
  name?: string;
  dueDate?: string | null;
  type?: AssessmentType;
  weighting?: number;
  mark?: number | null;
  maxMark?: number;
  completed?: boolean;
  notes?: string | null;
}

function clean(patch: AssessmentPatch): Partial<Assessment> {
  const next: Partial<Assessment> = {};

  if (patch.name !== undefined) {
    // An untitled strip is allowed to exist — a row is created the moment you
    // press Enter, before you have typed anything — so this never rejects.
    next.name = patch.name.trim();
  }

  if (patch.dueDate !== undefined) {
    const value = patch.dueDate?.trim();
    next.dueDate = value && isValidIsoDate(value) ? value : null;
  }

  if (patch.type !== undefined && ASSESSMENT_TYPES.includes(patch.type)) {
    next.type = patch.type;
  }

  if (patch.weighting !== undefined) {
    // Guard against NaN and Infinity reaching a REAL column, where they would
    // poison every sum the calculator runs afterwards. The 100 ceiling is
    // enforced against the unit's other rows in `updateAssessment`, which is
    // the only place that can see them.
    next.weighting = Number.isFinite(patch.weighting) ? Math.max(0, patch.weighting) : 0;
  }

  if (patch.mark !== undefined) {
    // null is meaningful: "not graded yet" is different from a mark of 0.
    next.mark =
      patch.mark === null || !Number.isFinite(patch.mark) ? null : Math.max(0, patch.mark);
  }

  if (patch.maxMark !== undefined) {
    // A zero or negative "out of" is not a scale. Falling back to 100 keeps the
    // row scoring something sensible rather than silently contributing nothing.
    next.maxMark =
      Number.isFinite(patch.maxMark) && patch.maxMark > 0 ? patch.maxMark : 100;
  }

  if (patch.completed !== undefined) next.completed = patch.completed;

  if (patch.notes !== undefined) {
    const value = patch.notes?.trim();
    next.notes = value ? value : null;
  }

  return next;
}

export async function updateAssessment(patch: AssessmentPatch): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const next = clean(patch);
    if (Object.keys(next).length === 0) return { ok: true };

    /*
      The 100% ceiling is enforced here rather than in the client alone. The
      client clamps so the user sees what happened as they type, but it is one
      tab among possibly several and its idea of the other rows can be stale;
      the database is the only place that knows the current total. Re-clamping
      against freshly read siblings is what actually makes the invariant hold.
    */
    if (next.weighting !== undefined) {
      const [row] = await db
        .select({ unitId: assessments.unitId })
        .from(assessments)
        .where(eq(assessments.id, patch.id))
        .limit(1);

      if (row) {
        const siblings = await db
          .select({ id: assessments.id, weighting: assessments.weighting })
          .from(assessments)
          .where(eq(assessments.unitId, row.unitId));

        const allowance = weightingAllowance(siblings.filter((s) => s.id !== patch.id));
        next.weighting = Math.min(next.weighting, allowance);
      }
    }

    const [updated] = await db
      .update(assessments)
      .set(next)
      .where(eq(assessments.id, patch.id))
      .returning();

    if (updated) {
      revalidatePath(`/units/${updated.unitId}`);
      revalidatePath('/');
    }
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Could not save that change.' };
  }
}

/**
 * Appends an empty strip and returns it, so the client can focus its name field
 * immediately. The row is persisted straight away rather than held in memory:
 * a half-typed assessment that vanishes on navigation is worse than an untitled
 * one that can be renamed or deleted.
 */
export async function createAssessment(unitId: number): Promise<
  { ok: true; assessment: Assessment } | { ok: false; error: string }
> {
  try {
    await ensureDatabaseReady();

    const [last] = await db
      .select({ sortOrder: assessments.sortOrder })
      .from(assessments)
      .where(eq(assessments.unitId, unitId))
      .orderBy(sql`${assessments.sortOrder} desc`)
      .limit(1);

    const [created] = await db
      .insert(assessments)
      .values({
        unitId,
        name: '',
        weighting: 0,
        completed: false,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      })
      .returning();

    if (!created) return { ok: false, error: 'Could not add a row.' };

    revalidatePath(`/units/${unitId}`);
    revalidatePath('/');
    return { ok: true, assessment: created };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Could not add a row.' };
  }
}

export async function deleteAssessment(id: number): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const [deleted] = await db.delete(assessments).where(eq(assessments.id, id)).returning();
    if (deleted) {
      revalidatePath(`/units/${deleted.unitId}`);
      revalidatePath('/');
    }
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Could not delete that row.' };
  }
}

/** Re-reads the rack after an optimistic edit, so the client can reconcile. */
export async function listAssessments(unitId: number): Promise<Assessment[]> {
  await ensureDatabaseReady();
  return db
    .select()
    .from(assessments)
    .where(eq(assessments.unitId, unitId))
    .orderBy(asc(assessments.sortOrder), asc(assessments.id));
}
