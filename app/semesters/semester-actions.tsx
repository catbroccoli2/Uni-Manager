'use client';

import { useTransition } from 'react';
import { deleteSemester, setSemesterStatus } from './actions';
import type { SemesterWithCounts } from '@/lib/queries';

/**
 * Per-row controls. PRD.md §11 rules out confirmation dialogs for routine
 * actions, so archiving happens immediately. Deleting is not routine — it takes
 * every unit and assessment with it via cascade — so it asks first, and only
 * when there is actually something to lose.
 */
export function SemesterActions({ semester }: { semester: SemesterWithCounts }) {
  const [pending, startTransition] = useTransition();

  function status(next: 'current' | 'upcoming' | 'past') {
    const form = new FormData();
    form.set('id', String(semester.id));
    form.set('status', next);
    startTransition(() => {
      void setSemesterStatus(form);
    });
  }

  function remove() {
    if (semester.unitCount > 0) {
      const ok = window.confirm(
        `Delete "${semester.name}"? Its ${semester.unitCount} ` +
          `${semester.unitCount === 1 ? 'unit and that unit' : 'units and their'} assessments ` +
          'will be deleted too. This cannot be undone.',
      );
      if (!ok) return;
    }
    const form = new FormData();
    form.set('id', String(semester.id));
    startTransition(() => {
      void deleteSemester(form);
    });
  }

  return (
    <div
      className="flex shrink-0 items-center gap-1 text-xs"
      aria-busy={pending}
    >
      {semester.status !== 'current' ? (
        <RowButton onClick={() => status('current')} disabled={pending}>
          Make current
        </RowButton>
      ) : null}

      {semester.status !== 'past' ? (
        <RowButton onClick={() => status('past')} disabled={pending}>
          Archive
        </RowButton>
      ) : (
        <RowButton onClick={() => status('upcoming')} disabled={pending}>
          Restore
        </RowButton>
      )}

      <RowButton onClick={remove} disabled={pending} tone="danger">
        Delete
      </RowButton>
    </div>
  );
}

function RowButton({
  tone = 'quiet',
  className = '',
  ...props
}: React.ComponentProps<'button'> & { tone?: 'quiet' | 'danger' }) {
  return (
    <button
      {...props}
      type="button"
      className={[
        'rounded-[1px] px-2 py-1 transition-colors disabled:opacity-45',
        tone === 'danger'
          ? 'text-etch-faint hover:bg-lamp-over hover:text-rack-900'
          : 'text-etch-dim hover:bg-rack-600 hover:text-etch',
        className,
      ].join(' ')}
    />
  );
}
