# CLAUDE.md — unit manager project

Project context for Claude Code. Read `PRD.md` in this repo first for full detail — this file is the quick-reference.

## What this is

Personal, local-first web app to track uni semesters, units, assessments, deadlines, grades, and content sources. Single user, no auth, no cloud dependency for v1.

## Stack

- Next.js (App Router), TypeScript strict mode
- Tailwind CSS
- Drizzle ORM + SQLite (`data/unit-manager.db`, created on first run, gitignored)

## Commands

Fill this section in once the project is scaffolded, e.g.:
- `npm run dev` — start dev server
- `npm run db:generate` / `npm run db:migrate` — Drizzle schema migrations

## Conventions

- TypeScript strict, no `any`
- API routes under `app/api/`, DB schema under `db/schema.ts`
- Keep grade-calculator math in a pure, unit-tested function (`lib/grades.ts`) — no UI code mixed into the calculation logic, since correctness here matters
- Prefer server components; use client components only where interactivity is needed (inline table editing, calculator inputs)

## Key business logic to get right

- Assessment `mark` is stored as weighted points earned, not raw %. Raw % = `mark / weighting * 100`.
- Grade bands (HD 80+, D 70–79, C 60–69, P 50–59, N <50) live in a config/settings table, not hardcoded — they're this university's actual bands, but should stay editable.
- The grade calculator must handle: unit weightings not summing to 100, target grades that are mathematically impossible, and "already locked in" cases. Full spec in `PRD.md` §7.

## Do not

- Add user accounts, auth, or any external network calls beyond the optional Phase 3 Claude API curriculum-parsing feature
- Reach for a hosted database — SQLite only, until explicitly asked to migrate
- Default to generic AI-template styling — see `PRD.md` §11 for UI/UX intent

## Skills & plugins

- **Design plugin (frontend-design, accessibility audit, design critique)** — use for any UI/layout/styling work. The goal is a deliberate, non-generic look (see PRD.md §11), not default template styling. Run an accessibility pass once a screen's UI is functionally done.
- **Modern Web Guidance** — check before writing frontend/Next.js code, especially anything involving forms, modals, layout, or interactive components. Prefer current best practices over older patterns from training data.

These should trigger automatically when relevant, but call them out explicitly in a prompt if a UI-heavy task doesn't seem to be using them.

## Build order

Follow `PRD.md` §6 (MVP) → §8 (Phase 2) → §9 (Phase 3/stretch), in that order. Confirm with the user before starting a new phase.
