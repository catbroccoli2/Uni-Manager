/**
 * Calendar-day helpers.
 *
 * Dates in this app are ISO 'YYYY-MM-DD' strings, never Date objects or epoch
 * timestamps — see the note at the top of db/schema.ts. These functions keep
 * that invariant: they take and return strings, and the only place a `Date` is
 * constructed is where the *local* calendar day genuinely has to be read off
 * the clock.
 *
 * The trap this avoids: `new Date('2026-03-14')` parses as midnight UTC, so in
 * Australia it is already the 14th at 11am while in California it is still the
 * 13th at 5pm. Formatting that value with a timezone-aware formatter shows the
 * wrong day. Everything below works on the string, or on a Date deliberately
 * constructed at local noon where arithmetic is needed.
 */

/** Today, as the local calendar day. */
export function todayIso(): string {
  return toIso(new Date());
}

export function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Local noon for an ISO day. Noon rather than midnight so that adding or
 * subtracting days cannot cross a daylight-saving boundary and land on the
 * previous date.
 */
function atLocalNoon(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

export function addDaysIso(iso: string, days: number): string {
  const date = atLocalNoon(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const ms = atLocalNoon(to).getTime() - atLocalNoon(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = atLocalNoon(value);
  // Rejects 2026-02-31, which Date would silently roll into March.
  return toIso(date) === value;
}

const WEEKDAY_MONTH = new Intl.DateTimeFormat('en-AU', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const DAY_MONTH = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });

export function formatDueDate(iso: string): string {
  return WEEKDAY_MONTH.format(atLocalNoon(iso));
}

export function formatShortDate(iso: string): string {
  return DAY_MONTH.format(atLocalNoon(iso));
}

/**
 * How a due date reads relative to today, in the product's own language.
 * "3 days overdue" names the problem; "in 3 days" names the runway.
 */
export function describeDueDate(iso: string, today: string = todayIso()): string {
  const delta = daysBetween(today, iso);
  if (delta === 0) return 'Due today';
  if (delta === 1) return 'Due tomorrow';
  if (delta === -1) return '1 day overdue';
  if (delta < 0) return `${Math.abs(delta)} days overdue`;
  return `In ${delta} days`;
}

/**
 * Which ISO weekday a week starts on. **7 = Sunday**, because this is Qatar:
 * the working week runs Sunday to Thursday and the weekend is Friday-Saturday.
 *
 * Storage is unaffected — `timetable_entries.day_of_week` stays ISO-8601
 * (1 = Monday … 7 = Sunday), which is a standard worth keeping. This constant
 * only decides the order days are *shown* in, so moving the app to a
 * Monday-start country is a one-line change and no migration.
 */
export const WEEK_STARTS_ON = 7;

/**
 * The ISO weekdays that make up the weekend, in display terms.
 *
 * Friday and Saturday in Qatar, not Saturday and Sunday. The week grid hides
 * these when nothing is scheduled on them, so getting this wrong would hide
 * Thursday — a normal teaching day — and show Sunday as a weekend.
 */
export const WEEKEND_DAYS: ReadonlySet<number> = new Set([5, 6]);

/**
 * The first day of the week containing `iso`, per `WEEK_STARTS_ON`.
 *
 * The modulo handles the wrap: with a Sunday start, a Monday is one day into
 * its week and a Saturday is six, and neither should jump to another week.
 */
export function startOfWeekIso(iso: string = todayIso()): string {
  const offset = (isoWeekday(iso) - WEEK_STARTS_ON + 7) % 7;
  return addDaysIso(iso, -offset);
}

/** The seven days of the week starting at `weekStart`, in display order. */
export function weekDaysIso(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => addDaysIso(weekStart, offset));
}

const SHORT_WEEKDAY = new Intl.DateTimeFormat('en-AU', { weekday: 'short' });

/**
 * "Sun", "Mon" … derived from the date itself rather than a fixed array, so a
 * column label can never drift out of step with the column's actual day.
 */
export function shortWeekdayName(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return SHORT_WEEKDAY.format(new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12));
}

/** ISO-8601 weekday for a date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12).getDay() || 7;
}

const WEEK_RANGE = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' });

/** "15 – 21 Sept" for a week, collapsing the month when both ends share one. */
export function describeWeek(weekStart: string): string {
  const end = addDaysIso(weekStart, 6);
  const [sy, sm, sd] = weekStart.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const from = new Date(sy ?? 1970, (sm ?? 1) - 1, sd ?? 1, 12);
  const to = new Date(ey ?? 1970, (em ?? 1) - 1, ed ?? 1, 12);
  if (sm === em) return `${sd} – ${WEEK_RANGE.format(to)}`;
  return `${WEEK_RANGE.format(from)} – ${WEEK_RANGE.format(to)}`;
}

/** 'HH:MM' as minutes past midnight, for laying a class out on a time axis. */
export function minutesOfDay(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** "9:00am", for labelling a class without the dead weight of "09:00". */
export function formatClock(clock: string): string {
  const total = minutesOfDay(clock);
  const hours24 = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return minutes === 0 ? `${hours12}${suffix}` : `${hours12}:${String(minutes).padStart(2, '0')}${suffix}`;
}

export type DueUrgency = 'overdue' | 'today' | 'soon' | 'later';

export function dueUrgency(iso: string, today: string = todayIso()): DueUrgency {
  const delta = daysBetween(today, iso);
  if (delta < 0) return 'overdue';
  if (delta === 0) return 'today';
  if (delta <= 3) return 'soon';
  return 'later';
}
