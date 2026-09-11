# CLAUDE.md — unit manager project

Project context for Claude Code. Read `PRD.md` in this repo first for full detail — this file is the quick-reference.

## What this is

Personal, local-first web app to track uni semesters, units, assessments, deadlines, grades, and content sources. Single user, no auth, no cloud dependency for v1.

## Stack

- Next.js 16 (App Router), React 19, TypeScript strict mode
- Tailwind CSS 4 — CSS-first, no `tailwind.config.js`; design tokens live in an `@theme` block in `app/globals.css`
- Drizzle ORM + SQLite via libsql (`@libsql/client`), created on first run

**Where the database file lives.** Not `data/unit-manager.db`. It defaults to
`~/.unimanager/unit-manager.db`, deliberately outside this repo, because this
project folder is inside OneDrive and file-sync clients corrupt live SQLite
databases by racing the writer for the `.db` / `.db-wal` / `.db-shm` trio.
Override with `UNI_MANAGER_DB_PATH` (see `.env.local.example`). If the repo ever
moves off a synced drive, `./data/unit-manager.db` works fine again.

libsql rather than better-sqlite3: both are native, but libsql ships NAPI
prebuilds that are ABI-stable, so a Node upgrade can never leave you needing
Visual Studio Build Tools to compile a database driver. The file it writes is an
ordinary SQLite database.

## Commands

- `npm run dev` — start dev server
- `npm run build` — production build, and the full strict type check
- `npm test` — grade calculator suite (vitest); the gate on PRD §7 correctness
- `npm run db:generate` — emit a migration from `db/schema.ts`
- `npm run db:migrate` — apply pending migrations
- `npm run db:studio` — browse the database
- `npm run db:seed:demo` — sample data shaped to exercise the hard cases
- `npm run verify:ui` — drive the real app in Chrome; needs `npm run dev` running

## Conventions

- TypeScript strict, no `any`
- **Mutations are Server Actions** in `app/**/actions.ts`, not REST routes — agreed
  with the user as a departure from the original "API routes under `app/api/`"
  note. The inline assessment table needs optimistic updates without a fetch
  round-trip, and splitting entities between actions and REST would be worse than
  choosing one. `app/api/export/route.ts` stays a route handler, because a
  download is a response carrying `Content-Disposition` and an action cannot
  return one.
- DB schema under `db/schema.ts`
- Keep grade-calculator math in a pure, unit-tested function (`lib/grades.ts`) — no UI code mixed into the calculation logic, since correctness here matters
- Prefer server components; use client components only where interactivity is needed (inline table editing, calculator inputs)
- Dates that are calendar days are ISO `'YYYY-MM-DD'` text, never `Date` or epoch
  integers — see the note at the top of `db/schema.ts` and the helpers in
  `lib/dates.ts`

## Key business logic to get right

- Assessment `mark` is **raw marks earned**, with `max_mark` holding what it was
  out of. The weighted contribution is `(mark / max_mark) * weighting`, computed
  by `weightedContribution()` in `lib/grades.ts` and never stored. Raw % is
  `mark / max_mark * 100`. (This replaced an earlier model where `mark` held
  weighted points directly — see the revision note in `PRD.md` §5.)
- **A unit's weightings cannot exceed 100.** Entry is clamped to whatever is
  left, in the rack for feedback and again in the Server Action against freshly
  read siblings, because only the server can see the current total.
- **A grade band is only shown for the grade actually achieved**, which is
  `pointsEarned / weightingCompleted * 100` — the grade on marked work, via
  `unitStanding()`. Never band the running total: a unit with 45.3 of 100 banked
  but half of it graded is being carried at 90.6%, and banding 45.3 reports a
  fail.
- Grade bands (HD 80+, D 70–79, C 60–69, P 50–59, N <50) and their GPA values
  (HD 4, D 3, C 2, P 1, N 0) live in the `grade_bands` table, not hardcoded —
  they're this university's actual bands and scale, but both stay editable.
- GPA is a straight average of band grade points, not credit-point weighted.
  The board shows a confirmed GPA (units with nothing outstanding) and a
  projected one (including units in progress).
- The grade calculator must handle: unit weightings not summing to 100, target grades that are mathematically impossible, and "already locked in" cases. Full spec in `PRD.md` §7.

## Outline import

`lib/outline-parser.ts` reads a pasted unit outline and proposes a draft. It is
pure — no DOM, no database, no network — and runs in the browser, so an outline
the user decides not to import never leaves their machine.

Two rules make a guessing parser safe to put in front of a database, and both
are load-bearing:

- **Never invent.** A line that cannot be placed goes to `unmatched` and is
  shown. Text with no assessment table produces an empty draft, not a plausible
  one.
- **Show the evidence.** Every row carries its `sourceLine` and a `confidence`,
  and the review sorts low-confidence rows first.

`commitOutlineDraft` re-validates everything server-side and caps weightings at
100 — a draft that crossed the wire from a heuristic parser is never trusted.

This shipped as the offline variant of PRD.md §9, so **the Claude API exception
below remains unspent**. If the API path is ever built (for scanned outlines), it
is an addition, not a replacement.

## Do not

- Add user accounts, auth, or any external network calls beyond the optional Phase 3 Claude API curriculum-parsing feature
- Reach for a hosted database — SQLite only, until explicitly asked to migrate
- Default to generic AI-template styling — see `PRD.md` §11 for UI/UX intent

## Skills & plugins

Use these for any UI/layout/styling work. The goal is a deliberate, non-generic
look (see PRD.md §11), not default template styling.

- **impeccable** (`.claude/skills/impeccable/`) — the main one. Design commands
  (`critique`, `audit`, `polish`, `harden`, `layout`, `typeset`…), an
  anti-pattern detector wired to a hook that runs on every UI file edit, and
  shipped review agents. Run `impeccable detect app components --json` before
  committing UI work. `reference/craft-floor.md` is the quality floor; load it
  before any UI edit.
- **frontend-design** (`.claude/skills/frontend-design/`) — aesthetic direction
  and typography guidance for new UI.
- **Modern Web Guidance** (`modern-web-guidance@googlechrome`, declared in
  `.claude/settings.json`) — check before writing frontend/Next.js code,
  especially forms, dialogs, layout, and interactive components. Prefer current
  best practices over older patterns from training data.

Note: the "Design plugin" bundling design critique and accessibility audit is an
Anthropic plugin for **Claude Cowork**, a different product — it is not
installable in Claude Code. impeccable covers that ground more thoroughly.

## Design system

This app has a committed visual world, not ad-hoc styling. Before changing any
UI, read:

- `.impeccable/surfaces/app-units.md` — the direction contract (air traffic
  control progress strips) and why each decision was made
- `DESIGN.md` — the built system's tokens and components
- `PRODUCT.md` — product truth, the confirmed primary job, and what must not be
  invented

Three laws, recorded in `app/globals.css`. Breaking any one turns this back into
a generic dashboard:

1. Buff is the only large light field, and always means "a real record".
2. Every colour channel states exactly one thing — unit hue is identity, lamp is
   urgency. Never decoration, never emphasis.
3. A strip's size is its weighting. Size is data, not layout convenience.

## Build order

Follow `PRD.md` §6 (MVP) → §8 (Phase 2) → §9 (Phase 3/stretch), in that order. Confirm with the user before starting a new phase.
