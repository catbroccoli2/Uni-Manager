import { notFound } from 'next/navigation';
import { getSemester, getSemesterUnits } from '@/lib/queries';
import { BackLink } from '@/components/ui';
import { ImportWorkspace } from './import-workspace';

export const dynamic = 'force-dynamic';

export default async function ImportPage({ params }: PageProps<'/semesters/[id]/import'>) {
  const { id } = await params;
  const semesterId = Number(id);
  if (!Number.isInteger(semesterId)) notFound();

  const [semester, units] = await Promise.all([
    getSemester(semesterId),
    getSemesterUnits(semesterId),
  ]);
  if (!semester) notFound();

  return (
    <div className="space-y-8">
      <div>
        <BackLink href={`/semesters/${semester.id}`}>{semester.name}</BackLink>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">Import an outline</h1>
        <p className="mt-1 max-w-prose text-sm text-etch-dim">
          Paste the text of a unit outline and it will propose the unit, its assessments, class
          times and readings. Nothing is saved until you have looked at it.
        </p>
      </div>

      <ImportWorkspace
        semesterId={semester.id}
        semesterStart={semester.startDate}
        existingUnits={units.map((unit) => ({
          id: unit.id,
          code: unit.code,
          name: unit.name,
          assessmentCount: unit.assessments.length,
          weightingUsed:
            Math.round(unit.assessments.reduce((sum, a) => sum + a.weighting, 0) * 100) / 100,
        }))}
      />
    </div>
  );
}
