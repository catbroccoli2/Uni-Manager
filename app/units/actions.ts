'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '@/lib/db';
import { UNIT_COLORS, units } from '@/db/schema';
import {
  failure,
  oneOf,
  optionalNumber,
  optionalText,
  requiredId,
  requiredText,
  type ActionResult,
} from '@/lib/form';

export async function createUnit(form: FormData): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const semesterId = requiredId(form, 'semesterId');

    await db.insert(units).values({
      semesterId,
      name: requiredText(form, 'name', 'Unit name'),
      code: optionalText(form, 'code'),
      color: oneOf(form, 'color', UNIT_COLORS, 'violet'),
      creditPoints: optionalNumber(form, 'creditPoints', 'Credit points'),
    });

    revalidatePath(`/semesters/${semesterId}`);
    revalidatePath('/semesters');
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateUnit(form: FormData): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const id = requiredId(form, 'id');

    const [updated] = await db
      .update(units)
      .set({
        name: requiredText(form, 'name', 'Unit name'),
        code: optionalText(form, 'code'),
        color: oneOf(form, 'color', UNIT_COLORS, 'violet'),
        creditPoints: optionalNumber(form, 'creditPoints', 'Credit points'),
      })
      .where(eq(units.id, id))
      .returning();

    revalidatePath(`/units/${id}`);
    if (updated) revalidatePath(`/semesters/${updated.semesterId}`);
    revalidatePath('/semesters');
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function deleteUnit(form: FormData): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const id = requiredId(form, 'id');
    // Assessments, content sources and timetable entries cascade.
    const [deleted] = await db.delete(units).where(eq(units.id, id)).returning();

    if (deleted) revalidatePath(`/semesters/${deleted.semesterId}`);
    revalidatePath('/semesters');
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
