import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUnit, getUnitExtras, listGradeBands } from '@/lib/queries';
import { UnitPlate } from '@/components/unit-pill';
import { BackLink, BayLabel, Figure } from '@/components/ui';
import { UnitWorkspace } from '@/components/unit-workspace';
import { UnitSettings } from './unit-settings';

export const dynamic = 'force-dynamic';

/** ISO weekdays, Monday first — matching timetable_entries.day_of_week. */
const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default async function UnitPage({ params }: PageProps<'/units/[id]'>) {
  const { id } = await params;
  const unitId = Number(id);
  if (!Number.isInteger(unitId)) notFound();

  const [unit, bands, extras] = await Promise.all([
    getUnit(unitId),
    listGradeBands(),
    getUnitExtras(unitId),
  ]);
  if (!unit) notFound();

  return (
    <div className="space-y-8">
      <div>
        <BackLink href={`/semesters/${unit.semesterId}`}>{unit.semester.name}</BackLink>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <UnitPlate color={unit.color} code={unit.code} name={unit.name} />
          <h1 className="text-2xl font-semibold tracking-tight">{unit.name}</h1>
        </div>
      </div>

      {/*
        The gauge and the rack are one client component, not two: they read the
        same optimistic rows so that typing a mark moves the gauge on the same
        keystroke. Bands come from the database, per CLAUDE.md — never hardcoded.
      */}
      <UnitWorkspace unitId={unit.id} assessments={unit.assessments} bands={bands} />

      {/*
        Read-only, and deliberately so. These exist because the outline import
        writes to both tables, and rows nobody can see are worse than rows that
        were never imported. The weekly timetable grid and the searchable
        content library are still Phase 2 (PRD.md §8).
      */}
      {extras.timetable.length > 0 ? (
        <section>
          <BayLabel trailing={`${extras.timetable.length}`}>Class times</BayLabel>
          <ul className="divide-y divide-rack-600 border-y border-rack-600">
            {extras.timetable.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2.5 text-sm"
              >
                <span className="w-24 shrink-0 font-medium text-etch">
                  {DAY_NAMES[entry.dayOfWeek] ?? '—'}
                </span>
                <Figure className="text-etch-dim">
                  {entry.startTime}–{entry.endTime}
                </Figure>
                <span className="capitalize text-etch-dim">{entry.type}</span>
                {entry.location ? (
                  <span className="min-w-0 flex-1 truncate text-right text-xs text-etch-faint">
                    {entry.location}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {extras.sources.length > 0 ? (
        <section>
          <BayLabel trailing={`${extras.sources.length}`}>Readings</BayLabel>
          <ul className="divide-y divide-rack-600 border-y border-rack-600">
            {extras.sources.map((source) => (
              <li key={source.id} className="py-2.5 text-sm">
                {source.urlOrFileRef ? (
                  <a
                    href={source.urlOrFileRef}
                    target="_blank"
                    rel="noreferrer"
                    className="text-etch underline decoration-rack-500 underline-offset-2 hover:decoration-etch"
                  >
                    {source.title}
                  </a>
                ) : (
                  <span className="text-etch-dim">{source.title}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <BayLabel>Unit details</BayLabel>
        <UnitSettings unit={unit} />
      </section>
    </div>
  );
}
