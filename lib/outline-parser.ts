import { addDaysIso, isValidIsoDate, toIso } from '@/lib/dates';
import { clampNumber } from '@/lib/grades';
import {
  ASSESSMENT_TYPES,
  TIMETABLE_ENTRY_TYPES,
  type AssessmentType,
  type TimetableEntryType,
} from '@/db/schema';

/**
 * Reads a unit outline that has been pasted as text and proposes a draft.
 *
 * PRD.md §9 specifies this as a Claude API feature reading the PDF directly.
 * This is the offline variant, chosen with the user: it needs no API key, costs
 * nothing to run, adds no dependency, and keeps CLAUDE.md's "no external
 * network calls" rule intact. The trade is that it only sees text somebody
 * could select and copy — a scanned outline gives it nothing.
 *
 * Two rules run through the whole file, and they are what make a guessing
 * parser safe to put in front of a database:
 *
 * 1. **Never invent.** A line that cannot be placed goes to `unmatched`, where
 *    the user can see it. Producing a plausible-looking assessment nobody wrote
 *    is far worse than producing nothing.
 * 2. **Show the evidence.** Every row carries the line it came from and a
 *    confidence, so the review screen can justify itself rather than asking the
 *    user to trust a number that appeared from nowhere.
 *
 * Nothing here touches the database. The caller reviews the draft, edits it,
 * and only then commits.
 */

export type Confidence = 'high' | 'low';

interface Traced {
  /** The line this row was read from, shown in review as its justification. */
  sourceLine: string;
  confidence: Confidence;
}

export interface DraftAssessment extends Traced {
  name: string;
  dueDate: string | null;
  weighting: number;
  maxMark: number;
  type: AssessmentType;
}

export interface DraftTimetableEntry extends Traced {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string | null;
  type: TimetableEntryType;
}

export interface DraftSource extends Traced {
  title: string;
  urlOrFileRef: string | null;
}

export interface OutlineDraft {
  unit: {
    code: string | null;
    name: string | null;
    creditPoints: number | null;
  };
  assessments: DraftAssessment[];
  timetable: DraftTimetableEntry[];
  sources: DraftSource[];
  /** Lines that were not placed anywhere. Surfaced, never discarded. */
  unmatched: string[];
}

export interface ParseOptions {
  /**
   * The semester's start date, if known. Outlines often say "Week 7" rather
   * than a date; without this there is nothing to count from, so those
   * assessments come back with no date instead of a guessed one.
   */
  semesterStart?: string | null;
}

const EMPTY_DRAFT: OutlineDraft = {
  unit: { code: null, name: null, creditPoints: null },
  assessments: [],
  timetable: [],
  sources: [],
  unmatched: [],
};

export function parseOutline(text: string, options: ParseOptions = {}): OutlineDraft {
  const lines = normalise(text);
  if (lines.length === 0) return { ...EMPTY_DRAFT };

  const used = new Set<number>();

  const unit = readUnit(lines, used);
  const assessments = readAssessments(lines, used, options.semesterStart ?? null);
  const timetable = readTimetable(lines, used);
  const sources = readSources(lines, used);

  const unmatched = lines
    .map((line, index) => (used.has(index) ? null : line))
    .filter((line): line is string => line !== null && isWorthReporting(line));

  return { unit, assessments, timetable, sources, unmatched };
}

/* -------------------------------------------------------------------------- */
/* Normalising                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A PDF table pasted as text loses its columns: cells become runs of spaces, or
 * separate lines, in an order that depends on the reader. This collapses the
 * runs to single spaces but keeps line structure, and drops the page furniture
 * that would otherwise look like content.
 */
function normalise(text: string): string[] {
  const raw = text
    .replace(/\r\n?/g, '\n')
    // Non-breaking spaces are everywhere in PDF text and break every regex
    // below if left in.
    .replace(/ /g, ' ')
    .split('\n')
    // Runs of spaces collapse to exactly two, not to one. A run of spaces is
    // where a table column used to be, and after the paste it is the only
    // surviving evidence that a line was a table row rather than a sentence.
    .map((line) => line.replace(/\t/g, '  ').replace(/ {2,}/g, '  ').trim());

  // A line repeated many times is a running header or footer, not content.
  const counts = new Map<string, number>();
  for (const line of raw) {
    if (line.length > 3) counts.set(line, (counts.get(line) ?? 0) + 1);
  }

  return raw.filter((line) => {
    if (line === '') return false;
    if (/^page \d+( of \d+)?$/i.test(line)) return false;
    if (/^\d{1,3}$/.test(line)) return false; // a bare page number
    if ((counts.get(line) ?? 0) >= 3) return false;
    return true;
  });
}

const FURNITURE_WORDS = new Set([
  'assessment', 'assessments', 'task', 'tasks', 'item', 'items', 'weighting',
  'weight', 'due', 'date', 'dates', 'value', 'type', 'description', 'title',
  'unit', 'outline', 'guide', 'schedule', 'name', 'mark', 'marks', 'total',
  'of', 'and', 'the', 'classes', 'class',
]);

/**
 * Keeps `unmatched` worth reading.
 *
 * The list exists so nothing goes missing silently, which only works if it is
 * short enough to actually scan. A column header is not lost content — it is
 * the table's own scaffolding — so it is dropped rather than reported. Anything
 * carrying real words stays, even when the parser could not use it.
 */
function isWorthReporting(line: string): boolean {
  if (line.length < 8 || !/\s/.test(line)) return false;

  const words = line.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return false;
  return !words.every((word) => FURNITURE_WORDS.has(word));
}

/* -------------------------------------------------------------------------- */
/* Unit details                                                                */
/* -------------------------------------------------------------------------- */

const UNIT_CODE = /\b([A-Z]{2,4}\s?\d{4})\b/;
const CREDIT_POINTS = /(\d+(?:\.\d+)?)\s*(?:credit\s*points?|\bcp\b)/i;

function readUnit(lines: string[], used: Set<number>): OutlineDraft['unit'] {
  let code: string | null = null;
  let name: string | null = null;
  let creditPoints: number | null = null;

  for (const [index, line] of lines.entries()) {
    if (code === null) {
      const match = UNIT_CODE.exec(line);
      if (match?.[1]) {
        code = match[1].replace(/\s/g, '');
        used.add(index);

        // The unit's name usually sits beside its code, or on the next line.
        const beside = line
          .replace(match[0], ' ')
          .replace(/^[\s\-–—:|]+|[\s\-–—:|]+$/g, '')
          .trim();
        if (looksLikeUnitName(beside)) {
          name = beside;
        } else {
          const next = lines[index + 1];
          if (next && looksLikeUnitName(next)) {
            name = next;
            used.add(index + 1);
          }
        }
      }
    }

    if (creditPoints === null) {
      const match = CREDIT_POINTS.exec(line);
      if (match?.[1]) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value > 0 && value <= 200) {
          creditPoints = value;
          used.add(index);
        }
      }
    }
  }

  return { code, name, creditPoints };
}

function looksLikeUnitName(candidate: string): boolean {
  if (candidate.length < 3 || candidate.length > 90) return false;
  // Reject anything that reads as a label or a sentence rather than a title.
  if (/[.!?]$/.test(candidate)) return false;
  if (/^(unit|subject|course)\s+(code|outline|guide)\b/i.test(candidate)) return false;
  return /[A-Za-z]/.test(candidate);
}

/* -------------------------------------------------------------------------- */
/* Assessments                                                                 */
/* -------------------------------------------------------------------------- */

/** `40%`, `40 %`, `Weighting: 40`, `Weight 7.5%`. */
const WEIGHTING =
  /(?:weight(?:ing)?|value)\s*[:\-–—]?\s*(\d{1,3}(?:\.\d+)?)\s*%?|(\d{1,3}(?:\.\d+)?)\s*%/i;

/**
 * `out of 25`, `marked out of 25`, or a standalone `/ 25`.
 *
 * The bare-slash form must not be preceded by a digit, or every `16/03/2026`
 * would read as "out of 3" and quietly rescale the assessment.
 */
const OUT_OF = /(?:\bout\s+of\s+(\d{1,4}(?:\.\d+)?)|(?:^|[\s(])\/\s*(\d{1,4}(?:\.\d+)?)\b)/i;

const WEEK_REFERENCE = /\bweek\s*(\d{1,2})\b/i;

function readAssessments(
  lines: string[],
  used: Set<number>,
  semesterStart: string | null,
): DraftAssessment[] {
  const drafts: DraftAssessment[] = [];

  for (const [index, line] of lines.entries()) {
    if (used.has(index)) continue;

    const weightingMatch = WEIGHTING.exec(line);
    const weighting = readWeighting(line);
    if (weighting === null || !weightingMatch) continue;

    /*
      Read the date and the "out of" from the line WITHOUT its weighting. Left
      in, a lone "7.5%" cell parses as a numeric date — day 7, month 5 — and the
      assessment silently lands in May.
    */
    const rest = line.replace(weightingMatch[0], ' ');
    let dated = readDate(rest, semesterStart);
    const outOf = readOutOf(rest);

    let name = readName(line);
    let nameLine = index;
    const extraLines: number[] = [];
    let confidence: Confidence = 'high';

    if (name === null) {
      /*
        The cell-per-line case: a table pasted one cell at a time leaves the
        weighting alone on its own line, with the name above it and the date
        below. Walk back for the name, then forward for the date.
      */
      const previous = findLabelAbove(lines, index, used);
      if (previous === null) continue;
      name = previous.text;
      nameLine = previous.index;

      if (dated === null) {
        const ahead = findDateBelow(lines, index, used, semesterStart);
        if (ahead) {
          dated = ahead.date;
          extraLines.push(ahead.index);
        }
      }
    }

    /*
      "Students must achieve 50% overall to pass this unit." carries a
      percentage and a readable name, and is not an assessment. A line earns a
      row only if something corroborates it: a date, an "out of", a table
      column, or a name that reads like an assessment title.
    */
    if (dated === null && outOf === null && !isTabular(line) && !looksLikeTaskName(name)) {
      continue;
    }
    if (dated === null && outOf === null) confidence = 'low';
    if (dated?.confidence === 'low') confidence = 'low';

    used.add(index);
    used.add(nameLine);
    for (const extra of extraLines) used.add(extra);

    drafts.push({
      name: tidy(name),
      dueDate: dated?.iso ?? null,
      weighting: clampNumber(weighting, 0, 100),
      // Defaults to 100 for the same reason the rack does: an outline that does
      // not say what something is out of is quoting a percentage.
      maxMark: outOf ?? 100,
      type: readType(line, name),
      sourceLine: tidy(line),
      confidence,
    });
  }

  return drafts;
}

/** Collapses the column spacing kept through normalising, for display. */
function tidy(value: string): string {
  return value.replace(/\s{2,}/g, ' ').trim();
}

/** A line that still carries the column gaps of the table it came from. */
function isTabular(line: string): boolean {
  return /\s{2,}/.test(line);
}

const TASK_WORDS =
  /\b(assessment|assignment|task|essay|report|quiz|test|exam(ination)?|project|presentation|portfolio|lab|tutorial|participation|problem\s+set|case\s+study|reflection|journal|thesis|dissertation|pitch|poster|viva)\b/i;

function looksLikeTaskName(name: string): boolean {
  return TASK_WORDS.test(name);
}

/** The cell-per-line counterpart to findLabelAbove: the date sits just below. */
function findDateBelow(
  lines: string[],
  from: number,
  used: Set<number>,
  semesterStart: string | null,
): { date: ReadDate; index: number } | null {
  for (let index = from + 1; index < lines.length && index <= from + 2; index += 1) {
    if (used.has(index)) continue;
    const line = lines[index];
    if (!line) continue;
    // Another weighting means the next record has started.
    if (readWeighting(line) !== null) return null;
    const date = readDate(line, semesterStart);
    if (date) return { date, index };
  }
  return null;
}

function readWeighting(line: string): number | null {
  const match = WEIGHTING.exec(line);
  const raw = match?.[1] ?? match?.[2];
  if (raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return value;
}

function readOutOf(line: string): number | null {
  const match = OUT_OF.exec(line);
  const raw = match?.[1] ?? match?.[2];
  if (raw === undefined) return null;
  const value = Number(raw);
  // A "/" date like 14/04 must not be read as "out of 4".
  if (!Number.isFinite(value) || value <= 0 || value > 10000) return null;
  return value;
}

/** The text before the weighting, once labels and separators are stripped. */
function readName(line: string): string | null {
  const match = WEIGHTING.exec(line);
  if (!match) return null;

  let candidate = line.slice(0, match.index);
  candidate = candidate
    .replace(/\b(assessment|task|item)\s+(type|name|title)\b\s*[:\-–—]?/i, '')
    .replace(/[\s\-–—:|.]+$/g, '')
    .trim();

  // Needs to read as a title, not as a stray figure or a one-word column.
  if (candidate.length < 3) return null;
  if (!/[a-z]{3}/i.test(candidate)) return null;
  return candidate;
}

function findLabelAbove(
  lines: string[],
  from: number,
  used: Set<number>,
): { text: string; index: number } | null {
  for (let index = from - 1; index >= 0 && index >= from - 4; index -= 1) {
    if (used.has(index)) continue;
    const line = lines[index];
    if (!line) continue;
    // Skip other cells of the same row: dates, figures, bare percentages.
    if (readWeighting(line) !== null) continue;
    if (!/[a-z]{3}/i.test(line)) continue;
    if (isHeadingLike(line)) continue;
    if (line.length < 3 || line.length > 120) continue;
    return { text: line.replace(/[\s\-–—:|.]+$/g, '').trim(), index };
  }
  return null;
}

function isHeadingLike(line: string): boolean {
  return /^(assessment|task|item|due|date|weight(ing)?|value|type|description)s?\b[:\s]*$/i.test(
    line,
  );
}

function readType(line: string, name: string): AssessmentType {
  const haystack = `${line} ${name}`.toLowerCase();
  if (/\bteam[-\s]?based\b/.test(haystack)) return 'team-based';
  if (/\b(group|pair)\b/.test(haystack)) return 'group';
  if (ASSESSMENT_TYPES.includes('individual')) return 'individual';
  return 'individual';
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_NAMES = Object.keys(MONTHS).join('|');

interface ReadDate {
  iso: string;
  confidence: Confidence;
}

/**
 * Australian outlines, so a bare numeric date is read as DD/MM — 04/05 is the
 * 4th of May, not the 5th of April. Guessing the other way round would put
 * assessments on the wrong day for most of the year without ever looking wrong.
 */
function readDate(line: string, semesterStart: string | null): ReadDate | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(line);
  if (iso) {
    const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`;
    if (isValidIsoDate(candidate)) return { iso: candidate, confidence: 'high' };
  }

  const numeric = /\b(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?\b/.exec(line);
  if (numeric?.[1] && numeric[2]) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year = resolveYear(numeric[3], semesterStart);
    const candidate = formatIso(year, month, day);
    if (candidate && isValidIsoDate(candidate)) {
      return { iso: candidate, confidence: numeric[3] ? 'high' : 'low' };
    }
  }

  /*
    Month names are matched by name, not as "any word next to a number". An
    open [A-Za-z]{3,9} matches "Essay 1" before it ever reaches "April 14", and
    because the first match wins, the real date is never seen.
  */
  const dayFirst = new RegExp(
    String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_NAMES})[a-z]*\.?\s*,?\s*(\d{4})?\b`,
    'i',
  ).exec(line);
  const monthFirst = new RegExp(
    String.raw`\b(${MONTH_NAMES})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})?\b`,
    'i',
  ).exec(line);

  /*
    Both orders can match the same line: in "Essay 1 April 14, 2026" the
    day-first pattern finds "1 April" (the item number, not a date) while the
    month-first pattern finds the real "April 14, 2026". Prefer the match
    carrying a year, then the longer one — the reading that explains more of
    the line is the reading that is actually a date.
  */
  const candidates = [
    dayFirst ? { day: dayFirst[1], month: dayFirst[2], year: dayFirst[3], len: dayFirst[0].length } : null,
    monthFirst
      ? { day: monthFirst[2], month: monthFirst[1], year: monthFirst[3], len: monthFirst[0].length }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  const named =
    candidates.sort((a, b) => {
      const byYear = Number(Boolean(b.year)) - Number(Boolean(a.year));
      return byYear !== 0 ? byYear : b.len - a.len;
    })[0] ?? null;

  if (named?.day && named.month) {
    const month = MONTHS[named.month.slice(0, 3).toLowerCase()];
    const day = Number(named.day);
    if (month && Number.isFinite(day)) {
      const year = resolveYear(named.year, semesterStart);
      const candidate = formatIso(year, month, day);
      if (candidate && isValidIsoDate(candidate)) {
        return { iso: candidate, confidence: named.year ? 'high' : 'low' };
      }
    }
  }

  // "Week 7" is only a date relative to when the semester started.
  const week = WEEK_REFERENCE.exec(line);
  if (week?.[1] && semesterStart && isValidIsoDate(semesterStart)) {
    const number = Number(week[1]);
    if (number >= 1 && number <= 52) {
      // Week 1 is the week the semester starts, so week N begins N-1 weeks in.
      return { iso: addDaysIso(semesterStart, (number - 1) * 7), confidence: 'low' };
    }
  }

  return null;
}

function resolveYear(raw: string | undefined, semesterStart: string | null): number {
  if (raw) {
    const value = Number(raw);
    if (raw.length === 2) return 2000 + value;
    if (Number.isFinite(value)) return value;
  }
  // No year on the line: the semester's own year is a better guess than today's.
  if (semesterStart && isValidIsoDate(semesterStart)) {
    return Number(semesterStart.slice(0, 4));
  }
  return new Date().getFullYear();
}

function formatIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return toIso(new Date(year, month - 1, day, 12));
}

/* -------------------------------------------------------------------------- */
/* Timetable                                                                   */
/* -------------------------------------------------------------------------- */

const DAYS: Record<string, number> = {
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7,
};

const TIME_RANGE =
  /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;

function readTimetable(lines: string[], used: Set<number>): DraftTimetableEntry[] {
  const entries: DraftTimetableEntry[] = [];

  for (const [index, line] of lines.entries()) {
    if (used.has(index)) continue;

    const dayMatch = /\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/i.exec(line);
    if (!dayMatch?.[1]) continue;
    const dayOfWeek = DAYS[dayMatch[1].toLowerCase()];
    if (dayOfWeek === undefined) continue;

    const time = TIME_RANGE.exec(line);
    if (!time) continue;

    const startTime = toClock(time[1], time[2], time[3] ?? time[6]);
    const endTime = toClock(time[4], time[5], time[6]);
    if (!startTime || !endTime) continue;

    const type = readClassType(line);

    used.add(index);
    entries.push({
      dayOfWeek,
      startTime,
      endTime,
      location: readLocation(line, dayMatch[0], time[0]),
      type,
      sourceLine: line,
      // A class line with no stated type is a guess about what it is.
      confidence: type === 'other' ? 'low' : 'high',
    });
  }

  return entries;
}

function toClock(hour: string | undefined, minute: string | undefined, meridiem: string | undefined): string | null {
  if (hour === undefined) return null;
  let value = Number(hour);
  if (!Number.isFinite(value) || value < 0 || value > 24) return null;
  const suffix = meridiem?.toLowerCase();
  if (suffix === 'pm' && value < 12) value += 12;
  if (suffix === 'am' && value === 12) value = 0;
  if (value > 23) return null;
  const mins = minute ?? '00';
  if (Number(mins) > 59) return null;
  return `${String(value).padStart(2, '0')}:${mins.padStart(2, '0')}`;
}

function readClassType(line: string): TimetableEntryType {
  const lower = line.toLowerCase();
  for (const type of TIMETABLE_ENTRY_TYPES) {
    if (type !== 'other' && lower.includes(type)) return type;
  }
  if (/\bseminar\b/.test(lower)) return 'workshop';
  if (/\bprac(tical)?\b/.test(lower)) return 'lab';
  if (/\btut\b/.test(lower)) return 'tutorial';
  if (/\blec\b/.test(lower)) return 'lecture';
  return 'other';
}

function readLocation(line: string, day: string, time: string): string | null {
  const rest = line
    .replace(day, ' ')
    .replace(time, ' ')
    .replace(/\b(lecture|tutorial|lab|workshop|seminar|practical|tut|lec|prac)\b/gi, ' ')
    .replace(/[\s\-–—:|,]+/g, ' ')
    .trim();
  return rest.length >= 2 ? rest : null;
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                     */
/* -------------------------------------------------------------------------- */

const URL_PATTERN = /\bhttps?:\/\/\S+/i;
const SOURCE_HEADING =
  /^(required|prescribed|recommended)?\s*(readings?|resources?|texts?|textbooks?|bibliograph(y|ies))\b/i;

/**
 * The weakest extraction here, and kept deliberately narrow. Readings are free
 * prose with no consistent shape, so this takes only two things it can defend:
 * a line carrying a URL, and lines directly beneath a readings heading. Anything
 * else is left for `unmatched` rather than guessed at.
 */
function readSources(lines: string[], used: Set<number>): DraftSource[] {
  const sources: DraftSource[] = [];
  let underHeading = false;

  for (const [index, line] of lines.entries()) {
    if (used.has(index)) continue;

    if (SOURCE_HEADING.test(line)) {
      underHeading = true;
      used.add(index);
      continue;
    }

    const url = URL_PATTERN.exec(line)?.[0] ?? null;

    if (url) {
      const title = line.replace(url, '').replace(/[\s\-–—:|]+$/g, '').trim();
      used.add(index);
      sources.push({
        title: title.length >= 3 ? title : url,
        urlOrFileRef: url,
        sourceLine: line,
        confidence: 'high',
      });
      continue;
    }

    if (underHeading) {
      // A new heading ends the run, rather than swallowing the rest of the file.
      if (/^[A-Z][A-Za-z\s]{2,40}$/.test(line) && !/[.,;]/.test(line)) {
        underHeading = false;
        continue;
      }
      if (line.length >= 8 && /[a-z]{3}/i.test(line)) {
        used.add(index);
        sources.push({
          title: line,
          urlOrFileRef: null,
          sourceLine: line,
          confidence: 'low',
        });
      }
    }
  }

  return sources;
}
