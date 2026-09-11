import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUnit } from '@/lib/queries';
import { UnitPlate } from '@/components/unit-pill';
import { BayLabel, EmptyBay } from '@/components/ui';
import { UnitSettings } from './unit-settings';

export const dynamic = 'force-dynamic';

export default async function UnitPage({ params }: PageProps<'/units/[id]'>) {
  const { id } = await params;
  const unitId = Number(id);
  if (!Number.isInteger(unitId)) notFound();

  const unit = await getUnit(unitId);
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

      <section>
        <BayLabel>Assessments</BayLabel>
        <EmptyBay>The assessment rack lands in the next step.</EmptyBay>
      </section>

      <section>
        <BayLabel>Unit details</BayLabel>
        <UnitSettings unit={unit} />
      </section>
    </div>
  );
}
