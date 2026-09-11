import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUnit } from '@/lib/queries';
import { UnitPlate } from '@/components/unit-pill';
import { BayLabel } from '@/components/ui';
import { AssessmentRack } from '@/components/assessment-rack';
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
        <BayLabel
          trailing={
            unit.assessments.length > 0
              ? `${unit.assessments.filter((a) => a.completed).length} of ${unit.assessments.length} graded`
              : undefined
          }
        >
          Assessments
        </BayLabel>
        <AssessmentRack unitId={unit.id} assessments={unit.assessments} />
      </section>

      <section>
        <BayLabel>Unit details</BayLabel>
        <UnitSettings unit={unit} />
      </section>
    </div>
  );
}
