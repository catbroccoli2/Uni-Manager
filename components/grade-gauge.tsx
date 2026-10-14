'use client';

import { useMemo, useState } from 'react';
import {
  bandRanges,
  clampNumber,
  scoreToBand,
  unitStanding,
  whatDoINeed,
  type BandLike,
  type GradeTarget,
  type UnitGradeSummary,
  type UnitStanding,
} from '@/lib/grades';

/**
 * The gauge at the rack head: PRD.md §7 rendered as one instrument.
 *
 * The whole of §7 is visible in a single track. What is banked is solid, what is
 * still reachable is blank stock, what can no longer be reached is bare rack.
 * The band thresholds are rules across it, and the target marker rides it. That
 * makes running total, best case, worst case and target one picture rather than
 * four numbers in four boxes.
 *
 * No arithmetic happens here. Every figure comes from lib/grades.ts, which is
 * pure and separately tested — this file only decides how to draw the answer.
 */

const SCALE_MAX = 100;

export function GradeGauge({
  summary,
  bands,
}: {
  summary: UnitGradeSummary;
  bands: BandLike[];
}) {
  // Default to the lowest band above the current floor: the next thing worth
  // aiming at, rather than an arbitrary 50 or whatever was aimed at last time.
  const initial = useMemo(() => {
    const above = [...bands].filter((b) => b.minScore > summary.pointsEarned);
    if (above.length > 0) {
      return Math.min(...above.map((b) => b.minScore));
    }
    return bands.length > 0 ? Math.max(...bands.map((b) => b.minScore)) : 50;
  }, [bands, summary.pointsEarned]);

  const [target, setTarget] = useState<number>(initial);

  const outcome = whatDoINeed(summary, { kind: 'percent', value: target } satisfies GradeTarget);
  const ranges = bandRanges(bands, SCALE_MAX);
  const targetBand = scoreToBand(target, bands);

  /**
   * The band the unit currently sits in, as a span on the track.
   *
   * Anchored on the banked floor rather than the ceiling: the floor is the only
   * figure that cannot get worse, so it is the honest answer to "where am I".
   * Null until something is graded — an ungraded unit is not sitting in N, it
   * simply has no standing yet, and lighting the fail band would say otherwise.
   */
  const currentZone = useMemo(() => {
    if (summary.weightingCompleted <= 0) return null;
    const band = scoreToBand(summary.worstCase, bands);
    if (!band) return null;
    const above = bands
      .filter((b) => b.minScore > band.minScore)
      .sort((a, b) => a.minScore - b.minScore)[0];
    return { code: band.code, from: band.minScore, to: above?.minScore ?? SCALE_MAX };
  }, [bands, summary.weightingCompleted, summary.worstCase]);

  const pct = (n: number) => `${Math.max(0, Math.min(n, SCALE_MAX))}%`;

  const standing = unitStanding(summary, bands);

  return (
    <div className="border border-rack-600 bg-rack-700/40">
      {/*
        Two readouts, deliberately side by side: where you actually are, and
        where you are aiming. Before this, the gauge only ever answered the
        second question, so a unit being carried at HD showed whatever band the
        target happened to be set to.
      */}
      <div className="grid gap-px bg-rack-600 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <Standing standing={standing} />
        <Readout outcome={outcome} summary={summary} targetBand={targetBand} />
      </div>

      <div className="px-4 pb-4 pt-1">
        {/* The track. Bare rack is weight that can no longer be reached. */}
        <div className="relative h-11 w-full bg-rack-900">
          {/*
            The band currently occupied, lit as a zone you are inside rather than
            reported as a badge elsewhere. Sits under the stock so it reads as
            the track's own illumination, not as another layer of content.
          */}
          {currentZone ? (
            <span
              aria-hidden
              className="absolute inset-y-0 bg-lamp-live/12"
              style={{ left: pct(currentZone.from), width: pct(currentZone.to - currentZone.from) }}
            />
          ) : null}

          <div
            className="absolute inset-y-0 left-0 bg-strip"
            style={{ width: pct(summary.worstCase) }}
            aria-hidden
          />
          <div
            className="strip-pending absolute inset-y-0 opacity-70"
            style={{
              left: pct(summary.worstCase),
              width: pct(summary.bestCase - summary.worstCase),
            }}
            aria-hidden
          />

          {/* Band thresholds, ruled across the track. */}
          {ranges.map(({ band, min }) =>
            min <= 0 ? null : (
              <span
                key={band.code}
                aria-hidden
                className="absolute inset-y-0 w-px bg-rack-500 mix-blend-screen"
                style={{ left: pct(min) }}
              />
            ),
          )}

          {/*
            Banked and ceiling marked on the track itself, so the figures are
            read where they happen instead of listed as supporting stats below.
          */}
          <TrackTick at={summary.worstCase} label="banked" value={round(summary.worstCase)} />
          {summary.bestCase > summary.worstCase ? (
            <TrackTick at={summary.bestCase} label="ceiling" value={round(summary.bestCase)} />
          ) : null}

          {/* The target marker. */}
          <span
            aria-hidden
            className="absolute inset-y-[-4px] w-0.5 bg-lamp-live"
            style={{ left: pct(target) }}
          >
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-lamp-live" />
          </span>
        </div>

        {/*
          Band scale beneath the track. Only the code is positioned at the
          threshold; the number rides in a title, because at 390px four labels
          between 50 and 80 collide if each carries two tokens.
        */}
        <div className="relative mt-1 h-4 w-full">
          {ranges.map(({ band, min }) => (
            <span
              key={band.code}
              title={`${band.label} — ${min} and above`}
              className={[
                'absolute top-0 text-[0.625rem] font-medium',
                currentZone?.code === band.code ? 'text-lamp-live' : 'text-etch-faint',
              ].join(' ')}
              style={{ left: pct(min), transform: min === 0 ? undefined : 'translateX(-50%)' }}
            >
              {band.code}
              <span className="ml-0.5 hidden font-mono tabular-nums sm:inline">{min}</span>
            </span>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="sr-only">Target percentage</span>
          <input
            type="range"
            min={0}
            max={SCALE_MAX}
            step={0.5}
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
            className="w-full accent-lamp-live"
          />
        </label>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {[...bands]
            .sort((a, b) => b.minScore - a.minScore)
            .filter((band) => band.minScore > 0)
            .map((band) => (
              <button
                key={band.code}
                type="button"
                onClick={() => setTarget(band.minScore)}
                aria-pressed={target === band.minScore}
                className={[
                  'rounded-[1px] px-2.5 py-1 text-xs font-medium transition-colors',
                  target === band.minScore
                    ? 'bg-strip text-strip-ink'
                    : 'bg-rack-700 text-etch-dim hover:bg-rack-600 hover:text-etch',
                ].join(' ')}
                title={`${band.label} — ${band.minScore} and above`}
              >
                {band.code}
              </button>
            ))}

          <label className="ml-auto flex items-center gap-2 text-xs text-etch-dim">
            Target
            <input
              type="number"
              min={0}
              max={SCALE_MAX}
              step="any"
              value={target}
              onChange={(event) => setTarget(clampNumber(Number(event.target.value), 0, SCALE_MAX))}
              aria-label="Target percentage"
              className="w-20 rounded-[1px] border border-rack-600 bg-rack-900 px-2 py-1 text-right font-mono tabular-nums text-etch focus:border-lamp-live focus:outline-none"
            />
          </label>
        </div>
      </div>

      <Warnings summary={summary} />
    </div>
  );
}

/**
 * The grade actually earned so far, and its band.
 *
 * Deliberately computed from marked work rather than from the running total: a
 * unit with 45.3 of 100 banked but only half of it graded is being carried at
 * 90.6%, and banding the running total would report that as a fail. Once
 * nothing is outstanding the two converge and this becomes the final grade.
 */
function Standing({ standing }: { standing: UnitStanding }) {
  if (standing.percent === null) {
    return (
      <div className="bg-rack-700/40 px-4 pb-3 pt-4">
        <p className="text-tally font-semibold text-etch-faint">—</p>
        <p className="mt-1 text-sm text-etch-dim">Nothing graded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-rack-700/40 px-4 pb-3 pt-4">
      <p className="flex items-baseline gap-2">
        <GaugeFigure>{round(standing.percent)}</GaugeFigure>
        <span className="text-tally text-etch-dim">%</span>
        {standing.band ? (
          <span className="rounded-[1px] bg-strip px-2 py-0.5 text-tally font-semibold leading-none text-strip-ink">
            {standing.band.code}
          </span>
        ) : null}
      </p>
      <p className="mt-1.5 text-sm text-etch-dim">
        {standing.settled ? 'Final grade. Everything is graded.' : 'Your grade on work marked so far.'}
      </p>
    </div>
  );
}

/**
 * The answer, in the product's own language.
 *
 * whatDoINeed returns a discriminated union of five outcomes, so this switch is
 * exhaustive by construction — adding a sixth outcome would fail to compile
 * here rather than silently render nothing.
 */
function Readout({
  outcome,
  summary,
  targetBand,
}: {
  outcome: ReturnType<typeof whatDoINeed>;
  summary: UnitGradeSummary;
  targetBand: BandLike | null;
}) {
  const suffix = targetBand ? ` (${targetBand.code})` : '';

  let headline: React.ReactNode;
  let detail: string;
  let tone: 'live' | 'over' | 'clear' | 'neutral';

  switch (outcome.status) {
    case 'achievable':
      tone = 'live';
      headline = (
        <>
          <GaugeFigure>{round(outcome.neededAverageOnRemaining)}</GaugeFigure>
          <span className="ml-1 text-tally text-etch-dim">%</span>
        </>
      );
      detail =
        `average needed across the remaining ${round(summary.weightingRemaining)}% ` +
        `to reach ${round(outcome.target.percent)}${suffix}`;
      break;

    case 'guaranteed':
      tone = 'clear';
      headline = <span className="text-tally font-semibold text-lamp-clear">Already locked in</span>;
      detail =
        `${round(outcome.target.percent)}${suffix} is banked regardless of the remaining ` +
        `${round(summary.weightingRemaining)}% — you are ${round(Math.abs(outcome.neededFromRemaining))} points clear.`;
      break;

    case 'impossible':
      tone = 'over';
      headline = <span className="text-tally font-semibold text-lamp-over">Out of reach</span>;
      detail =
        `${round(outcome.target.percent)}${suffix} needs ${round(outcome.neededAverageOnRemaining)}% ` +
        `of the remaining ${round(summary.weightingRemaining)}%. Full marks on everything left ` +
        `reaches ${round(outcome.bestPossible)}, ${round(outcome.shortfall)} short.`;
      break;

    case 'locked-achieved':
      tone = 'clear';
      // No band beside this figure. It previously showed the TARGET's band,
      // which labelled a 95.3 as "C" whenever C was the band being aimed at.
      // The achieved grade and its band live in the standing panel beside this.
      headline = <span className="text-tally font-semibold text-lamp-clear">Target reached</span>;
      detail =
        `${round(outcome.target.percent)}${suffix} is cleared by ${round(outcome.margin)}, ` +
        'with everything graded.';
      break;

    case 'locked-missed':
      tone = 'over';
      headline = <span className="text-tally font-semibold text-lamp-over">Target missed</span>;
      detail =
        `Everything is graded, ${round(outcome.shortfall)} short of ` +
        `${round(outcome.target.percent)}${suffix}.`;
      break;
  }

  return (
    <div
      className={[
        'border-b px-4 pb-3 pt-4',
        tone === 'over'
          ? 'border-lamp-over/35'
          : tone === 'clear'
            ? 'border-lamp-clear/35'
            : 'border-rack-600',
      ].join(' ')}
    >
      <div className="flex items-baseline gap-x-4 gap-y-1">
        <span className="flex items-baseline">{headline}</span>
      </div>
      <p className="mt-1 max-w-prose text-sm text-etch-dim">{detail}</p>

      {/*
        Nothing else goes here. Banked and ceiling are marked on the track
        itself, and the grade so far is the whole subject of the panel beside
        this one — repeating either would be the hero-metric template's
        supporting-stats tell wearing a different hat.
      */}
    </div>
  );
}

/** PRD.md §7's edge cases, named plainly. Warn, never silently correct. */
function Warnings({ summary }: { summary: UnitGradeSummary }) {
  if (summary.warnings.length === 0) return null;

  return (
    <ul className="space-y-1 border-t border-rack-600 px-4 py-3">
      {summary.warnings.map((warning) => (
        <li key={warning.kind} className="flex gap-2 text-xs text-lamp-live">
          <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 shrink-0 bg-lamp-live" />
          <span>
            {warning.kind === 'weighting-sum-not-100'
              ? `Weightings total ${round(warning.totalWeighting)}%, not 100%. These figures are ` +
                'still calculated out of 100, so they will be off until the rack is complete.'
              : warning.kind === 'completed-without-mark'
                ? `${warning.indexes.length} ${warning.indexes.length === 1 ? 'strip is' : 'strips are'} ` +
                  'marked graded with no mark entered, and counted as zero.'
                : warning.kind === 'mark-exceeds-max'
                  ? `${warning.indexes.length} ${warning.indexes.length === 1 ? 'mark is' : 'marks are'} ` +
                    'higher than what the assessment was out of. Counted as entered, in case ' +
                    'they are bonus marks.'
                  : warning.kind === 'invalid-max-mark'
                    ? `${warning.indexes.length} graded ${warning.indexes.length === 1 ? 'strip is' : 'strips are'} ` +
                      'marked out of zero, so nothing can be scored from them. Set what each was out of.'
                    : 'Some weightings or marks are negative.'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A figure marked where it happens on the track, rather than listed beneath it.
 * The tick is the rule; the number hangs off it.
 */
function TrackTick({ at, label, value }: { at: number; label: string; value: number }) {
  const clamped = Math.max(0, Math.min(at, SCALE_MAX));
  /*
    Both annotations describe the region to the LEFT of their tick — everything
    banked, everything reachable — so the label sits over what it measures
    rather than pointing away from it. That also keeps it clear of the target
    marker, which the reader is actively dragging.

    Below 12 there is no room on the left, so it falls back to the right.
  */
  const flip = clamped >= 12;
  return (
    <span
      aria-hidden
      className="absolute inset-y-0 w-px bg-strip-ink/45"
      style={{ left: `${clamped}%` }}
    >
      {/*
        The annotation carries its own scrap of stock rather than relying on
        what happens to sit behind it. On an empty unit both ticks land on bare
        rack, where dark ink would be invisible; on a full one they land on
        buff. Giving the label its own ground makes it readable in every case,
        and a pencilled note on a scrap is what this world does anyway.
      */}
      <span
        className={[
          'absolute top-0.5 whitespace-nowrap rounded-[1px] bg-strip px-1 py-px',
          'text-[0.625rem] leading-none',
          flip ? 'right-0.5 text-right' : 'left-0.5',
        ].join(' ')}
      >
        <span className="font-mono font-medium tabular-nums text-strip-ink">{value}</span>
        <span className="ml-1 text-strip-ink-soft">{label}</span>
      </span>
    </span>
  );
}

/**
 * The gauge's headline figure.
 *
 * Set in the sans with proportional figures, not the tabular mono used
 * everywhere else. Tabular figures exist so digits line up in a column you read
 * down; here there is no column, and a monospaced decimal point gets a full
 * digit cell — "9.4" renders as "9 . 4" at this size.
 */
function GaugeFigure({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-gauge font-semibold text-etch [font-variant-numeric:proportional-nums]">
      {children}
    </span>
  );
}

/** Display rounding only. The maths in lib/grades.ts keeps full precision. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
