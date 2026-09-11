'use client';

import { useCallback, useOptimistic, useRef, useState, useTransition } from 'react';
import {
  createAssessment,
  deleteAssessment,
  updateAssessment,
  type AssessmentPatch,
} from '@/app/units/assessment-actions';
import type { Assessment } from '@/db/schema';
import { summariseUnit } from '@/lib/grades';
import type { BandLike } from '@/lib/grades';
import { AssessmentRack } from '@/components/assessment-rack';
import { GradeGauge } from '@/components/grade-gauge';
import { BayLabel } from '@/components/ui';

export type Patchable = Omit<AssessmentPatch, 'id'>;

/**
 * Owns the unit page's live state.
 *
 * The gauge and the rack read the same optimistic rows, which is the whole
 * point: typing a mark into a strip moves the gauge on the same keystroke,
 * rather than after a server round-trip. If the page computed the summary
 * server-side and passed it down, the calculator would lag every edit by a
 * revalidation — and the calculator is this app's primary job.
 *
 * The mutation plumbing lives here rather than in the rack for the same reason:
 * one optimistic store, two readers.
 */
export function UnitWorkspace({
  unitId,
  assessments,
  bands,
}: {
  unitId: number;
  assessments: Assessment[];
  bands: BandLike[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [rows, applyOptimistic] = useOptimistic(
    assessments,
    (current: Assessment[], change: { id: number; patch: Patchable }) =>
      current.map((row) =>
        row.id === change.id ? ({ ...row, ...change.patch } as Assessment) : row,
      ),
  );

  const focusOnMount = useRef<number | null>(null);

  const save = useCallback(
    (id: number, patch: Patchable) => {
      setError(null);
      startTransition(async () => {
        applyOptimistic({ id, patch });
        const result = await updateAssessment({ id, ...patch });
        if (!result.ok) setError(result.error);
      });
    },
    [applyOptimistic],
  );

  const addRow = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await createAssessment(unitId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      focusOnMount.current = result.assessment.id;
    });
  }, [unitId]);

  const removeRow = useCallback((id: number) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteAssessment(id);
      if (!result.ok) setError(result.error);
    });
  }, []);

  // Marks on ungraded rows are ignored by summariseUnit, per PRD.md §7.
  const summary = summariseUnit(rows);
  const gradedCount = rows.filter((row) => row.completed).length;

  return (
    <div className="space-y-8">
      <section>
        <BayLabel>Where this unit stands</BayLabel>
        <GradeGauge summary={summary} bands={bands} />
      </section>

      <section>
        <BayLabel trailing={rows.length > 0 ? `${gradedCount} of ${rows.length} graded` : undefined}>
          Assessments
        </BayLabel>
        <AssessmentRack
          rows={rows}
          pending={pending}
          error={error}
          focusOnMount={focusOnMount}
          onSave={save}
          onAdd={addRow}
          onRemove={removeRow}
        />
      </section>
    </div>
  );
}
