# Uni Manager

A local-first web app for tracking university units, assessments and grades across semesters. It calculates your GPA, tells you what you need on remaining assessments to hit a target grade, and keeps a timetable and a due-date board in one place.

Everything runs on your own machine. There is no account, no server to host, and no data leaves your computer.

## Features

- **Semesters**: keep the current semester alongside every past one, so your full history stays in one place.
- **Units and assessments**: weightings, due dates, marks, and what each mark is out of.
- **GPA**: a *Confirmed* GPA (only units with nothing outstanding) and a *Projected* GPA (including units still in progress), calculated across all semesters.
- **"What do I need?"**: pick a target percentage or grade band and see the average required on the remaining assessments, or whether it is already guaranteed or out of reach.
- **Board**: everything due in the next 7 or 14 days, plus anything overdue, ranked by date.
- **Timetable**: a weekly grid of classes with assessment deadlines shown above the clock.
- **Outline import**: pull assessments and class times out of a unit outline PDF.
- **Editable grade bands**: set each band's floor and grade points. Defaults follow the Australian scale.
- **Export and import**: move all your data between devices as a single JSON file.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) with React and TypeScript
- [Drizzle ORM](https://orm.drizzle.team/) with a local SQLite database
- Tailwind CSS

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm

### Install and run

```bash
git clone <your-repo-url>
cd Uni-Manager
npm install
cp .env.local.example .env.local
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

On first run the app creates the database and applies any migrations automatically.

### Where is my data?

The database file lives **outside the project folder**, so it survives re-cloning and is never committed to git. The exact path is shown on the **Settings** page under *Export*. See `.env.local.example` for how to change it.

## How grades are calculated

The grade maths lives in `lib/grades.ts`. It is pure TypeScript with no React or database imports, and it is covered by tests in `lib/grades.test.ts`.

- **Marks**: each assessment stores the raw mark and what it was out of. Its contribution to the unit is `(mark / maxMark) × weighting`. For example, 18/25 on a 40% assessment contributes 28.8 points.
- **Unit standing**: the grade on work that has been marked, which is points earned divided by the weighting graded so far. This is deliberately not the running total, which reads as a fail until the last mark lands.
- **Bands**: a score belongs to the highest band whose floor it reaches. Only floors are stored, so no score can fall between two bands or match two at once.
- **GPA**: the straight average of each unit's band grade point, unweighted by credit points.
  - *Confirmed* counts only units with nothing outstanding.
  - *Projected* counts every unit with at least one graded assessment.
- **Targets**: the needed average on remaining work is reported as one of five outcomes: achievable, guaranteed, impossible, locked-achieved or locked-missed.
- **Data warnings**: weightings that do not add to 100, graded assessments with no mark, and marks above the maximum are flagged rather than silently corrected.

### Default grade bands

| Band | Minimum score | Grade points |
| ---- | ------------- | ------------ |
| HD   | 80            | 4            |
| D    | 70            | 3            |
| C    | 60            | 2            |
| P    | 50            | 1            |
| N    | 0             | 0            |

These can be edited in **Settings**.

## Moving data between devices

1. On the old device, go to **Settings → Export → Export everything**. This downloads a JSON file.
2. On the new device, run the app (see [Getting started](#getting-started)).
3. Go to **Settings → Import → Import everything** and choose the file.

> **Import replaces everything** currently in the app with the contents of the file. Export first if you want a backup of the target device.

The file is validated before anything is deleted, so a malformed file will not wipe your data.

## Project structure

```
app/
  api/export/       JSON export endpoint
  api/import/       JSON import endpoint
  semesters/        Semester list, semester pages, create/edit actions
  units/            Unit pages and assessment editing
  timetable/        Weekly timetable
  settings/         Grade bands, export and import
  page.tsx          The board: due items and GPA standing
components/         UI components (grade gauge, week grid, unit workspace, ...)
db/
  schema.ts         Drizzle schema
  migrations/       SQL migrations
lib/
  grades.ts         Grade, GPA and target calculations
  dates.ts          Date helpers and week logic
  queries.ts        All database reads
  outline-parser.ts Unit outline parsing
  pdf-text.ts       PDF text extraction
scripts/            Helper scripts
```

## Tests

```bash
npm test
```

Tests cover the grade calculations (`lib/grades.test.ts`), date handling (`lib/dates.test.ts`) and the outline parser (`lib/outline-parser.test.ts`).

## Notes

This is a personal project built to run locally, so there is no authentication and it is not designed to be exposed to the internet.
