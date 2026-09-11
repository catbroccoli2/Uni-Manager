# Unit manager — product requirements document

## 1. Summary

A personal, local-first web app for tracking university semesters, units, assessments, deadlines, grades, and content sources. Replaces the Notion database you were using before (see reference table: Assessment, Unit, Date, Individual/Group, Weighting, Checkbox, mark).

## 2. Goals

- One place to see what's due, what's graded, and what grade you're tracking toward
- Runs entirely locally — no account, no cloud dependency, data persists between sessions on this machine
- Data entry at least as fast as the Notion table it's replacing
- Clean, deliberate UI — not a generic AI-template look

## 3. Non-goals (for now)

- Multi-user accounts or auth
- Mobile app (responsive web is enough)
- Public deployment (Phase 3, only if wanted later)
- Real-time sync across devices

## 4. Users

Just you. Single-user local tool. No auth needed for v1.

## 5. Data model

### Semester
- `id`
- `name` (e.g. "Semester 1 2026")
- `year`
- `status`: upcoming / current / past
- `start_date`, `end_date` (optional)

### Unit
- `id`, `semester_id` (FK)
- `code` (e.g. "COMP1010") — optional
- `name` (e.g. "Business Digitilization")
- `color` — for the tag/pill shown in list views, matching the colored unit badges in your reference table
- `credit_points` — optional, only needed for WAM (Phase 2)

### Assessment
Mirrors your reference table's columns directly:
- `id`, `unit_id` (FK)
- `name` (e.g. "Assessment 1: Online Test")
- `date` (due date)
- `type`: Individual / Group / Team-based (extensible enum)
- `weighting` (% of the unit's final grade — e.g. 10, 40, 7.5). Weightings across a unit cannot exceed 100; entry is capped rather than warned about afterwards.
- `mark` (raw marks earned, exactly as the marksheet states them — e.g. 18)
- `max_mark` (what `mark` is out of — e.g. 25; defaults to 100 so a plain percentage can be typed straight in)
- `completed` (boolean — your "checkbox" column; true once graded)
- `notes` (optional free text)

**Note on `mark` — revised.** This originally specified `mark` as *weighted points
earned*, so a 40%-weighted assessment scored 92% was stored as `36.8`. That was
changed after using the app: real assignments come back as "18 / 25", and
converting each one by hand before typing it defeats the point of the app doing
the weighting. `mark` and `max_mark` now hold what the marksheet says, and the
weighted contribution is derived as `(mark / max_mark) * weighting` — so an
assessment worth 50% marked out of 10 makes every mark worth 5 of the final
grade. Raw % is `mark / max_mark * 100`.

The migration that introduced `max_mark` backfilled it with each row's
`weighting`, which makes the new formula collapse to the old stored value, so no
existing figure changed.

### Content source
- `id`, `unit_id` (FK)
- `title`, `url_or_file_ref`, `type` (lecture notes / reading / past paper / link / other), `tags`

### Timetable entry (recurring class)
- `id`, `unit_id` (FK)
- `day_of_week`, `start_time`, `end_time`, `location`, `type` (lecture/tutorial/lab)

## 6. MVP features

1. **Semester & unit management** — create/edit/archive semesters and units; mark current vs past
2. **Assessment table per unit** — add/edit assessments with the columns above; inline-editable, at least as fast as the Notion table it replaces
3. **Home dashboard** — assessments due in the next 7–14 days across all units, sorted by date, overdue items visually flagged
4. **Grade calculator** — see §7
5. **Data persistence** — SQLite file on disk; everything entered is there next time the app opens, zero setup
6. **Export/backup** — one-click export of all data to JSON

## 7. Grade calculator — detailed spec

This is the feature you specifically asked for, spelled out precisely so it gets built correctly.

**Inputs (per unit):**
- All assessments' `weighting` and `mark` where `completed = true`
- All assessments' `weighting` where `completed = false` (marks not yet known)

**Calculations:**
- `points_earned` = sum of `mark` across completed assessments
- `weighting_completed` = sum of `weighting` across completed assessments
- `weighting_remaining` = sum of `weighting` across incomplete assessments
- `current_running_total` = `points_earned` (out of `weighting_completed`, and out of 100 overall assuming weightings sum to 100)

**"What do I need" mode:** user picks a target — a raw % or a grade band (HD/D/C/P) — the app computes:
- `needed_points_total` = target% × 100 (assuming total weighting = 100)
- `needed_from_remaining` = `needed_points_total − points_earned`
- `needed_average_on_remaining_%` = `needed_from_remaining / weighting_remaining × 100`
- Clearly flag if this is **impossible** (> 100%) or **already guaranteed** (≤ 0%, locked in regardless of remaining work)

**Best/worst case mode:** show the final grade range — best case (100% on everything remaining) vs worst case (0% on everything remaining) — so the current floor and ceiling are always visible.

**Edge case:** if a unit's weightings don't sum to 100 (e.g. not all assessments added yet), show a warning rather than silently producing wrong numbers.

**Grade bands (Australian system)** — set to this university's actual thresholds, but must remain editable in settings since these vary by institution:

| Grade | Range |
|---|---|
| HD (High Distinction) | 80–100 |
| D (Distinction) | 70–79 |
| C (Credit) | 60–69 |
| P (Pass) | 50–59 |
| N (Fail) | 0–49 |

## 8. Phase 2 features

- Weekly timetable view (from Timetable entry data)
- Calendar view merging classes and deadlines
- WAM calculation across all units/semesters, weighted by credit points
- Content source library with tags and search
- Quick-capture inbox for unsorted deadlines

## 9. Phase 3 / stretch

- **Curriculum document parsing** — upload a unit outline PDF, extract assessment names/dates/weightings via the Claude API, populate the assessment table as a draft the user reviews and confirms
- **Public deployment path** — swap SQLite for hosted Postgres, deploy to Vercel, only if wanted later

## 10. Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- SQLite + Drizzle ORM (schema-as-code, so migrating to hosted Postgres later is a config change, not a rewrite)
- Local file storage — a single `.db` file in the project's `data/` directory, created automatically on first run

## 11. UI/UX requirements

- Dark theme by default, matching the reference screenshot; light mode toggle is a nice-to-have, not required for MVP
- Fast, inline-editable table for assessments — data entry needs to match or beat the Notion table it replaces
- Colored unit tags/pills for quick visual scanning, same idea as the reference table
- Deliberate, considered visual design — avoid generic "AI-app" defaults (default template purple, unstyled cards, cookie-cutter dashboards). Should feel like a tool worth opening daily.
- Keyboard-friendly where practical (tab between fields, enter to save a row)
- No unnecessary friction: no logins, no onboarding flow, no confirmation dialogs for routine actions

## 12. Assumptions / open questions

- Grade band thresholds are set to this university's bands (§7) as the default; still editable in settings if that ever changes
- A unit's weightings should sum to ~100; the app warns (doesn't block) if they don't
- Single browser/single machine use assumed — no sync needed for v1
- `credit_points` on Unit is optional and only matters once WAM (Phase 2) is built
