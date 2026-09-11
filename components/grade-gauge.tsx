'use client';

import { useMemo, useState } from 'react';
import {
  bandRanges,
  scoreToBand,
  whatDoINeed,
  type BandLike,
  type GradeTarget,
  type UnitGradeSummary,
} from '@/lib/grades';
import { Figure } from '@/components/ui';

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

  const pct = (n: number) => `${Math.max(0, Math.min(n, SCALE_MAX))}%`;

  return (
    <div className="border border-rack-600 bg-rack-700/40">
      <Readout outcome={outcome} summary={summary} targetBand={targetBand} />

      <div className="px-4 pb-4 pt-1">
        {/* The track. Bare rack is weight that can no longer be reached. */}
        <div className="relative h-11 w-full bg-rack-900">
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

          {/* The target marker. */}
          <span
            aria-hidden
            className="absolute inset-y-[-4px] w-0.5 bg-lamp-live"
            style={{ left: pct(target) }}
          >
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-lamp-live" />
          </span>
        </div>

        {/* Band scale beneath the track, aligned to the same 0–100. */}
        <div className="relative mt-1 h-4 w-full">
          {ranges.map(({ band, min }) => (
            <span
              key={band.code}
              className="absolute top-0 text-[0.625rem] font-medium text-etch-faint"
              style={{ left: pct(min), transform: min === 0 ? undefined : 'translateX(-50%)' }}
            >
              {band.code}
              <span className="ml-0.5 font-mono tabular-nums">{min}</span>
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
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setTarget(Math.max(0, Math.min(next, SCALE_MAX)));
              }}
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
      headline = (
        <>
          <GaugeFigure>{round(outcome.finalScore)}</GaugeFigure>
          {targetBand ? (
            <span className="ml-2 text-tally text-lamp-clear">{targetBand.code}</span>
          ) : null}
        </>
      );
      detail =
        `Final. Everything is graded, and this clears ${round(outcome.target.percent)}${suffix} ` +
        `by ${round(outcome.margin)}.`;
      break;

    case 'locked-missed':
      tone = 'over';
      headline = <GaugeFigure>{round(outcome.finalScore)}</GaugeFigure>;
      detail =
        `Final. Everything is graded, ${round(outcome.shortfall)} short of ` +
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

      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-etch-faint">
        <span>
          Banked <Figure className="text-etch">{round(summary.pointsEarned)}</Figure>
        </span>
        <span>
          Range{' '}
          <Figure className="text-etch">
            {round(summary.worstCase)}–{round(summary.bestCase)}
          </Figure>
        </span>
        {summary.currentAveragePercent !== null ? (
          <span>
            Average so far{' '}
            <Figure className="text-etch">{round(summary.currentAveragePercent)}%</Figure>
          </span>
        ) : null}
        <span>
          Outstanding <Figure className="text-etch">{round(summary.weightingRemaining)}%</Figure>
        </span>
      </div>
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
                : warning.kind === 'mark-exceeds-weighting'
                  ? `${warning.indexes.length} ${warning.indexes.length === 1 ? 'mark is' : 'marks are'} ` +
                    'higher than the weighting, which is over 100% on that assessment.'
                  : 'Some weightings or marks are negative.'}
          </span>
        </li>
      ))}
    </ul>
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
