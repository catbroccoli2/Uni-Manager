---
name: Uni Manager
description: A gunmetal rack of buff paper strips, after air traffic control progress boards.
colors:
  rack-900: "#0d0f11"
  rack-800: "#14171a"
  rack-700: "#1b1f23"
  rack-600: "#252a30"
  rack-500: "#363d45"
  strip: "#d6cbb4"
  strip-dim: "#a79e8b"
  strip-ink: "#16181a"
  strip-ink-soft: "#33363a"
  strip-alert: "#5f1f12"
  strip-warn: "#452c02"
  etch: "#e6e3dc"
  etch-dim: "#9aa1a9"
  etch-faint: "#858d95"
  lamp-live: "#f0a81e"
  lamp-over: "#ec6b55"
  lamp-clear: "#62b89d"
  unit-amber: "#d99a2b"
  unit-rose: "#d4657a"
  unit-violet: "#9b7fd4"
  unit-cyan: "#4ea8c4"
  unit-emerald: "#5aa87a"
  unit-orange: "#d9793f"
  unit-blue: "#6b8fd4"
  unit-pink: "#cf7ab5"
typography:
  gauge:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 600
    lineHeight: 0.92
    letterSpacing: "-0.035em"
  tally:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  nav:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.01em"
  micro:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  annotation:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  figure:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  strip: "1px"
spacing:
  seam: "3px"
  tight: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  bay: "32px"
components:
  strip:
    backgroundColor: "{colors.strip}"
    textColor: "{colors.strip-ink}"
    rounded: "{rounded.strip}"
    padding: "8px 12px"
  strip-pending:
    backgroundColor: "{colors.strip-dim}"
    textColor: "{colors.strip-ink}"
    rounded: "{rounded.strip}"
    padding: "8px 12px"
  button-primary:
    backgroundColor: "{colors.strip}"
    textColor: "{colors.strip-ink}"
    rounded: "{rounded.strip}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "#e3dac7"
    textColor: "{colors.strip-ink}"
  button-quiet:
    backgroundColor: "{colors.rack-700}"
    textColor: "{colors.etch}"
    rounded: "{rounded.strip}"
    padding: "6px 12px"
  button-quiet-hover:
    backgroundColor: "{colors.rack-600}"
    textColor: "{colors.etch}"
  button-danger:
    backgroundColor: "{colors.rack-700}"
    textColor: "{colors.lamp-over}"
    rounded: "{rounded.strip}"
    padding: "6px 12px"
  button-danger-hover:
    backgroundColor: "{colors.lamp-over}"
    textColor: "{colors.rack-900}"
  control:
    backgroundColor: "{colors.rack-900}"
    textColor: "{colors.etch}"
    rounded: "{rounded.strip}"
    padding: "6px 10px"
  cell:
    backgroundColor: "transparent"
    textColor: "{colors.strip-ink}"
    rounded: "{rounded.strip}"
    padding: "4px 6px"
  unit-plate:
    textColor: "{colors.rack-900}"
    rounded: "{rounded.strip}"
    padding: "2px 8px"
---

# Design

## Overview

Uni Manager is a rack. The world is the progress-strip boards air traffic
control ran on paper: one strip per flight, seated in a ruled metal channel,
annotated in place as its state changed, moved between bays rather than
rewritten. Here every assessment is a strip, the rack is the app, and your
standing is legible without asking for it.

The direction was chosen through a concept round recorded in
`.impeccable/surfaces/app-units.md`, which holds the full contract and the
reasoning. That file governs; this one records what got built.

Three laws hold the world together. Breaking any one turns this back into a
generic dashboard, which is precisely what `PRD.md` §11 rules out:

1. **Buff is the only large light field, and it always means "a real record".**
   Nothing decorative is ever buff. If a surface is buff, it is a strip or a
   scrap of stock carrying an annotation.
2. **Every colour channel states exactly one thing.** Unit hue means *which
   unit*. Lamp colour means *urgency*. Neither is ever used for emphasis,
   selection, delight, or brand. The active nav item is underlined in `etch`,
   not tinted, for this reason.
3. **A strip's size is its weighting.** Size is data. The magnitude rail along
   each strip's foot is the weighting; the gauge's filled track is points.

The register is institutional, because this app reports on real academic
standing. Rule-work and stencilled labels, not decoration.

## Colors

The ground is `rack-800`, a neutral gunmetal — deliberately not blue-black,
which is where dark interfaces drift by default.

| Role | Tokens |
|---|---|
| Rack | `rack-900` well · `rack-800` face · `rack-700` seated bay · `rack-600` rules · `rack-500` raised edge |
| Stock | `strip` written on (graded) · `strip-dim` blank (ungraded) |
| Ink on stock | `strip-ink` · `strip-ink-soft` secondary · `strip-alert` overdue · `strip-warn` due soon |
| Type on rack | `etch` · `etch-dim` secondary · `etch-faint` quietest readable |
| Lamps | `lamp-live` due soon · `lamp-over` overdue/impossible · `lamp-clear` cleared/guaranteed |
| Unit identity | eight `unit-*` hues, stored as tokens on the row |

**Every pairing in use clears WCAG AA (4.5:1).** Inks on stock are checked
against `strip-dim`, the darker of the two stocks, because that is where the
urgency inks actually land — anything overdue or due soon is by definition still
ungraded. Lamp colours are set light enough to clear on `rack-600`, the
lightest ground any of them sits on, because they carry text as well as fills.

Unit hues are mid-tone and always take `rack-900` ink, never white: dark ink
clears AA on all eight, white clears it on none.

## Typography

Two families, clearly distinct in job:

- **Archivo** for everything read as language — headings, labels, body, and the
  gauge's display figure. A workhorse grotesk with the stencilled-label
  character the rack wants, and enough presence at `4.5rem` that no separate
  display face is needed.
- **JetBrains Mono** only where a figure is being *measured or compared* —
  marks, weightings, dates, the needed average. Never as a costume for
  "technical".

Numbers default to `tabular-nums` globally, because nearly every figure in this
app is compared against another in the column above or below it. The one
exception is the gauge's headline, which is set proportional: there is no column
there, and a monospaced decimal point takes a full digit cell, rendering "9.4"
as "9 . 4".

Type stays marginal beside a strip rather than centred on it, following the
source's own convention.

The ramp runs `gauge` 4.5rem → `tally` 2rem → `heading` 1.5rem → `nav` 0.9375rem
→ `body` / `figure` 0.875rem → `label` 0.8125rem → `micro` 0.6875rem →
`annotation` 0.625rem. The two smallest steps are deliberate and load-bearing:
`micro` sets the rack's column headings and plate codes, and `annotation` sets
the per-field labels a strip grows when it stacks on mobile and the figures
pinned to the gauge's track. Both are dense-instrument sizes; neither is body
text, and neither should be used for a sentence.

## Layout

- Content is capped at `max-w-6xl` and gutters at 16–24px.
- Bays are the organising unit: a stencilled label, a hairline rule, then the
  seated rows. `BayLabel` renders this.
- Strips sit in a `.rack-bay` channel — a ruled ground with a 3px seam between
  rows — not floating on empty gaps. The seam shows the channel both strips are
  seated in.
- The assessment rack is a true grid at `lg` and stacks per-strip below it,
  where each field carries its own small label.
- The gauge spans the full rack head, with the target marker on a track beneath.

## Elevation & Depth

Almost none, deliberately. Paper in a metal channel is not floating.

The only shadow in the system seats a strip in its bay:
`0 1px 0 0 rgb(0 0 0 / .5), 0 2px 6px -2px rgb(0 0 0 / .55)` — an offset plus a
real blur. Zero-offset coloured halos, hard offset block shadows, and glass
effects are not part of this world. The sticky header uses a small
`backdrop-blur` because content scrolls under it, which is a specific effect
rather than decoration.

The rack face carries a 1px-in-3px repeating hairline at 1.4% white — metal
grain, not a texture image.

## Shapes

Square. `rounded.strip` is **1px**, which is effectively a crisp corner that
avoids an aliased hard edge.

The only round things in the app are lamps, which are 6px dots, and they are
round because a lamp is round.

## Components

- **`.strip` / `.strip-pending`** — a record. Clean stock means graded; hatched
  blank stock means not yet. `.strip-pending` sets `background-color` *and*
  `background-image`, so the dark ink stays readable if the gradient never
  paints (forced-colors, print, an override).
- **`UnitPlate`** — a unit's painted plate. Always shows the code or name, so
  colour is never the only channel carrying identity.
- **`Lamp`** — a 6px urgency dot, always paired with text.
- **`BayLabel`** — a stencilled section plate over a hairline rule.
- **`Figure`** — a measured number in tabular mono.
- **`BackLink`** — a drawn chevron, never a Unicode arrow.
- **`GradeGauge`** — the instrument: banked stock, reachable stock, bare rack,
  band rules, a lit current-band zone, annotations on the track, target marker.

## Do's and Don'ts

**Do**

- Read `.impeccable/surfaces/app-units.md` before changing any UI.
- Use a lamp plus text for urgency; keep colour as one of two channels.
- Put a figure on the thing it measures rather than in a list beneath it.
- Give any annotation its own scrap of stock if what sits behind it can vary.
- Say what the numbers cannot support — warn, never silently correct.

**Don't**

- Use buff for anything that is not a record.
- Use unit hue for emphasis or lamp colour for selection.
- Add a rounded card, a progress ring, a donut chart, or a gradient.
- Add an eyebrow or kicker above a heading. Headings carry their own weight.
- Show a grade band for a unit that still has work outstanding — mid-semester
  the running total is a floor, not a grade.
- Reach for a Unicode glyph where an icon belongs.
