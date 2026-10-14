'use server';

import { revalidatePath } from 'next/cache';
import { asc, eq } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '@/lib/db';
import {
  TIMETABLE_ENTRY_TYPES,
  timetableEntries,
  type TimetableEntry,
  type TimetableEntryType,
} from '@/db/schema';
import type { ActionResult } from '@/lib/form';

/**
 * Class times, edited from the unit page the same way assessments are.
 *
 * Typed patches rather than FormData, matching the assessment rack: these are
 * single-cell edits from a client component, so there is no form to serialise.
 */

export interface TimetablePatch {
  id: number;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  location?: string | null;
  type?: TimetableEntryType;
}

/** 'HH:MM', 24-hour. Anything else would break the grid's time axis. */
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function clean(patch: TimetablePatch): Partial<TimetableEntry> {
  const next: Partial<TimetableEntry> = {};

  if (patch.dayOfWeek !== undefined) {
    // ISO-8601: 1 = Monday … 7 = Sunday. Out of range would render off-grid.
    const day = Math.round(patch.dayOfWeek);
    if (Number.isFinite(day) && day >= 1 && day <= 7) next.dayOfWeek = day;
  }
  if (patch.startTime !== undefined && CLOCK.test(patch.startTime)) {
    next.startTime = patch.startTime;
  }
  if (patch.endTime !== undefined && CLOCK.test(patch.endTime)) {
    next.endTime = patch.endTime;
  }
  if (patch.location !== undefined) {
    next.location = patch.location?.trim() || null;
  }
  if (patch.type !== undefined && TIMETABLE_ENTRY_TYPES.includes(patch.type)) {
    next.type = patch.type;
  }

  return next;
}

export async function updateTimetableEntry(patch: TimetablePatch): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const next = clean(patch);
    if (Object.keys(next).length === 0) return { ok: true };

    const [updated] = await db
      .update(timetableEntries)
      .set(next)
      .where(eq(timetableEntries.id, patch.id))
      .returning();

    if (updated) {
      /*
        An end time earlier than its start would render as a zero- or
        negative-height block on the grid. Rather than reject the keystroke
        mid-edit — the user may be about to fix the other field — the row is
        stored and the grid clamps it to a readable minimum.
      */
      revalidatePath(`/units/${updated.unitId}`);
      revalidatePath('/timetable');
      revalidatePath('/');
    }
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Could not save that class time.' };
  }
}

export async function createTimetableEntry(
  unitId: number,
): Promise<{ ok: true; entry: TimetableEntry } | { ok: false; error: string }> {
  try {
    await ensureDatabaseReady();

    // A sensible weekday slot beats an empty row the user has to fill in from
    // nothing — most classes are on weekdays in the middle of the day.
    const [created] = await db
      .insert(timetableEntries)
      .values({ unitId, dayOfWeek: 1, startTime: '09:00', endTime: '10:00', type: 'lecture' })
      .returning();

    if (!created) return { ok: false, error: 'Could not add a class.' };

    revalidatePath(`/units/${unitId}`);
    revalidatePath('/timetable');
    revalidatePath('/');
    return { ok: true, entry: created };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Could not add a class.' };
  }
}

export async function deleteTimetableEntry(id: number): Promise<ActionResult> {
  try {
    await ensureDatabaseReady();

    const [deleted] = await db
      .delete(timetableEntries)
      .where(eq(timetableEntries.id, id))
      .returning();

    if (deleted) {
      revalidatePath(`/units/${deleted.unitId}`);
      revalidatePath('/timetable');
      revalidatePath('/');
    }
    return { ok: true };
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Could not remove that class.' };
  }
}

export async function listTimetableEntries(unitId: number): Promise<TimetableEntry[]> {
  await ensureDatabaseReady();
  return db
    .select()
    .from(timetableEntries)
    .where(eq(timetableEntries.unitId, unitId))
    .orderBy(asc(timetableEntries.dayOfWeek), asc(timetableEntries.startTime));
}
