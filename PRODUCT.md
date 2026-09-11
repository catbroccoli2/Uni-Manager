# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: a university student in the Australian system, tracking their own
coursework. Single user by design — no accounts, no sharing, no collaborators
(PRD.md §4). The app runs locally on their own machine.

They use it in two distinct modes, confirmed with the user:

- **Bursts.** Frequent, short, "what's due and am I behind?" checks, answered at
  a glance without navigating.
- **Sessions.** Occasional sustained stretches of entering new assessments and
  updating marks as they come back.

These are different jobs with different needs and should be designed as such,
not averaged into one middling screen.

## Product Purpose

One place to see what is due, what is graded, and what grade they are tracking
toward, replacing a Notion database that held the same data (Assessment, Unit,
Date, Individual/Group, Weighting, Checkbox, mark).

Success is the app being worth opening daily: the deadline question answered
instantly, and data entry at least as fast as the Notion table it replaces. A
version that is slower to type into than Notion has failed regardless of what
else it does.

## Positioning

Two things a general-purpose tool (Notion, a spreadsheet, a calendar) cannot do
without being rebuilt by hand each semester:

- It understands **weighted assessment marks natively**. A mark is stored as
  weighted points earned rather than a raw percentage, so the running total is
  just a sum and no per-unit formula scaffolding has to be maintained.
- It answers **"what do I need to get from here?"** — the specific question a
  student has about a unit mid-semester, including when the answer is "that is
  no longer possible" or "you already have it".

## Operating Context

- Runs locally, offline, with no account and no network dependency. Opening it
  is zero-friction by construction (PRD.md §11: no logins, no onboarding, no
  confirmation dialogs for routine actions).
- Replaces an existing Notion table, so it is measured against that table's
  entry speed and visual scanability, not against a blank slate.
- Data arrives incrementally and out of order through a semester: assessments
  are often created before their dates or weightings are known, and marks
  return weeks after submission. Partial and in-progress data is the normal
  state, not an error condition.
- The Australian grading system: HD / D / C / P / N bands. Thresholds are this
  university's, but vary by institution and must stay editable.

## Capabilities and Constraints

Confirmed in PRD.md §5–§7:

- Semesters contain units; units contain assessments, content sources, and
  timetable entries.
- An assessment's `mark` is weighted points earned, not a raw percentage. A
  weighting of 40 with a mark of 36.8 is a 92% raw score.
- `completed` means *graded*, not merely submitted.
- A unit's weightings should sum to ~100. When they do not, the app warns and
  still computes; it never silently rescales.
- The grade calculator must handle impossible targets, already-guaranteed
  targets, and fully-graded units, as distinct outcomes.

Constraints:

- SQLite only, local file, no hosted database.
- No user accounts or auth.
- No external network calls (the one exception is an optional, unbuilt Phase 3
  feature that parses unit outlines via the Claude API).
- Responsive web is sufficient; there is no native app.

**The primary job**, confirmed with the user: the **grade calculator**. Of the
six MVP features, it is the one that earns the app its place. The unit page
that carries it is the centrepiece and takes design priority; the dashboard
serves the burst mode and is second.

Phase 2 and Phase 3 features (PRD.md §8, §9) are explicitly not in scope and
are not to be started without the user's go-ahead. The database schema defines
`content_sources`, `timetable_entries` and `credit_points` because PRD.md §5
specifies them, but no UI for them exists yet.

## Evidence on Hand

- `PRD.md` — the full product requirements, written by the user.
- `CLAUDE.md` — engineering conventions and business rules.
- `lib/grades.ts` — the grade calculation engine, with 39 tests covering the
  PRD.md §7 spec including its stated edge cases.

Explicit absence, confirmed with the user: **there is no reference screenshot
available.** PRD.md §11 refers to matching "the reference screenshot" of the
original Notion table, but that artifact does not exist for this build. The
written description in PRD.md (colored unit pills, the Assessment / Unit / Date
/ Individual-Group / Weighting / Checkbox / mark columns, dark theme) is the
whole of the brief. Nothing about the original's appearance should be invented
or described as if it had been seen.

There is no real user data yet, no brand, no logo, and no existing visual
identity. This is a greenfield visual world.

## Product Principles

1. **Partial data is the normal state.** Every screen has to stay useful and
   honest when weightings are incomplete, dates are missing, and most marks
   have not come back. Nothing may imply precision the data does not support.
2. **Never silently guess.** Where the numbers are ambiguous — weightings not
   summing to 100, an assessment marked graded with no mark — say so plainly
   and keep computing. Warn, do not correct.
3. **Entry speed is a feature, not a detail.** Losing to the Notion table on
   typing speed is a product failure. Keyboard flow and absence of friction
   rank above visual ambition wherever the two conflict.
4. **Answer the question, not just the data.** The value is in "you need 64% on
   the final" and "that is no longer reachable", not in a table of numbers the
   user has to interpret themselves.
5. **Two modes, designed separately.** The glance and the working session want
   different things. Neither should be compromised to make one screen serve
   both.

## Accessibility & Inclusion

No user-specific requirement was established. Baseline applies: full keyboard
operability (PRD.md §11 calls for tab-between-fields and enter-to-save), visible
focus, and colour contrast that holds in the dark theme. Colour is used for unit
identity and for urgency, so neither may be the only channel carrying that
meaning.
