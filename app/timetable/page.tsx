import Link from 'next/link';
import { getWeekSchedule } from '@/lib/queries';
import { addDaysIso, describeWeek, isValidIsoDate, startOfWeekIso, todayIso } from '@/lib/dates';
import { BayLabel } from '@/components/ui';
import { WeekGrid } from '@/components/week-grid';

export const dynamic = 'force-dynamic';

/**
 * The week, held in the URL.
 *
 * Keeping the displayed week in the query string rather than in client state
 * means this page stays a server component — no client bundle, no hydration —
 * and a particular week can be linked to or reloaded without losing it.
 */
function readWeek(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && isValidIsoDate(raw)) return startOfWeekIso(raw);
  return startOfWeekIso(todayIso());
}

export default async function TimetablePage({ searchParams }: PageProps<'/timetable'>) {
  const params = await searchParams;
  const weekStart = readWeek(params.week);
  const thisWeek = startOfWeekIso(todayIso());

  const { classes, due } = await getWeekSchedule(weekStart);

  const previous = addDaysIso(weekStart, -7);
  const next = addDaysIso(weekStart, 7);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Timetable</h1>
          <p className="mt-1 text-sm text-etch-dim">
            {classes.length === 0 && due.length === 0
              ? 'Nothing scheduled this week.'
              : `${classes.length} ${classes.length === 1 ? 'class' : 'classes'}` +
                (due.length > 0
                  ? `, ${due.length} ${due.length === 1 ? 'deadline' : 'deadlines'}`
                  : '')}
          </p>
        </div>

        <nav aria-label="Week" className="flex items-center gap-1 text-xs">
          <WeekStep href={`/timetable?week=${previous}`} label="Previous week" facing="left" />
          <span className="min-w-[8.5rem] px-2 text-center font-medium text-etch">
            {describeWeek(weekStart)}
          </span>
          <WeekStep href={`/timetable?week=${next}`} label="Next week" facing="right" />
          {weekStart !== thisWeek ? (
            <Link
              href="/timetable"
              className="ml-1 rounded-[1px] bg-rack-700 px-2.5 py-1 text-etch-dim transition-colors hover:bg-rack-600 hover:text-etch"
            >
              This week
            </Link>
          ) : (
            <span className="ml-1 rounded-[1px] bg-strip px-2.5 py-1 font-medium text-strip-ink">
              This week
            </span>
          )}
        </nav>
      </div>

      <section>
        <BayLabel trailing={describeWeek(weekStart)}>The week</BayLabel>
        <WeekGrid weekStart={weekStart} classes={classes} due={due} />
      </section>

      <p className="max-w-prose text-xs text-etch-faint">
        Class times are set on each unit&rsquo;s page. Deadlines come from your assessments and sit
        above the clock, because an assessment is due on a day rather than at a time.
      </p>
    </div>
  );
}

function WeekStep({
  href,
  label,
  facing,
}: {
  href: string;
  label: string;
  facing: 'left' | 'right';
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="rounded-[1px] bg-rack-700 p-1.5 text-etch-dim transition-colors hover:bg-rack-600 hover:text-etch"
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden fill="none">
        <path
          d={facing === 'left' ? 'M7.25 2.5L3.75 6l3.5 3.5' : 'M4.75 2.5L8.25 6l-3.5 3.5'}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
