---
version: 1
slug: "app-units"
primary_target: "app/units"
related_targets: ["app/page.tsx","app/semesters","app/settings"]
---

## Scope

Visitor mode: Operate. Surfaces: the unit page (lead), the dashboard, the
semester list, settings. Audience: one student tracking their own coursework,
in two modes — short "am I behind?" glances and long entry sessions.

## Direction contract

THESIS: An assessment is a physical strip that lives in a bay and moves from
pending to cleared, and the rack shows your standing without being asked. It
refuses the arrangement this category always ships: rounded cards on near-black
with a violet accent and a progress ring reporting a number the interface
already knew.

OWN-WORLD: Gunmetal rack ground (#14171A), buff strip stock (#D6CBB4) as the
only large light field, amber (#F0A81E) and red (#B8402C) as status lamps,
cleared green (#3E7D6A). Strips are rectangular, square-cornered, seated in
ruled bays with visible bay dividers; a strip's width carries its weighting.
One workhorse grotesk, tabular numerals doing the numeric work, type kept
marginal beside the strip rather than centred on it. Unit hue is the only other
colour on the page and carries exactly one law: which unit this is. Recognisable
with all content removed by the bay rules, the strip silhouette, and the lamp
column.

STORY: The student sees which strips are still pending and how much weight sits
in them, understands that their floor is already locked and their ceiling is
reachable, and moves the target marker to learn what the remaining strips must
carry. They leave knowing a number they can act on.

FIRST VIEWPORT (unit page): The target gauge spans the rack head, full width,
reading the needed average at display scale with the target marker on a track
beneath it. Under it the unit's identity at small scale beside the running
tally. Then two bays, ruled and labelled: CLEARED above, PENDING below, each
strip seated at a width proportional to its weighting, graded strips carrying
their mark annotated in place, pending strips showing weighting only. The
primary action — adding a strip — sits at the rack foot, always reachable, never
a floating button.

FORM: Flight progress strips (air traffic control racks). Candidate 6 of seven
grounded directions, assigned by the roll over my top-ranked ledger. Seed key
5378042d, chosen from the first hand after two re-rolls returned to it.

Raises carried from declined challengers: the target selector reconfigures the
whole rack rather than a side panel (drawcord cape); each colour channel states
one law and is never decorative (gravity-rain garden); institutional register in
the rule-work, because this reports official academic standing (civic
prospectus); weighting reads as visual magnitude, not only a number in a column
(star atlas).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Constraints

- Dark theme by default (PRD.md §11); light mode is not required for MVP.
- Inline table editing must beat Notion on entry speed; keyboard flow outranks
  visual ambition wherever the two conflict.
- No confirmation dialogs for routine actions, no onboarding, no logins.
- Colour is never the only channel carrying urgency or identity.

## Unresolved

- Whether the dashboard uses the same bay grammar or earns a distinct
  composition inside the same world; decided when that surface is built.
