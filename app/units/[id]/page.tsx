import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUnit, getUnitExtras, listGradeBands } from '@/lib/queries';
import { UnitPlate } from '@/components/unit-pill';
import { BackLink, BayLabel } from '@/components/ui';
import { UnitWorkspace } from '@/components/unit-workspace';
import { ClassTimes } from '@/components/class-times';
import { UnitSettings } from './unit-settings';

export const dynamic = 'force-dynamic';

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
        Editable here because a class belongs to a unit, and this reuses the
        rack's inline-edit grammar. The week grid at /timetable reads them.
      */}
      <section>
        <BayLabel
          trailing={
            <Link
              href="/timetable"
              className="text-etch-dim underline decoration-rack-500 underline-offset-2 hover:text-etch hover:decoration-etch"
            >
              See the week
            </Link>
          }
        >
          Class times
        </BayLabel>
        <ClassTimes unitId={unit.id} entries={extras.timetable} />
      </section>

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
