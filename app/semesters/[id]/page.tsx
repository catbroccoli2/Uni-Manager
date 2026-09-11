import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSemester, getSemesterUnits } from '@/lib/queries';
import { listGradeBands } from '@/lib/queries';
import { summariseUnit, unitStanding } from '@/lib/grades';
import { BackLink, BayLabel, EmptyBay, Figure, Lamp } from '@/components/ui';
import { UnitPlate } from '@/components/unit-pill';
import { UnitComposer } from './unit-composer';

export const dynamic = 'force-dynamic';

export default async function SemesterPage({ params }: PageProps<'/semesters/[id]'>) {
  const { id } = await params;
  const semesterId = Number(id);
  if (!Number.isInteger(semesterId)) notFound();

  const [semester, units, bands] = await Promise.all([
    getSemester(semesterId),
    getSemesterUnits(semesterId),
    listGradeBands(),
  ]);

  if (!semester) notFound();

  return (
    <div className="space-y-8">
      <div>
        <BackLink href="/semesters">Semesters</BackLink>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{semester.name}</h1>
        <p className="mt-1 text-sm text-etch-dim">
          {semester.year} ·{' '}
          {semester.status === 'current'
            ? 'Current semester'
            : semester.status === 'upcoming'
              ? 'Upcoming'
              : 'Archived'}
        </p>
      </div>

      <section>
        <BayLabel trailing={units.length > 0 ? `${units.length} units` : undefined}>Units</BayLabel>

        {units.length === 0 ? (
          <EmptyBay>
            No units in this semester yet. Add one below, then start filling in its assessments.
          </EmptyBay>
        ) : (
          <ul className="divide-y divide-rack-600 border-y border-rack-600">
            {units.map((unit) => {
              const summary = summariseUnit(unit.assessments);
              const graded = unit.assessments.filter((a) => a.completed).length;
              const weightsOff = summary.warnings.some(
                (w) => w.kind === 'weighting-sum-not-100',
              );
              // The grade on marked work. This used to be hidden until a unit
              // was finished, because banding the running total showed "N" on a
              // unit being carried at 90%. Banding the average instead is honest
              // at every point in the semester.
              const standing = unitStanding(summary, bands);

              return (
                <li key={unit.id}>
                  <Link
                    href={`/units/${unit.id}`}
                    className="grid grid-cols-1 items-center gap-x-5 gap-y-2.5 py-3.5 transition-colors hover:bg-rack-700/45 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto]"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <UnitPlate color={unit.color} code={unit.code} name={unit.name} />
                      <span className="truncate text-sm font-medium text-etch">{unit.name}</span>
                    </span>

                    {/*
                      A miniature of the staff this unit gets on its own page:
                      solid is banked, hatched is still reachable, the dark
                      remainder is weight nobody has claimed yet.
                    */}
                    <span className="flex flex-col gap-1">
                      <span className="flex h-1.5 w-full overflow-hidden bg-rack-900">
                        <span
                          className="bg-strip"
                          style={{ width: `${Math.min(summary.pointsEarned, 100)}%` }}
                        />
                        <span
                          className="strip-pending opacity-45"
                          style={{
                            width: `${Math.max(0, Math.min(summary.weightingRemaining, 100 - Math.min(summary.pointsEarned, 100)))}%`,
                          }}
                        />
                      </span>
                      <span className="flex items-center gap-2 text-xs text-etch-dim">
                        <span>
                          {graded} of {unit.assessments.length} graded
                        </span>
                        {weightsOff ? (
                          <span className="flex items-center gap-1.5 text-lamp-live">
                            <Lamp tone="live" />
                            weights total {summary.totalWeighting}
                          </span>
                        ) : null}
                      </span>
                    </span>

                    <span className="flex items-baseline gap-2 text-xs sm:justify-end">
                      {standing.percent === null ? (
                        <span className="text-etch-faint">
                          {unit.assessments.length === 0 ? 'no assessments' : 'nothing graded'}
                        </span>
                      ) : (
                        <>
                          <Figure className="text-sm text-etch">{standing.percent}%</Figure>
                          {standing.band ? (
                            <span className="rounded-[1px] bg-strip px-1.5 py-px text-[0.6875rem] font-semibold text-strip-ink">
                              {standing.band.code}
                            </span>
                          ) : null}
                          {!standing.settled ? (
                            <span className="text-[0.625rem] text-etch-faint">so far</span>
                          ) : null}
                        </>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <BayLabel>Add a unit</BayLabel>
        <UnitComposer semesterId={semester.id} />
      </section>
    </div>
  );
}
