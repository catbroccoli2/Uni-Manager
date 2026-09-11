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

export type DueUrgency = 'overdue' | 'today' | 'soon' | 'later';

export function dueUrgency(iso: string, today: string = todayIso()): DueUrgency {
  const delta = daysBetween(today, iso);
  if (delta < 0) return 'overdue';
  if (delta === 0) return 'today';
  if (delta <= 3) return 'soon';
  return 'later';
}
