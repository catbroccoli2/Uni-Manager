
import Link from 'next/link';
import {
  getCurrentSemesterUnits,
  getDueAssessments,
  getWeekSchedule,
  listGradeBands,
  getAllUnits,
} from '@/lib/queries';
import { gradePointAverage, summariseUnit, unitStanding } from '@/lib/grades';
import { TodayClasses } from '@/components/today-classes';
import { BayLabel, EmptyBay, Figure, Lamp } from '@/components/ui';
import { UnitPlate } from '@/components/unit-pill';
import {
  describeDueDate,
  dueUrgency,
  formatDueDate,
  isoWeekday,
  startOfWeekIso,
  todayIso,
} from '@/lib/dates';

export const dynamic = 'force-dynamic';

/**
 * The board: everything due across every unit, ranked by date.
 *
 * PRD.md §6.3 asks for a 7–14 day window without settling on one, so the window
 * is a real choice held in the URL rather than a number baked in. Keeping it in
 * the query string means this whole page stays a server component — no client
 * bundle, no hydration, and the chosen window survives a reload and a bookmark.
 */

const WINDOWS = [7, 14] as const;
type Window = (typeof WINDOWS)[number];

function readWindow(value: string | string[] | undefined): Window {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return WINDOWS.includes(n as Window) ? (n as Window) : 14;
}

export default async function BoardPage({ searchParams }: PageProps<'/'>) {
  const params = await searchParams;
  const days = readWindow(params.days);
  const today = todayIso();

    const [due, current, bands, week, allUnits] = await Promise.all([
    getDueAssessments(days),
    getCurrentSemesterUnits(),
    listGradeBands(),
    getWeekSchedule(startOfWeekIso(today)),
    getAllUnits(),
  ]);

  // Today's classes only. The full week is a page away; the board is for what
  // is happening now.
  const todaysClasses = week.classes.filter((entry) => entry.dayOfWeek === isoWeekday(today));
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const overdue = due.filter((item) => item.dueDate && dueUrgency(item.dueDate, today) === 'overdue');
  const ahead = due.filter((item) => item.dueDate && dueUrgency(item.dueDate, today) !== 'overdue');

  // Each unit's standing, computed once and reused by both the GPA figures and
  // the rows beneath them.
  const standings = current.units.map((unit) => ({
    unit,
    summary: summariseUnit(unit.assessments),
  }));
  const withBands = standings.map((entry) => ({
    ...entry,
    standing: unitStanding(entry.summary, bands),
  }));

    // GPA spans every semester, not just the current one. `withBands` above stays
  // current-semester only because it drives the unit list under the cards.
  const allStandings = allUnits.map((unit) =>
    unitStanding(summariseUnit(unit.assessments), bands),
  );

  const confirmedGpa = gradePointAverage(
    allStandings.filter((s) => s.settled).map((s) => s.percent),
    bands,
  );
  const projectedGpa = gradePointAverage(
    allStandings.map((s) => s.percent),
    bands,
  );

  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
          <p className="mt-1 text-sm text-etch-dim">
            {due.length === 0
              ? 'Nothing outstanding in this window.'
              : `${due.length} ${due.length === 1 ? 'strip' : 'strips'} outstanding` +
                (overdue.length > 0 ? `, ${overdue.length} overdue` : '')}
          </p>
        </div>

        <nav aria-label="Window" className="flex items-center gap-1 text-xs">
          <span className="mr-1 text-etch-faint">Next</span>
          {WINDOWS.map((option) => (
            <Link
              key={option}
              href={option === 14 ? '/' : `/?days=${option}`}
              aria-current={option === days ? 'true' : undefined}
              className={[
                'rounded-[1px] px-2.5 py-1 transition-colors',
                option === days
                  ? 'bg-strip font-medium text-strip-ink'
                  : 'bg-rack-700 text-etch-dim hover:bg-rack-600 hover:text-etch',
              ].join(' ')}
            >
              {option} days
            </Link>
          ))}
        </nav>
      </div>

      {todaysClasses.length > 0 ? (
        <section>
          <BayLabel
            trailing={
              <Link
                href="/timetable"
                className="text-etch-dim underline decoration-rack-500 underline-offset-2 hover:text-etch hover:decoration-etch"
              >
                Whole week
              </Link>
            }
          >
            Today
          </BayLabel>
          <TodayClasses classes={todaysClasses} nowMinutes={nowMinutes} />
        </section>
      ) : null}

      {overdue.length > 0 ? (
        <section>
          <BayLabel trailing={`${overdue.length}`}>Overdue</BayLabel>
          <ul className="rack-bay">
            {overdue.map((item) => (
              <BoardStrip key={item.id} item={item} today={today} />
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <BayLabel trailing={ahead.length > 0 ? `${ahead.length}` : undefined}>
          Due in the next {days} days
        </BayLabel>

        {ahead.length === 0 ? (
          <EmptyBay
            action={
              <Link
                href="/semesters"
                className="rounded-[1px] bg-strip px-3 py-1.5 text-sm font-medium text-strip-ink transition-colors hover:bg-[#e3dac7]"
              >
                Go to semesters
              </Link>
            }
          >
            {due.length === 0 && overdue.length === 0
              ? 'Nothing due in this window. Add assessments to a unit and they will appear here.'
              : 'Nothing else due in this window.'}
          </EmptyBay>
        ) : (
          <ul className="rack-bay">
            {ahead.map((item) => (
              <BoardStrip key={item.id} item={item} today={today} />
            ))}
          </ul>
        )}
      </section>

      {current.units.length > 0 ? (
        <section>
          <BayLabel trailing={current.semester?.name}>Standing</BayLabel>

          {/*
            Two GPAs, confirmed with the user. Confirmed counts only units with
            nothing outstanding, so it is a real GPA and never moves on a guess.
            Projected includes every unit with graded work, using the grade it is
            currently carrying — useful mid-semester, and labelled so it can
            never be mistaken for the real thing.
          */}
          <div className="mb-3 grid gap-px border border-rack-600 bg-rack-600 sm:grid-cols-2">
            <GpaFigure
              label="Confirmed GPA"
              result={confirmedGpa}
              hint="units with nothing outstanding"
            />
            <GpaFigure
              label="Projected GPA"
              result={projectedGpa}
              hint="including units still in progress"
              muted
            />
          </div>

          <ul className="divide-y divide-rack-600 border-y border-rack-600">
            {withBands.map(({ unit, standing }) => (
              <li key={unit.id}>
                <Link
                  href={`/units/${unit.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5 text-sm transition-colors hover:bg-rack-700/45"
                >
                  <UnitPlate color={unit.color} code={unit.code} name={unit.name} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-etch-dim">{unit.name}</span>
                  {standing.percent === null ? (
                    <span className="text-xs text-etch-faint">
                      {unit.assessments.length === 0 ? 'no assessments' : 'nothing graded'}
                    </span>
                  ) : (
                    <span className="flex items-baseline gap-2">
                      {/* The grade on marked work, which is a real grade even
                          mid-semester — unlike the running total, which reads
                          as a fail until the last mark lands. */}
                      <Figure className="text-etch">{standing.percent}%</Figure>
                      {standing.band ? (
                        <span className="rounded-[1px] bg-strip px-1.5 py-px text-[0.6875rem] font-semibold text-strip-ink">
                          {standing.band.code}
                        </span>
                      ) : null}
                      {!standing.settled ? (
                        <span className="text-[0.625rem] text-etch-faint">so far</span>
                      ) : null}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * A GPA reading. Shows an em dash rather than 0.00 when nothing qualifies —
 * an empty GPA is "not yet", not "failing".
 */
function GpaFigure({
  label,
  result,
  hint,
  muted = false,
}: {
  label: string;
  result: { gpa: number | null; unitCount: number };
  hint: string;
  muted?: boolean;
}) {
  return (
    <div className="bg-rack-800 px-4 py-3">
      <p className="text-[0.6875rem] font-medium text-etch-dim">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <Figure
          className={`text-tally font-semibold ${muted ? 'text-etch-dim' : 'text-etch'} [font-variant-numeric:proportional-nums]`}
        >
          {result.gpa === null ? '—' : result.gpa.toFixed(2)}
        </Figure>
        {result.gpa !== null ? (
          <span className="text-xs text-etch-faint">
            from {result.unitCount} {result.unitCount === 1 ? 'unit' : 'units'}
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 text-[0.625rem] text-etch-faint">{hint}</p>
    </div>
  );
}

/**
 * A strip on the board. Carries its unit's plate because, unlike the unit page,
 * this rack mixes units and the identity has to travel with the row.
 */
function BoardStrip({
  item,
  today,
}: {
  item: Awaited<ReturnType<typeof getDueAssessments>>[number];
  today: string;
}) {
  const urgency = item.dueDate ? dueUrgency(item.dueDate, today) : 'later';
  const tone = urgency === 'overdue' ? 'over' : urgency === 'later' ? 'off' : 'live';

  return (
    // Always the blank hatched stock: everything on this board is ungraded, and
    // clean buff means "written on". Overdue is carried by the lamp and the
    // date, which is the urgency channel — never by promoting the stock.
    <li className="strip strip-pending">
      <Link
        href={`/units/${item.unitId}`}
        className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]"
      >
        <Lamp tone={tone} />

        <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
          <UnitPlate color={item.unitColor} code={item.unitCode} name={item.unitName} size="sm" />
          <span className="truncate font-medium text-strip-ink">
            {item.name || 'Untitled assessment'}
          </span>
        </span>

        {/* Weighting is what makes an overdue item matter, so it rides beside the date. */}
        <span className="col-start-2 flex items-center gap-3 text-xs text-strip-ink-soft sm:col-start-3">
          <Figure>{item.weighting}%</Figure>
        </span>

        <span className="col-start-2 text-xs sm:col-start-4 sm:text-right">
          <span
            className={
              urgency === 'overdue'
                ? 'font-semibold text-strip-alert'
                : urgency === 'today' || urgency === 'soon'
                  ? 'font-medium text-strip-warn'
                  : 'text-strip-ink-soft'
            }
          >
            {item.dueDate ? describeDueDate(item.dueDate, today) : 'No date'}
          </span>
          {item.dueDate ? (
            <Figure className="ml-2 text-strip-ink-soft">{formatDueDate(item.dueDate)}</Figure>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
