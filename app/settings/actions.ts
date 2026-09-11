'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '@/lib/db';
import { gradeBands } from '@/db/schema';
import { resetGradeBands } from '@/lib/db/seed';
import type { ActionResult } from '@/lib/form';

/**
 * Grade bands are editable because thresholds vary by institution (CLAUDE.md,
 * PRD.md §7). Only each band's floor can be changed: the ceiling is derived
 * from the next band up, so there is no way to save a pair of thresholds that
 * leaves a gap or an overlap. See the note on `gradeBands` in db/schema.ts.
 */
export async function updateGradeBands(
  input: { id: number; minScore: number; gradePoint: number }[],
): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    for (const band of input) {
      if (!Number.isFinite(band.minScore) || band.minScore < 0 || band.minScore > 100) {
        return { ok: false, error: 'Thresholds must be between 0 and 100.' };
      }
      if (!Number.isFinite(band.gradePoint) || band.gradePoint < 0 || band.gradePoint > 10) {
        return { ok: false, error: 'Grade points must be between 0 and 10.' };
      }
    }

    // Two bands sharing a floor would make "the highest band the score reaches"
    // ambiguous, so reject rather than pick one arbitrarily.
    const floors = input.map((band) => band.minScore);
    if (new Set(floors).size !== floors.length) {
      return { ok: false, error: 'Two bands cannot share the same threshold.' };
    }

    for (const band of input) {
      await db
        .update(gradeBands)
        .set({ minScore: band.minScore, gradePoint: band.gradePoint })
        .where(eq(gradeBands.id, band.id));
    }

    revalidatePath('/settings');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Could not save the bands.' };
  }
}

export async function restoreDefaultBands(): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();
    await resetGradeBands(db);
    revalidatePath('/settings');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Could not restore the defaults.' };
  }
}
