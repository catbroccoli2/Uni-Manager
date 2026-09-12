import { describe, expect, it } from 'vitest';
import { parseOutline } from './outline-parser';
import { REAL_OUTLINE } from './__fixtures__/real-outline';

/**
 * Fixtures are shaped like real pasted outlines, not like convenient input.
 * The four table shapes below are the ones that actually come out of a PDF:
 * one row per line, one cell per line, week references instead of dates, and
 * marks out of something other than 100.
 */

const SEMESTER_START = '2026-03-02';

const ROW_PER_LINE = `
Unit Outline
BUSM2301 Business Digitilization
12 credit points

Assessment Schedule

Assessment Task                 Weighting   Due Date
Assessment 1: Online Test       10%         16/03/2026
Assessment 2: Group Report      40%         14/04/2026
Assessment 3: Presentation      20%         12/05/2026
Final Examination               30%         19/06/2026
`;

const CELL_PER_LINE = `
STAT1020
Statistical Reasoning

Assessment
Weighting
Due

Problem Set 1
7.5%
16/03/2026
Problem Set 2
7.5%
30/03/2026
Mid-semester Test
30%
27/04/2026
Final Examination
40%
19/06/2026
`;

const WEEK_REFERENCES = `
PHIL2044 Ethics and Technology
Essay 1                 30%     Week 4
Seminar Participation   20%     Week 8
Essay 2                 50%     Week 12
`;

const OUT_OF_MARKS = `
COMP1010 Introduction to Programming
Lab Quizzes        20%   marked out of 40   16/03/2026
Major Project      45%   / 90               11/05/2026
Final Examination  35%   out of 70          19/06/2026
`;

const WITH_TIMETABLE = `
MKTG2001 Consumer Behaviour
Classes
Monday 10:00 - 12:00 Lecture Building 3 Room 14
Wednesday 2pm-3pm Tutorial Room B12
Friday 9:30–11:30 Lab Computer Lab 2

Assessment 1: Case Study   35%   20/04/2026
`;

const WITH_READINGS = `
HIST1001 Modern History
Required Readings
Hobsbawm, E. The Age of Extremes, 1994
Judt, T. Postwar: A History of Europe Since 1945
Library guide https://library.example.edu/hist1001

Assessment 1: Source Analysis  40%  20/04/2026
`;

const PROSE_ONLY = `
Welcome to the unit. This unit introduces students to the foundations of the
discipline and builds on material covered in earlier study. Attendance at all
scheduled classes is expected, and students should consult the learning
management system regularly for announcements and updates.
`;

describe('parseOutline — assessments', () => {
  it('reads a table pasted one row per line', () => {
    const draft = parseOutline(ROW_PER_LINE, { semesterStart: SEMESTER_START });

    expect(draft.assessments).toHaveLength(4);
    expect(draft.assessments.map((a) => a.name)).toEqual([
      'Assessment 1: Online Test',
      'Assessment 2: Group Report',
      'Assessment 3: Presentation',
      'Final Examination',
    ]);
    expect(draft.assessments.map((a) => a.weighting)).toEqual([10, 40, 20, 30]);
    expect(draft.assessments.reduce((sum, a) => sum + a.weighting, 0)).toBe(100);
    expect(draft.assessments[0]?.dueDate).toBe('2026-03-16');
    expect(draft.assessments[3]?.dueDate).toBe('2026-06-19');
  });

  it('reads a table pasted one cell per line', () => {
    const draft = parseOutline(CELL_PER_LINE, { semesterStart: SEMESTER_START });

    expect(draft.assessments.map((a) => a.name)).toEqual([
      'Problem Set 1',
      'Problem Set 2',
      'Mid-semester Test',
      'Final Examination',
    ]);
    expect(draft.assessments.map((a) => a.weighting)).toEqual([7.5, 7.5, 30, 40]);
    expect(draft.assessments[0]?.dueDate).toBe('2026-03-16');
  });

  it('resolves week references against the semester start', () => {
    const draft = parseOutline(WEEK_REFERENCES, { semesterStart: SEMESTER_START });

    // Week 1 is the starting week, so week 4 begins three weeks in.
    expect(draft.assessments[0]?.dueDate).toBe('2026-03-23');
    expect(draft.assessments[2]?.dueDate).toBe('2026-05-18');
    // A week number is an approximation, and says so.
    expect(draft.assessments.every((a) => a.confidence === 'low')).toBe(true);
  });

  it('leaves week references undated when no semester start is known', () => {
    const draft = parseOutline(WEEK_REFERENCES);
    expect(draft.assessments).toHaveLength(3);
    // Never guess a date off today's clock — an undated draft is honest.
    expect(draft.assessments.every((a) => a.dueDate === null)).toBe(true);
  });

  it('reads what each assessment is marked out of', () => {
    const draft = parseOutline(OUT_OF_MARKS, { semesterStart: SEMESTER_START });
    expect(draft.assessments.map((a) => a.maxMark)).toEqual([40, 90, 70]);
    expect(draft.assessments.map((a) => a.weighting)).toEqual([20, 45, 35]);
  });

  it('defaults maxMark to 100 when the outline does not say', () => {
    const draft = parseOutline(ROW_PER_LINE, { semesterStart: SEMESTER_START });
    expect(draft.assessments.every((a) => a.maxMark === 100)).toBe(true);
  });

  it('reads individual, group and team-based types', () => {
    const draft = parseOutline(
      `
      Assessment 1: Online Test          10%  16/03/2026
      Assessment 2: Group Report         40%  14/04/2026
      Assessment 3: Team-based Pitch     20%  12/05/2026
      `,
      { semesterStart: SEMESTER_START },
    );
    expect(draft.assessments.map((a) => a.type)).toEqual([
      'individual',
      'group',
      'team-based',
    ]);
  });

  it('carries the source line and a confidence on every row', () => {
    const draft = parseOutline(ROW_PER_LINE, { semesterStart: SEMESTER_START });
    for (const assessment of draft.assessments) {
      expect(assessment.sourceLine).toContain(assessment.name);
      expect(['high', 'low']).toContain(assessment.confidence);
    }
  });
});

describe('parseOutline — never inventing', () => {
  it('returns an empty draft for prose with no table', () => {
    const draft = parseOutline(PROSE_ONLY, { semesterStart: SEMESTER_START });
    expect(draft.assessments).toEqual([]);
    expect(draft.timetable).toEqual([]);
    // The text is still reported rather than silently swallowed.
    expect(draft.unmatched.length).toBeGreaterThan(0);
  });

  it('returns an empty draft for empty input rather than throwing', () => {
    for (const input of ['', '   ', '\n\n\n']) {
      const draft = parseOutline(input);
      expect(draft.assessments).toEqual([]);
      expect(draft.unit.code).toBeNull();
      expect(draft.unmatched).toEqual([]);
    }
  });

  it('does not turn a percentage in a sentence into an assessment', () => {
    const draft = parseOutline(
      `
      Students must achieve 50% overall to pass this unit.
      Attendance of 80% at scheduled classes is expected.
      `,
      { semesterStart: SEMESTER_START },
    );
    expect(draft.assessments).toEqual([]);
  });

  it('leaves a table header out of the unplaced list', () => {
    // A column header is the table's own scaffolding, not lost content. The
    // list is only useful if it is short enough to actually read.
    const draft = parseOutline(ROW_PER_LINE, { semesterStart: SEMESTER_START });
    expect(draft.unmatched.join(' ')).not.toContain('Weighting   Due Date');
    expect(draft.unmatched.join(' ')).not.toContain('Unit Outline');
  });

  it('reports lines it could not place', () => {
    const draft = parseOutline(
      `
      BUSM2301 Business Digitilization
      Assessment 1: Online Test  10%  16/03/2026
      Consultation hours are by appointment with the unit coordinator.
      `,
      { semesterStart: SEMESTER_START },
    );
    expect(draft.assessments).toHaveLength(1);
    expect(draft.unmatched.join(' ')).toContain('Consultation hours');
  });

  it('caps a weighting that exceeds 100 rather than storing it', () => {
    const draft = parseOutline('Everything Assessment 150% 16/03/2026', {
      semesterStart: SEMESTER_START,
    });
    // 150 is not a weighting; it is rejected outright rather than clamped to
    // something that looks deliberate.
    expect(draft.assessments).toEqual([]);
  });
});

describe('parseOutline — unit details', () => {
  it('reads the code, name and credit points', () => {
    const draft = parseOutline(ROW_PER_LINE, { semesterStart: SEMESTER_START });
    expect(draft.unit.code).toBe('BUSM2301');
    expect(draft.unit.name).toBe('Business Digitilization');
    expect(draft.unit.creditPoints).toBe(12);
  });

  it('takes the name from the following line when the code stands alone', () => {
    const draft = parseOutline(CELL_PER_LINE, { semesterStart: SEMESTER_START });
    expect(draft.unit.code).toBe('STAT1020');
    expect(draft.unit.name).toBe('Statistical Reasoning');
  });

  it('reads credit points written as cp', () => {
    expect(parseOutline('ABCD1234 Something\n6 cp').unit.creditPoints).toBe(6);
  });

  it('leaves unit details null when the outline has none', () => {
    const draft = parseOutline(PROSE_ONLY);
    expect(draft.unit).toEqual({ code: null, name: null, creditPoints: null });
  });
});

describe('parseOutline — timetable', () => {
  it('reads day, time, type and location', () => {
    const draft = parseOutline(WITH_TIMETABLE, { semesterStart: SEMESTER_START });
    expect(draft.timetable).toHaveLength(3);

    expect(draft.timetable[0]).toMatchObject({
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '12:00',
      type: 'lecture',
    });
    expect(draft.timetable[0]?.location).toContain('Building 3');
  });

  it('reads 12-hour times', () => {
    const draft = parseOutline(WITH_TIMETABLE, { semesterStart: SEMESTER_START });
    expect(draft.timetable[1]).toMatchObject({
      dayOfWeek: 3,
      startTime: '14:00',
      endTime: '15:00',
      type: 'tutorial',
    });
  });

  it('uses ISO weekdays, Monday as 1', () => {
    const draft = parseOutline(WITH_TIMETABLE, { semesterStart: SEMESTER_START });
    expect(draft.timetable.map((t) => t.dayOfWeek)).toEqual([1, 3, 5]);
  });

  it('still finds the assessment on a page that also has classes', () => {
    const draft = parseOutline(WITH_TIMETABLE, { semesterStart: SEMESTER_START });
    expect(draft.assessments).toHaveLength(1);
    expect(draft.assessments[0]?.weighting).toBe(35);
  });
});

describe('parseOutline — sources', () => {
  it('takes lines under a readings heading and any URL', () => {
    const draft = parseOutline(WITH_READINGS, { semesterStart: SEMESTER_START });

    const titles = draft.sources.map((s) => s.title);
    expect(titles.some((t) => t.includes('Hobsbawm'))).toBe(true);
    expect(draft.sources.some((s) => s.urlOrFileRef?.includes('library.example.edu'))).toBe(
      true,
    );
  });

  it('marks headingless readings as low confidence', () => {
    const draft = parseOutline(WITH_READINGS, { semesterStart: SEMESTER_START });
    const hobsbawm = draft.sources.find((s) => s.title.includes('Hobsbawm'));
    expect(hobsbawm?.confidence).toBe('low');
  });

  it('does not swallow the rest of the outline after a readings heading', () => {
    const draft = parseOutline(WITH_READINGS, { semesterStart: SEMESTER_START });
    // The assessment below the readings must still be found as an assessment.
    expect(draft.assessments).toHaveLength(1);
    expect(draft.assessments[0]?.name).toBe('Assessment 1: Source Analysis');
  });

  it('finds no sources in an outline that lists none', () => {
    expect(parseOutline(ROW_PER_LINE).sources).toEqual([]);
  });
});

describe('parseOutline — normalising', () => {
  it('strips page furniture', () => {
    const draft = parseOutline(
      `
      Page 1 of 4
      BUSM2301 Business Digitilization
      Assessment 1: Online Test  10%  16/03/2026
      12
      Page 2 of 4
      `,
      { semesterStart: SEMESTER_START },
    );
    expect(draft.unmatched.join(' ')).not.toContain('Page 1');
    expect(draft.assessments).toHaveLength(1);
  });

  it('survives the non-breaking spaces PDFs are full of', () => {
    const draft = parseOutline(
      'Assessment 1: Online Test  10%  16/03/2026',
      { semesterStart: SEMESTER_START },
    );
    expect(draft.assessments).toHaveLength(1);
    expect(draft.assessments[0]?.weighting).toBe(10);
  });

  it('reads a numeric date as day/month, not month/day', () => {
    // Australian outlines. 04/05 is the 4th of May; reading it the other way
    // would put the assessment a month out without ever looking wrong.
    const draft = parseOutline('Essay 1  30%  04/05/2026');
    expect(draft.assessments[0]?.dueDate).toBe('2026-05-04');
  });

  it('reads named-month dates in either order', () => {
    expect(
      parseOutline('Essay 1 30% 14 April 2026').assessments[0]?.dueDate,
    ).toBe('2026-04-14');
    expect(
      parseOutline('Essay 1 30% April 14, 2026').assessments[0]?.dueDate,
    ).toBe('2026-04-14');
  });

  it('takes the year from the semester when the date omits it', () => {
    const draft = parseOutline('Essay 1 30% 14 April', { semesterStart: '2026-03-02' });
    expect(draft.assessments[0]?.dueDate).toBe('2026-04-14');
  });
});

describe('parseOutline — a real outline (COS20007)', () => {
  const draft = parseOutline(REAL_OUTLINE, { semesterStart: '2026-02-15' });

  it('reads a five-digit unit code', () => {
    expect(draft.unit.code).toBe('COS20007');
  });

  it('reads the title from a label/value summary table', () => {
    expect(draft.unit.name).toBe('Object Oriented Programming');
  });

  it('reads fractional credit points', () => {
    expect(draft.unit.creditPoints).toBe(12.5);
  });

  it('finds the four real assessments and nothing else', () => {
    const names = draft.assessments.filter((a) => !a.isSubItem).map((a) => a.name);
    expect(names).toEqual([
      'Weekly in-class tasks',
      'In-class mid-term Test',
      'In-class final Test',
      'Assignment Interview',
    ]);
  });

  it('totals exactly 100% across the real assessments', () => {
    const total = draft.assessments
      .filter((a) => !a.isSubItem)
      .reduce((sum, a) => sum + a.weighting, 0);
    expect(total).toBe(100);
  });

  it('marks the weekly breakdown rows as sub-items, not assessments', () => {
    const subs = draft.assessments.filter((a) => a.isSubItem);
    expect(subs).toHaveLength(11);
    expect(subs.every((a) => a.confidence === 'low')).toBe(true);
    // They add up to their parent, which is the point: importing both double counts.
    expect(Math.round(subs.reduce((s, a) => s + a.weighting, 0))).toBe(40);
  });

  it('ignores percentages in prose', () => {
    const names = draft.assessments.map((a) => a.name.toLowerCase()).join(' | ');
    for (const phrase of ['if you', 'unlock', 'eligible', 'education plan', 'aggregate']) {
      expect(names).not.toContain(phrase);
    }
  });

  it('ignores a grading-band range like "10% – 50%"', () => {
    expect(draft.assessments.some((a) => a.weighting === 70)).toBe(false);
    expect(draft.assessments.map((a) => a.name).join(' ')).not.toContain('partially');
  });

  it('ignores the Total row', () => {
    expect(draft.assessments.some((a) => /^total$/i.test(a.name))).toBe(false);
  });

  it('does not mistake contact-hours rows for assessments', () => {
    expect(draft.assessments.map((a) => a.name).join(' ')).not.toContain('On-campus');
  });
});
