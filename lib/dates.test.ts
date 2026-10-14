import { describe, expect, it } from 'vitest';
import {
  WEEKEND_DAYS,
  addDaysIso,
  daysBetween,
  describeWeek,
  formatClock,
  isValidIsoDate,
  isoWeekday,
  minutesOfDay,
  shortWeekdayName,
  startOfWeekIso,
  weekDaysIso,
} from './dates';

/**
 * The week helpers exist because the timetable grid has to show a SPECIFIC
 * week: classes repeat weekly, but assessment deadlines are dated, and putting
 * both in one grid only works if the grid knows which week it is.
 *
 * Weeks start on SUNDAY here. This is Qatar — the working week is Sunday to
 * Thursday and the weekend is Friday-Saturday. Reference dates below:
 * 2026-09-13 is a Sunday, 2026-09-14 a Monday, 2026-09-19 a Saturday.
 */

describe('startOfWeekIso', () => {
  it('returns the Sunday of that week', () => {
    // 2026-09-16 is a Wednesday.
    expect(startOfWeekIso('2026-09-16')).toBe('2026-09-13');
  });

  it('returns the day itself when it is already Sunday', () => {
    expect(startOfWeekIso('2026-09-13')).toBe('2026-09-13');
  });

  it('treats Monday as one day into its week, not the start of it', () => {
    expect(startOfWeekIso('2026-09-14')).toBe('2026-09-13');
  });

  it('keeps Saturday at the end of its week', () => {
    // The wrap case: Saturday is six days in, and must not jump forward.
    expect(startOfWeekIso('2026-09-19')).toBe('2026-09-13');
  });

  it('starts a new week on the following Sunday', () => {
    expect(startOfWeekIso('2026-09-20')).toBe('2026-09-20');
  });

  it('crosses a month boundary', () => {
    // 2026-10-01 is a Thursday; its Sunday is in September.
    expect(startOfWeekIso('2026-10-01')).toBe('2026-09-27');
  });

  it('crosses a year boundary', () => {
    // 2027-01-01 is a Friday.
    expect(startOfWeekIso('2027-01-01')).toBe('2026-12-27');
  });
});

describe('weekDaysIso', () => {
  it('gives seven consecutive days, Sunday first', () => {
    expect(weekDaysIso('2026-09-13')).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
    ]);
  });

  it('puts the Qatari weekend in the last two columns', () => {
    // The grid hides the trailing weekend when it is empty, so Friday and
    // Saturday have to be the last two — not Saturday and Sunday.
    const days = weekDaysIso(startOfWeekIso('2026-09-16'));
    expect(days.slice(5).map(isoWeekday)).toEqual([5, 6]);
    expect(days.slice(5).every((day) => WEEKEND_DAYS.has(isoWeekday(day)))).toBe(true);
  });

  it('keeps Sunday and Thursday as working days', () => {
    const days = weekDaysIso(startOfWeekIso('2026-09-16'));
    expect(WEEKEND_DAYS.has(isoWeekday(days[0]!))).toBe(false); // Sunday
    expect(WEEKEND_DAYS.has(isoWeekday(days[4]!))).toBe(false); // Thursday
  });

  it('stays valid across a daylight-saving change', () => {
    // Australian DST starts the first Sunday of October. Every day must still
    // be a real, distinct calendar date.
    const days = weekDaysIso(startOfWeekIso('2026-10-04'));
    expect(days).toHaveLength(7);
    expect(new Set(days).size).toBe(7);
    expect(days.every(isValidIsoDate)).toBe(true);
    expect(daysBetween(days[0]!, days[6]!)).toBe(6);
  });
});

describe('isoWeekday', () => {
  it.each([
    ['2026-09-14', 1],
    ['2026-09-17', 4],
    ['2026-09-19', 6],
    ['2026-09-20', 7],
  ])('maps %s to ISO weekday %i', (iso, expected) => {
    expect(isoWeekday(iso)).toBe(expected);
  });

  it('still stores ISO weekdays regardless of display order', () => {
    // Storage stays ISO (1 = Monday) even though Sunday leads the display, so
    // a class row written before this change still lands on the right column.
    expect(weekDaysIso('2026-09-13').map(isoWeekday)).toEqual([7, 1, 2, 3, 4, 5, 6]);
  });

  it('labels each column from its own date', () => {
    expect(weekDaysIso('2026-09-13').map(shortWeekdayName)).toEqual([
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
  });
});

describe('describeWeek', () => {
  it('collapses the month when the week stays inside one', () => {
    expect(describeWeek('2026-09-13')).toBe('13 – 19 Sept');
  });

  it('names both months when the week spans two', () => {
    expect(describeWeek('2026-09-27')).toBe('27 Sept – 3 Oct');
  });
});

describe('minutesOfDay', () => {
  it.each([
    ['00:00', 0],
    ['09:30', 570],
    ['13:00', 780],
    ['23:59', 1439],
  ])('converts %s to %i minutes', (clock, expected) => {
    expect(minutesOfDay(clock)).toBe(expected);
  });

  it('returns 0 for nonsense rather than NaN', () => {
    // A NaN reaches the grid as an unparseable CSS offset and the class vanishes.
    expect(minutesOfDay('not a time')).toBe(0);
    expect(minutesOfDay('')).toBe(0);
  });
});

describe('formatClock', () => {
  it.each([
    ['09:00', '9am'],
    ['09:30', '9:30am'],
    ['12:00', '12pm'],
    ['13:15', '1:15pm'],
    ['00:00', '12am'],
    ['23:45', '11:45pm'],
  ])('renders %s as %s', (clock, expected) => {
    expect(formatClock(clock)).toBe(expected);
  });
});

describe('addDaysIso across DST', () => {
  it('does not skip or repeat a day', () => {
    // Built on local noon precisely so a DST shift cannot roll the date back.
    expect(addDaysIso('2026-10-03', 1)).toBe('2026-10-04');
    expect(addDaysIso('2026-10-04', 1)).toBe('2026-10-05');
    expect(addDaysIso('2026-04-04', 1)).toBe('2026-04-05');
  });
});
