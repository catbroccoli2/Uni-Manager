'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db, ensureDatabaseReady } from '@/lib/db';
import {
  ASSESSMENT_TYPES,
  CONTENT_SOURCE_TYPES,
  TIMETABLE_ENTRY_TYPES,
  UNIT_COLORS,
  assessments,
  contentSources,
  timetableEntries,
  units,
  type AssessmentType,
  type ContentSourceType,
  type TimetableEntryType,
  type UnitColor,
} from '@/db/schema';
import { isValidIsoDate } from '@/lib/dates';
import { clampNumber, weightingAllowance } from '@/lib/grades';
import type { ActionResult } from '@/lib/form';

/**
 * Commits a reviewed outline draft.
 *
 * Everything here is re-validated rather than trusted. The draft came from a
 * heuristic parser, was edited in a client component, and crossed the wire — no
 * part of that chain is authoritative about what may enter the database. The
 * checks below deliberately repeat what the client already did.
 */

export interface OutlineCommit {
  semesterId: number;
  /** When set, append to this existing unit instead of creating a new one. */
  targetUnitId: number | null;
  unit: {
    code: string | null;
    name: string;
    color: UnitColor;
    creditPoints: number | null;
  };
  assessments: {
    name: string;
    dueDate: string | null;
    weighting: number;
    maxMark: number;
    type: AssessmentType;
  }[];
  timetable: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    location: string | null;
    type: TimetableEntryType;
  }[];
  sources: {
    title: string;
    urlOrFileRef: string | null;
    type: ContentSourceType;
  }[];
}

export interface CommitOutcome {
  ok: true;
  unitId: number;
  created: { assessments: number; timetable: number; sources: number };
  /** Set when the 100% cap trimmed or dropped rows, so the UI can say so. */
  cappedAt: number | null;
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function commitOutlineDraft(
  input: OutlineCommit,
): Promise<CommitOutcome | Exclude<ActionResult, { ok: true }>> {
  try {
    await ensureDatabaseReady();

    const name = input.unit.name.trim();
    if (input.targetUnitId === null && name === '') {
      return { ok: false, error: 'The unit needs a name.' };
    }

    return await db.transaction(async (tx) => {
      /*
        One transaction for the whole import. A half-created unit — present, but
        missing the assessments that were the reason for importing it — is worse
        than a failed import the user can simply retry.
      */
      let unitId = input.targetUnitId;

      if (unitId === null) {
        const [created] = await tx
          .insert(units)
          .values({
            semesterId: input.semesterId,
            name,
            code: input.unit.code?.trim() || null,
            color: UNIT_COLORS.includes(input.unit.color) ? input.unit.color : 'violet',
            creditPoints:
              input.unit.creditPoints !== null && Number.isFinite(input.unit.creditPoints)
                ? Math.max(0, input.unit.creditPoints)
                : null,
          })
          .returning();
        if (!created) throw new Error('unit insert failed');
        unitId = created.id;
      }

      // Merging into an existing unit means its current weightings already
      // claim part of the 100, so the allowance is whatever they leave.
      const existing = await tx
        .select({ weighting: assessments.weighting })
        .from(assessments)
        .where(eq(assessments.unitId, unitId));

      let allowance = weightingAllowance(existing);
      let cappedAt: number | null = null;
      let sortOrder = existing.length;

      const rows = [];
      for (const draft of input.assessments) {
        const wanted = Number.isFinite(draft.weighting) ? Math.max(0, draft.weighting) : 0;
        const weighting = clampNumber(wanted, 0, allowance);
        if (weighting !== wanted && cappedAt === null) cappedAt = allowance;
        allowance = clampNumber(allowance - weighting, 0, 100);

        rows.push({
          unitId,
          name: draft.name.trim() || 'Untitled assessment',
          dueDate: draft.dueDate && isValidIsoDate(draft.dueDate) ? draft.dueDate : null,
          weighting,
          maxMark:
            Number.isFinite(draft.maxMark) && draft.maxMark > 0 ? draft.maxMark : 100,
          type: ASSESSMENT_TYPES.includes(draft.type) ? draft.type : 'individual',
          completed: false,
          sortOrder: sortOrder++,
        });
      }
      if (rows.length > 0) await tx.insert(assessments).values(rows);

      const classRows = input.timetable
        .filter(
          (entry) =>
            Number.isInteger(entry.dayOfWeek) &&
            entry.dayOfWeek >= 1 &&
            entry.dayOfWeek <= 7 &&
            CLOCK.test(entry.startTime) &&
            CLOCK.test(entry.endTime),
        )
        .map((entry) => ({
          unitId,
          dayOfWeek: entry.dayOfWeek,
          startTime: entry.startTime,
          endTime: entry.endTime,
          location: entry.location?.trim() || null,
          type: TIMETABLE_ENTRY_TYPES.includes(entry.type) ? entry.type : 'other',
        }));
      if (classRows.length > 0) await tx.insert(timetableEntries).values(classRows);

      const sourceRows = input.sources
        .filter((source) => source.title.trim() !== '')
        .map((source) => ({
          unitId,
          title: source.title.trim(),
          urlOrFileRef: source.urlOrFileRef?.trim() || null,
          type: CONTENT_SOURCE_TYPES.includes(source.type) ? source.type : 'other',
          tags: [],
        }));
      if (sourceRows.length > 0) await tx.insert(contentSources).values(sourceRows);

      revalidatePath(`/units/${unitId}`);
      revalidatePath(`/semesters/${input.semesterId}`);
      revalidatePath('/');

      return {
        ok: true as const,
        unitId,
        created: {
          assessments: rows.length,
          timetable: classRows.length,
          sources: sourceRows.length,
        },
        cappedAt,
      };
    });
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Could not import that outline.' };
  }
}
