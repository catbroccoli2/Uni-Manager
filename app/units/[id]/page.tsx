import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUnit, listGradeBands } from '@/lib/queries';
import { UnitPlate } from '@/components/unit-pill';
import { BayLabel } from '@/components/ui';
import { UnitWorkspace } from '@/components/unit-workspace';
import { UnitSettings } from './unit-settings';

export const dynamic = 'force-dynamic';

export default async function UnitPage({ params }: PageProps<'/units/[id]'>) {
  const { id } = await params;
  const unitId = Number(id);
  if (!Number.isInteger(unitId)) notFound();

  const [unit, bands] = await Promise.all([getUnit(unitId), listGradeBands()]);
  if (!unit) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/semesters/${unit.semesterId}`}
          className="text-xs text-etch-dim hover:text-etch"
        >
          ← {unit.semester.name}
        </Link>
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

      <section>
        <BayLabel>Unit details</BayLabel>
        <UnitSettings unit={unit} />
      </section>
    </div>
  );
}
