import Link from 'next/link';
import type { DueAssessment, ScheduledClass } from '@/lib/queries';
import {
  WEEKEND_DAYS,
  formatClock,
  isoWeekday,
  minutesOfDay,
  shortWeekdayName,
  todayIso,
  weekDaysIso,
} from '@/lib/dates';
import { unitPlateClass } from '@/components/unit-pill';
import { Figure } from '@/components/ui';

/**
 * A week, as a rack of seven bays.
 *
 * Classes are laid out against a real time axis rather than listed, because
 * where a class sits in the day — and the gaps between classes — is most of
 * what a timetable is for.
 *
 * Deadlines ride in a band above the axis instead of at a clock position. An
 * assessment is due on a *day*, not at 14:00, and inventing a time for it would
 * be the kind of false precision the rest of this app refuses.
 *
 * A server component: nothing here is interactive beyond links, so none of it
 * needs to reach the browser as JavaScript.
 */

/** Minutes per pixel-row of the axis; 7am to 10pm covers a university day. */
const DAY_START = 7 * 60;
const DAY_END = 22 * 60;

export function WeekGrid({
  weekStart,
  classes,
  due,
}: {
  weekStart: string;
  classes: ScheduledClass[];
  due: DueAssessment[];
}) {
  const days = weekDaysIso(weekStart);
  const today = todayIso();

  /*
    The weekend is dropped when nothing happens on it, which is the normal case:
    two empty columns cost a fifth of the width of every working day. Which days
    those are comes from WEEKEND_DAYS — Friday and Saturday here, not Saturday
    and Sunday — so Sunday stays a working column and Thursday is never hidden.
  */
  const weekendUsed =
    classes.some((entry) => WEEKEND_DAYS.has(entry.dayOfWeek)) ||
    due.some((item) => item.dueDate && WEEKEND_DAYS.has(isoWeekday(item.dueDate)));
  const shown = weekendUsed
    ? days
    : days.filter((day) => !WEEKEND_DAYS.has(isoWeekday(day)));

  // A class outside the axis would be clipped away silently, so the axis grows
  // to fit instead.
  const earliest = Math.min(DAY_START, ...classes.map((c) => minutesOfDay(c.startTime)));
  const latest = Math.max(DAY_END, ...classes.map((c) => minutesOfDay(c.endTime)));
  const axisStart = Math.floor(earliest / 60) * 60;
  const axisEnd = Math.ceil(latest / 60) * 60;
  const axisSpan = Math.max(60, axisEnd - axisStart);

  const hours = Array.from(
    { length: Math.floor(axisSpan / 60) + 1 },
    (_, index) => axisStart + index * 60,
  );

  const nothing = classes.length === 0 && due.length === 0;
  if (nothing) {
    return (
      <div className="border border-dashed border-rack-600 px-5 py-10 text-center">
        <p className="text-sm text-etch-dim">
          Nothing on this week. Class times are added on each unit&rsquo;s page, and deadlines
          appear here from your assessments.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        {/* Day headings */}
        <div
          className="grid gap-px border-b border-rack-600 pb-1.5"
          style={{ gridTemplateColumns: `3rem repeat(${shown.length}, minmax(0, 1fr))` }}
        >
          <span />
          {shown.map((day) => {
            const isToday = day === today;
            return (
              <span key={day} className="px-1 text-center">
                <span
                  className={[
                    'block text-[0.6875rem] font-semibold',
                    isToday ? 'text-lamp-live' : 'text-etch-dim',
                  ].join(' ')}
                >
                  {shortWeekdayName(day)}
                </span>
                <Figure
                  className={[
                    'block text-[0.625rem]',
                    isToday ? 'text-lamp-live' : 'text-etch-faint',
                  ].join(' ')}
                >
                  {Number(day.slice(8, 10))}
                </Figure>
              </span>
            );
          })}
        </div>

        {/* Deadlines: a band above the axis, because a due date has no clock time. */}
        {due.length > 0 ? (
          <div
            className="grid gap-px border-b border-rack-600 py-1.5"
            style={{ gridTemplateColumns: `3rem repeat(${shown.length}, minmax(0, 1fr))` }}
          >
            <span className="pr-2 text-right text-[0.625rem] leading-5 text-etch-faint">due</span>
            {shown.map((day) => (
              <span key={day} className="flex flex-col gap-1 px-0.5">
                {due
                  .filter((item) => item.dueDate === day)
                  .map((item) => (
                    <Link
                      key={item.id}
                      href={`/units/${item.unitId}`}
                      title={`${item.name} — ${item.weighting}%`}
                      className={[
                        'strip block truncate rounded-[1px] px-1.5 py-1 text-[0.625rem] font-medium',
                        item.completed ? '' : 'strip-pending',
                      ].join(' ')}
                    >
                      <span
                        aria-hidden
                        className={`mr-1 inline-block h-1.5 w-1.5 align-middle ${unitPlateClass(item.unitColor)}`}
                      />
                      {item.name || 'Untitled'}
                    </Link>
                  ))}
              </span>
            ))}
          </div>
        ) : null}

        {/* The time axis and the classes seated on it. */}
        <div
          className="relative grid gap-px"
          style={{
            gridTemplateColumns: `3rem repeat(${shown.length}, minmax(0, 1fr))`,
            height: `${(axisSpan / 60) * 3.25}rem`,
          }}
        >
          <div className="relative">
            {hours.map((minute) => (
              <span
                key={minute}
                className="absolute right-2 -translate-y-1/2 text-[0.625rem] text-etch-faint"
                style={{ top: `${((minute - axisStart) / axisSpan) * 100}%` }}
              >
                {formatClock(`${String(Math.floor(minute / 60)).padStart(2, '0')}:00`)}
              </span>
            ))}
          </div>

          {shown.map((day) => {
            const weekday = isoWeekday(day);
            const onThisDay = classes.filter((entry) => entry.dayOfWeek === weekday);
            return (
              <div
                key={day}
                className={[
                  'relative border-l border-rack-600',
                  day === today ? 'bg-rack-700/35' : '',
                ].join(' ')}
              >
                {/* Hour rules, so a class can be read against the clock. */}
                {hours.map((minute) => (
                  <span
                    key={minute}
                    aria-hidden
                    className="absolute inset-x-0 h-px bg-rack-600/70"
                    style={{ top: `${((minute - axisStart) / axisSpan) * 100}%` }}
                  />
                ))}

                {onThisDay.map((entry) => {
                  const from = minutesOfDay(entry.startTime);
                  // Clamp: a class that ends before it starts would otherwise be
                  // a zero-height block, invisible and impossible to click.
                  const to = Math.max(minutesOfDay(entry.endTime), from + 30);
                  return (
                    <Link
                      key={entry.id}
                      href={`/units/${entry.unitId}`}
                      title={`${entry.unitCode ?? entry.unitName} ${entry.type} · ${formatClock(entry.startTime)}–${formatClock(entry.endTime)}${entry.location ? ` · ${entry.location}` : ''}`}
                      className="strip absolute inset-x-0.5 overflow-hidden px-1.5 py-1"
                      style={{
                        top: `${((from - axisStart) / axisSpan) * 100}%`,
                        height: `${((to - from) / axisSpan) * 100}%`,
                      }}
                    >
                      <span className="flex items-center gap-1">
                        <span
                          aria-hidden
                          className={`h-2 w-2 shrink-0 ${unitPlateClass(entry.unitColor)}`}
                        />
                        <span className="truncate text-[0.6875rem] font-semibold text-strip-ink">
                          {entry.unitCode ?? entry.unitName}
                        </span>
                      </span>
                      <span className="block truncate text-[0.625rem] capitalize text-strip-ink-soft">
                        {entry.type}
                      </span>
                      <Figure className="block truncate text-[0.625rem] text-strip-ink-soft">
                        {formatClock(entry.startTime)}
                      </Figure>
                      {entry.location ? (
                        <span className="block truncate text-[0.625rem] text-strip-ink-soft">
                          {entry.location}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
