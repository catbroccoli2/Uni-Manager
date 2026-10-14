'use client';

import { useCallback, useOptimistic, useState, useTransition } from 'react';
import {
  createTimetableEntry,
  deleteTimetableEntry,
  updateTimetableEntry,
  type TimetablePatch,
} from '@/app/units/timetable-actions';
import {
  TIMETABLE_ENTRY_TYPES,
  type TimetableEntry,
  type TimetableEntryType,
} from '@/db/schema';
import { minutesOfDay } from '@/lib/dates';
import { Button } from '@/components/ui';

/**
 * A unit's recurring classes, edited in place.
 *
 * Same grammar as the assessment rack: buff strips, always-live cells,
 * optimistic writes. A class is a record of something real, so it gets clean
 * stock rather than the blank hatched kind.
 */

/**
 * Listed in the order the week is shown, not in ISO order: Sunday leads here
 * because the working week does. The stored value is still ISO (1 = Monday),
 * so only the dropdown's order changes.
 */
const DAYS: { value: number; label: string }[] = [
  { value: 7, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

type Patchable = Omit<TimetablePatch, 'id'>;

export function ClassTimes({
  unitId,
  entries,
}: {
  unitId: number;
  entries: TimetableEntry[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [rows, applyOptimistic] = useOptimistic(
    entries,
    (current: TimetableEntry[], change: { id: number; patch: Patchable }) =>
      current.map((row) =>
        row.id === change.id ? ({ ...row, ...change.patch } as TimetableEntry) : row,
      ),
  );

  const save = useCallback(
    (id: number, patch: Patchable) => {
      setError(null);
      startTransition(async () => {
        applyOptimistic({ id, patch });
        const result = await updateTimetableEntry({ id, ...patch });
        if (!result.ok) setError(result.error);
      });
    },
    [applyOptimistic],
  );

  const add = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await createTimetableEntry(unitId);
      if (!result.ok) setError(result.error);
    });
  }, [unitId]);

  const remove = useCallback((id: number) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteTimetableEntry(id);
      if (!result.ok) setError(result.error);
    });
  }, []);

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <div className="border border-dashed border-rack-600 px-5 py-8 text-center">
          <p className="text-sm text-etch-dim">
            No class times yet. Add them here and they appear on the week grid.
          </p>
          <div className="mt-3.5 flex justify-center">
            <Button type="button" variant="primary" onClick={add} disabled={pending}>
              Add a class
            </Button>
          </div>
        </div>
      ) : (
        <ul className="rack-bay">
          {rows.map((row) => {
            // A backwards time reads as a mistake, not as a zero-length class.
            const backwards = minutesOfDay(row.endTime) <= minutesOfDay(row.startTime);
            return (
              <li
                key={row.id}
                className="strip flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
              >
                <label className="flex items-center gap-1.5">
                  <span className="sr-only">Day</span>
                  <select
                    value={row.dayOfWeek}
                    aria-label={`Day for the ${row.type}`}
                    onChange={(event) => save(row.id, { dayOfWeek: Number(event.target.value) })}
                    className={CELL}
                  >
                    {DAYS.map((day) => (
                      <option key={day.value} value={day.value}>
                        {day.label}
                      </option>
                    ))}
                  </select>
                </label>

                <span className="flex items-center gap-1">
                  <Clock
                    value={row.startTime}
                    label="Start time"
                    onCommit={(startTime) => save(row.id, { startTime })}
                  />
                  <span aria-hidden className="text-xs text-strip-ink-soft">
                    –
                  </span>
                  <Clock
                    value={row.endTime}
                    label="End time"
                    onCommit={(endTime) => save(row.id, { endTime })}
                  />
                </span>

                <label className="flex items-center gap-1.5">
                  <span className="sr-only">Class type</span>
                  <select
                    value={row.type}
                    aria-label="Class type"
                    onChange={(event) =>
                      save(row.id, { type: event.target.value as TimetableEntryType })
                    }
                    className={`${CELL} capitalize`}
                  >
                    {TIMETABLE_ENTRY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <input
                  type="text"
                  value={row.location ?? ''}
                  aria-label="Location"
                  placeholder="Location"
                  onChange={(event) => save(row.id, { location: event.target.value })}
                  className={`${CELL} min-w-0 flex-1`}
                />

                {backwards ? (
                  <span className="rounded-[1px] bg-strip-alert px-1.5 py-px text-[0.625rem] font-semibold text-strip">
                    ends before it starts
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  aria-label={`Remove the ${row.type} on ${DAYS.find((d) => d.value === row.dayOfWeek)?.label ?? 'this day'}`}
                  title="Remove"
                  className="rounded-[1px] p-1 text-strip-ink-soft transition-colors hover:bg-lamp-over hover:text-rack-900"
                >
                  <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" aria-hidden fill="none">
                    <path
                      d="M3 3l8 8M11 3l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 ? (
        <Button type="button" onClick={add} disabled={pending}>
          Add a class
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-lamp-over">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CELL =
  'rounded-[1px] border border-transparent bg-transparent px-1.5 py-1 text-sm ' +
  'text-strip-ink placeholder:text-strip-ink-soft/70 ' +
  'hover:border-strip-ink/25 focus:border-strip-ink/60 focus:bg-strip/60 focus:outline-none';

/**
 * A time cell. `type="time"` gives keyboard entry, a picker, and locale-correct
 * display for free, while still storing the 'HH:MM' the grid needs.
 */
function Clock({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (next: string) => void;
}) {
  return (
    <input
      type="time"
      value={value}
      aria-label={label}
      onChange={(event) => {
        if (event.target.value) onCommit(event.target.value);
      }}
      className={`${CELL} font-mono text-xs tabular-nums [color-scheme:light]`}
    />
  );
}
