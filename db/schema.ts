import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Schema for PRD.md §5.
 *
 * Two conventions run through the whole file, both worth knowing before reading it:
 *
 * 1. Calendar days are ISO `text` ('YYYY-MM-DD'); instants are integer timestamps.
 *    A due date is a day, not a moment. Storing "due 14 March" as an epoch
 *    timestamp forces a timezone onto it, and the value then renders as the 13th
 *    or 15th depending on where the reader is — the classic off-by-one-day bug.
 *    ISO date strings also sort lexicographically, which for this format is the
 *    same as sorting chronologically, so `ORDER BY due_date` just works.
 *    `createdAt`/`updatedAt` genuinely are instants, so those stay integers.
 *
 * 2. SQLite has no enum type, so `text({ enum: [...] })` is used instead. That
 *    produces a compile-time TypeScript union with no database CHECK constraint,
 *    which is what PRD.md §5 means by "extensible enum": adding a new assessment
 *    type is a one-line code change, not a migration.
 */

/** Shared audit columns. Spread into each table rather than repeated by hand. */
const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

export const SEMESTER_STATUSES = ['upcoming', 'current', 'past'] as const;
export type SemesterStatus = (typeof SEMESTER_STATUSES)[number];

export const semesters = sqliteTable('semesters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  year: integer('year').notNull(),
  /**
   * Archiving a semester means setting this to 'past'. There is deliberately no
   * separate `archived` flag: two overlapping ways to express "not current"
   * inevitably drift apart, and PRD.md §5 already models the full lifecycle here.
   */
  status: text('status', { enum: SEMESTER_STATUSES }).notNull().default('upcoming'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  ...timestamps,
});

/**
 * Unit pill colours. Stored as a token rather than a hex value so the palette can
 * be restyled (or given a light theme) without rewriting every row, and so an
 * invalid colour can never reach the DOM.
 */
export const UNIT_COLORS = [
  'amber',
  'rose',
  'violet',
  'cyan',
  'emerald',
  'orange',
  'blue',
  'pink',
] as const;
export type UnitColor = (typeof UNIT_COLORS)[number];

export const units = sqliteTable(
  'units',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    semesterId: integer('semester_id')
      .notNull()
      .references(() => semesters.id, { onDelete: 'cascade' }),
    code: text('code'),
    name: text('name').notNull(),
    color: text('color', { enum: UNIT_COLORS }).notNull().default('violet'),
    /** Optional; only used once WAM lands in Phase 2 (PRD.md §8). */
    creditPoints: real('credit_points'),
    ...timestamps,
  },
  (table) => [index('units_semester_id_idx').on(table.semesterId)],
);

export const ASSESSMENT_TYPES = ['individual', 'group', 'team-based'] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const assessments = sqliteTable(
  'assessments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    unitId: integer('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** ISO 'YYYY-MM-DD'. Nullable: an assessment can exist before a date is known. */
    dueDate: text('due_date'),
    type: text('type', { enum: ASSESSMENT_TYPES }).notNull().default('individual'),
    /** Percentage of the unit's final grade. Fractional values (7.5) are expected. */
    weighting: real('weighting').notNull().default(0),
    /**
     * Weighted points earned, NOT a raw percentage — see PRD.md §5. A weighting of
     * 40 with a mark of 36.8 is a 92% raw score. Raw % is derived as
     * `mark / weighting * 100` wherever it is displayed.
     *
     * Nullable, and null is meaningfully different from 0: null is "not graded
     * yet", 0 is "graded, scored nothing".
     */
    mark: real('mark'),
    /** PRD.md §5's checkbox column: true once *graded*, not merely submitted. */
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    /**
     * Manual ordering, independent of due date. The inline table needs a new row
     * to stay where it was typed rather than jump position the moment a date is
     * entered — reordering under the cursor is exactly the friction PRD.md §6.2
     * is trying to beat.
     */
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('assessments_unit_id_idx').on(table.unitId),
    // The dashboard's central query is "everything due soon, across all units",
    // which is a range scan on this column.
    index('assessments_due_date_idx').on(table.dueDate),
  ],
);

export const CONTENT_SOURCE_TYPES = [
  'lecture-notes',
  'reading',
  'past-paper',
  'link',
  'other',
] as const;
export type ContentSourceType = (typeof CONTENT_SOURCE_TYPES)[number];

/** Defined per PRD.md §5. Not surfaced in the UI until Phase 2 (§8). */
export const contentSources = sqliteTable(
  'content_sources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    unitId: integer('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    urlOrFileRef: text('url_or_file_ref'),
    type: text('type', { enum: CONTENT_SOURCE_TYPES }).notNull().default('other'),
    /** SQLite has no array type; JSON text is the pragmatic equivalent. */
    tags: text('tags', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    ...timestamps,
  },
  (table) => [index('content_sources_unit_id_idx').on(table.unitId)],
);

export const TIMETABLE_ENTRY_TYPES = [
  'lecture',
  'tutorial',
  'lab',
  'workshop',
  'other',
] as const;
export type TimetableEntryType = (typeof TIMETABLE_ENTRY_TYPES)[number];

/** Defined per PRD.md §5. Not surfaced in the UI until Phase 2 (§8). */
export const timetableEntries = sqliteTable(
  'timetable_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    unitId: integer('unit_id')
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    /**
     * ISO-8601 weekday: 1 = Monday … 7 = Sunday. Deliberately not JavaScript's
     * `Date.getDay()` convention (0 = Sunday), because a timetable that starts
     * the week on Sunday reads wrong and the conversion is easy to forget.
     */
    dayOfWeek: integer('day_of_week').notNull(),
    /** 'HH:MM', 24-hour. Sorts lexicographically in clock order. */
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    location: text('location'),
    type: text('type', { enum: TIMETABLE_ENTRY_TYPES }).notNull().default('lecture'),
    ...timestamps,
  },
  (table) => [index('timetable_entries_unit_id_idx').on(table.unitId)],
);

/**
 * Grade bands, per CLAUDE.md: editable in settings, never hardcoded.
 *
 * Each band stores only its FLOOR, not a min/max pair. This is the one schema
 * choice here that is not obvious, and it is load-bearing.
 *
 * With an editable min and max, a user can save `D = 70–79` and `HD = 80–100`
 * and leave 79.5 belonging to no band at all — or save overlapping ranges and
 * have a score match two. Neither is recoverable at read time. Storing only the
 * floor and resolving a score as "the highest band whose minScore it reaches"
 * makes gaps and overlaps structurally impossible rather than merely validated
 * against. The displayed upper bound of each band is derived from the floor of
 * the band above it.
 */
export const gradeBands = sqliteTable(
  'grade_bands',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Short form shown in pills: 'HD', 'D', 'C', 'P', 'N'. */
    code: text('code').notNull(),
    label: text('label').notNull(),
    minScore: real('min_score').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [unique('grade_bands_code_unique').on(table.code)],
);

export type Semester = typeof semesters.$inferSelect;
export type NewSemester = typeof semesters.$inferInsert;
export type Unit = typeof units.$inferSelect;
export type NewUnit = typeof units.$inferInsert;
export type Assessment = typeof assessments.$inferSelect;
export type NewAssessment = typeof assessments.$inferInsert;
export type ContentSource = typeof contentSources.$inferSelect;
export type NewContentSource = typeof contentSources.$inferInsert;
export type TimetableEntry = typeof timetableEntries.$inferSelect;
export type NewTimetableEntry = typeof timetableEntries.$inferInsert;
export type GradeBand = typeof gradeBands.$inferSelect;
export type NewGradeBand = typeof gradeBands.$inferInsert;
