import Link from 'next/link';
import { listSemesters } from '@/lib/queries';
import { BayLabel, EmptyBay, Figure } from '@/components/ui';
import { SemesterComposer } from './semester-composer';
import { SemesterActions } from './semester-actions';
import { formatShortDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  current: 'Current',
  upcoming: 'Upcoming',
  past: 'Archived',
} as const;

export default async function SemestersPage() {
  const semesters = await listSemesters();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Semesters</h1>
        <p className="mt-1 max-w-prose text-sm text-etch-dim">
          One rack per semester. Marking a semester current puts its units on the board.
        </p>
      </div>

      <section>
        <BayLabel trailing={semesters.length > 0 ? `${semesters.length} total` : undefined}>
          All semesters
        </BayLabel>

        {semesters.length === 0 ? (
          <EmptyBay>No semesters yet. Add your first one below to start tracking units.</EmptyBay>
        ) : (
          <ul className="divide-y divide-rack-600 border-y border-rack-600">
            {semesters.map((semester) => (
              <li
                key={semester.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 transition-colors hover:bg-rack-700/45"
              >
                <Link
                  href={`/semesters/${semester.id}`}
                  className="min-w-0 flex-1 focus-visible:outline-2"
                >
                  <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <span className="font-medium text-etch">{semester.name}</span>
                    <Figure className="text-xs text-etch-faint">{semester.year}</Figure>
                    {semester.status === 'current' ? (
                      <span className="rounded-[1px] bg-strip px-1.5 py-px text-[0.6875rem] font-semibold text-strip-ink">
                        {STATUS_LABEL.current}
                      </span>
                    ) : (
                      <span className="text-[0.6875rem] text-etch-faint">
                        {STATUS_LABEL[semester.status]}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-etch-dim">
                    <span>
                      {semester.unitCount} {semester.unitCount === 1 ? 'unit' : 'units'}
                    </span>
                    {semester.startDate ? (
                      <span className="text-etch-faint">
                        {formatShortDate(semester.startDate)}
                        {semester.endDate ? ` – ${formatShortDate(semester.endDate)}` : ''}
                      </span>
                    ) : null}
                  </span>
                </Link>

                <SemesterActions semester={semester} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <BayLabel>Add a semester</BayLabel>
        <SemesterComposer />
      </section>
    </div>
  );
}
