import Link from 'next/link';
import type { ScheduledClass } from '@/lib/queries';
import { formatClock, minutesOfDay } from '@/lib/dates';
import { UnitPlate } from '@/components/unit-pill';
import { Figure, Lamp } from '@/components/ui';

/**
 * Today's classes, as one row of strips at the head of the board.
 *
 * Deliberately not the week grid. The board answers "what do I need to know
 * right now", and a seven-day grid pushes the overdue work the board exists for
 * below the fold. Today is the part of a timetable that is urgent; the rest is
 * a page away.
 */
export function TodayClasses({
  classes,
  nowMinutes,
}: {
  classes: ScheduledClass[];
  /** Minutes past midnight, so "finished" and "next" can be marked. */
  nowMinutes: number;
}) {
  if (classes.length === 0) return null;

  const upcoming = classes.filter((entry) => minutesOfDay(entry.endTime) > nowMinutes);
  const nextId = upcoming[0]?.id ?? null;

  return (
    <ul className="rack-bay flex-row flex-wrap">
      {classes.map((entry) => {
        const start = minutesOfDay(entry.startTime);
        const end = minutesOfDay(entry.endTime);
        const finished = end <= nowMinutes;
        const running = start <= nowMinutes && end > nowMinutes;

        return (
          <li key={entry.id} className="min-w-[11rem] flex-1">
            <Link
              href={`/units/${entry.unitId}`}
              className={[
                'strip flex h-full flex-col gap-1 px-3 py-2 transition-opacity',
                // A finished class stays visible but recedes: it is still part
                // of today, just not something to act on.
                finished ? 'opacity-45' : '',
              ].join(' ')}
            >
              <span className="flex items-center gap-2">
                <UnitPlate
                  color={entry.unitColor}
                  code={entry.unitCode}
                  name={entry.unitName}
                  size="sm"
                />
                <span className="truncate text-[0.6875rem] capitalize text-strip-ink-soft">
                  {entry.type}
                </span>
              </span>

              <span className="flex items-baseline gap-2">
                <Figure className="text-sm font-medium text-strip-ink">
                  {formatClock(entry.startTime)}–{formatClock(entry.endTime)}
                </Figure>
                {running ? (
                  <span className="flex items-center gap-1 text-[0.625rem] font-semibold text-strip-warn">
                    <Lamp tone="live" />
                    now
                  </span>
                ) : entry.id === nextId ? (
                  <span className="text-[0.625rem] font-medium text-strip-ink-soft">next</span>
                ) : null}
              </span>

              {entry.location ? (
                <span className="truncate text-[0.625rem] text-strip-ink-soft">
                  {entry.location}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
