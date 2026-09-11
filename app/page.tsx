import Link from 'next/link';
import { BayLabel, EmptyBay } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function BoardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
        <p className="mt-1 max-w-prose text-sm text-etch-dim">
          What is due, across every unit in the current semester.
        </p>
      </div>

      <section>
        <BayLabel>Due soon</BayLabel>
        <EmptyBay
          action={
            <Link
              href="/semesters"
              className="rounded-[1px] bg-strip px-3 py-1.5 text-sm font-medium text-strip-ink transition-colors hover:bg-[#e3dac7]"
            >
              Set up a semester
            </Link>
          }
        >
          The board lands in a later step. Set up a semester and its units first.
        </EmptyBay>
      </section>
    </div>
  );
}
