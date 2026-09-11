/**
 * Grade calculation — the exact spec in PRD.md §7.
 *
 * Pure by design, per CLAUDE.md: nothing here imports React, the database, or
 * anything else. Every function takes plain numbers and returns plain data, so
 * the whole of §7 is verifiable in lib/grades.test.ts without rendering or
 * seeding anything.
 *
 * The one idea to hold on to while reading: a `mark` is *weighted points
 * earned*, not a percentage (PRD.md §5). An assessment worth 40% of the unit,
 * scored 92%, has a mark of 36.8. That means points and weightings are already
 * on the same scale and can simply be added — no conversion happens anywhere in
 * this file, which is precisely why the data is stored that way.
 */

/**
 * PRD.md §7 computes targets "assuming total weighting = 100". Named rather
 * than inlined so the assumption is visible at every use, and so the mismatch
 * warning below can point at the same constant.
 */
const ASSUMED_TOTAL_WEIGHTING = 100;

/**
 * Floating-point guard rail. Marks like 7.5 and 36.8 are not exactly
 * representable in binary, so sums drift: 0.1 + 0.2 is 0.30000000000000004, and
 * an accumulated total can land at 79.99999999999999 when it should be 80.
 * Without rounding before comparison, that score silently becomes a D instead of
 * an HD, and a target needing exactly 100% on the remainder reads as impossible.
 *
 * Ten decimal places is far beyond any real mark's precision while sitting well
 * inside the ~15 significant digits a double can represent, so it absorbs drift
 * without ever changing a number a user typed.
 */
const PRECISION_DP = 10;

function round(value: number, dp: number = PRECISION_DP): number {
  const factor = 10 ** dp;
  // + 0 normalises -0 to 0, so a zero shortfall never renders as "-0".
  return Math.round(value * factor) / factor + 0;
}

/** The subset of an assessment the maths actually depends on. */
export interface AssessmentInput {
  /** Percentage of the unit's final grade. Fractional values (7.5) are normal. */
  weighting: number;
  /** Weighted points earned. null means not graded yet. */
  mark: number | null;
  /** True once *graded*, per PRD.md §5 — not merely submitted. */
  completed: boolean;
}

/** A grade band, narrowed to what the calculations need. */
export interface BandLike {
  code: string;
  label: string;
  minScore: number;
}

export type GradeWarning =
  /**
   * PRD.md §7's explicit edge case. Reported rather than corrected: silently
   * rescaling to the real total would change every number on screen without the
   * user knowing the app had second-guessed their data.
   */
  | { kind: 'weighting-sum-not-100'; totalWeighting: number }
  /** Marked graded but no mark entered. Counted as 0 points, which may be wrong. */
  | { kind: 'completed-without-mark'; indexes: number[] }
  /** Scored above 100% of the assessment's weight — a typo, or genuine bonus marks. */
  | { kind: 'mark-exceeds-weighting'; indexes: number[] }
  | { kind: 'negative-value'; indexes: number[] };

export interface UnitGradeSummary {
  /** Σ mark over graded assessments. Already "out of 100" (PRD.md §7). */
  pointsEarned: number;
  weightingCompleted: number;
  weightingRemaining: number;
  /** Σ of every weighting. Should be ~100; warned about when it is not. */
  totalWeighting: number;
  /** PRD.md §7's `current_running_total`: points banked, out of 100. */
  currentRunningTotal: number;
  /**
   * The other reading of §7's running total: points earned as a percentage of
   * the weight graded so far — "how am I doing in what's been marked".
   * null when nothing is graded, because 0/0 is not "zero percent".
   */
  currentAveragePercent: number | null;
  /** Final score with 100% on everything outstanding (PRD.md §7 best case). */
  bestCase: number;
  /** Final score with 0% on everything outstanding — the floor already locked in. */
  worstCase: number;
  warnings: GradeWarning[];
}

/**
 * Reduces a unit's assessments to every figure PRD.md §7 asks for.
 *
 * Incomplete assessments contribute their weighting to `weightingRemaining` and
 * nothing else — any `mark` sitting on an ungraded row is ignored outright,
 * since §7 defines the inputs as marks "where completed = true".
 */
export function summariseUnit(assessments: readonly AssessmentInput[]): UnitGradeSummary {
  let pointsEarned = 0;
  let weightingCompleted = 0;
  let weightingRemaining = 0;

  const completedWithoutMark: number[] = [];
  const markExceedsWeighting: number[] = [];
  const negative: number[] = [];

  assessments.forEach((assessment, index) => {
    const { weighting, mark, completed } = assessment;

    if (weighting < 0 || (mark !== null && mark < 0)) negative.push(index);

    if (completed) {
      weightingCompleted += weighting;
      if (mark === null) {
        completedWithoutMark.push(index);
      } else {
        pointsEarned += mark;
        if (mark > weighting) markExceedsWeighting.push(index);
      }
    } else {
      weightingRemaining += weighting;
    }
  });

  pointsEarned = round(pointsEarned);
  weightingCompleted = round(weightingCompleted);
  weightingRemaining = round(weightingRemaining);
  const totalWeighting = round(weightingCompleted + weightingRemaining);

  const warnings: GradeWarning[] = [];
  // Only meaningful once there is something to weigh; an empty unit is not a
  // data-entry mistake, it is a unit nobody has filled in yet.
  if (assessments.length > 0 && totalWeighting !== ASSUMED_TOTAL_WEIGHTING) {
    warnings.push({ kind: 'weighting-sum-not-100', totalWeighting });
  }
  if (completedWithoutMark.length > 0) {
    warnings.push({ kind: 'completed-without-mark', indexes: completedWithoutMark });
  }
  if (markExceedsWeighting.length > 0) {
    warnings.push({ kind: 'mark-exceeds-weighting', indexes: markExceedsWeighting });
  }
  if (negative.length > 0) {
    warnings.push({ kind: 'negative-value', indexes: negative });
  }

  return {
    pointsEarned,
    weightingCompleted,
    weightingRemaining,
    totalWeighting,
    currentRunningTotal: pointsEarned,
    currentAveragePercent:
      weightingCompleted > 0 ? round((pointsEarned / weightingCompleted) * 100) : null,
    bestCase: round(pointsEarned + weightingRemaining),
    worstCase: pointsEarned,
    warnings,
  };
}

/** What the user is aiming for: a raw percentage, or a band from settings. */
export type GradeTarget =
  | { kind: 'percent'; value: number }
  | { kind: 'band'; band: BandLike };

export interface ResolvedTarget {
  /** The percentage being aimed at. For a band, its floor — the score that reaches it. */
  percent: number;
  label: string;
}

export function resolveTarget(target: GradeTarget): ResolvedTarget {
  if (target.kind === 'percent') {
    return { percent: round(target.value), label: `${round(target.value, 2)}%` };
  }
  // A band is reached at its floor: "get a D" means "get to 70", not "get to 79".
  return {
    percent: round(target.band.minScore),
    label: `${target.band.code} (${round(target.band.minScore, 2)}%)`,
  };
}

interface TargetOutcomeBase {
  target: ResolvedTarget;
  /** PRD.md §7: target% × 100, i.e. the points needed out of an assumed 100. */
  neededPointsTotal: number;
  /** `needed_points_total − points_earned`. Negative once the target is banked. */
  neededFromRemaining: number;
  pointsEarned: number;
  weightingRemaining: number;
}

/**
 * The five genuinely different answers to "what do I need?".
 *
 * Modelled as a discriminated union rather than a number plus a couple of
 * booleans because these are different *kinds* of answer, not one answer with
 * flags attached. `neededAverageOnRemaining` is meaningless when nothing
 * remains, and `shortfall` is meaningless when the target is still reachable —
 * a union makes those fields unreachable in the cases where they would lie, and
 * makes it a type error for the UI to forget a case.
 */
export type TargetOutcome =
  /** Reachable with a plausible score on what is left. */
  | (TargetOutcomeBase & { status: 'achievable'; neededAverageOnRemaining: number })
  /** PRD.md §7's "already guaranteed": banked regardless of the remaining work. */
  | (TargetOutcomeBase & { status: 'guaranteed'; neededAverageOnRemaining: number })
  /** PRD.md §7's "impossible": needs over 100% of what is left. */
  | (TargetOutcomeBase & {
      status: 'impossible';
      neededAverageOnRemaining: number;
      /** Final score with 100% on everything outstanding. */
      bestPossible: number;
      /** How far short that perfect run still lands. */
      shortfall: number;
    })
  /** Nothing left to be graded, and the target was met. */
  | (TargetOutcomeBase & { status: 'locked-achieved'; finalScore: number; margin: number })
  /** Nothing left to be graded, and the target was missed. */
  | (TargetOutcomeBase & { status: 'locked-missed'; finalScore: number; shortfall: number });

/**
 * PRD.md §7's "what do I need" mode.
 *
 * The order of the checks is load-bearing. The "nothing left" cases are settled
 * *before* the division that produces `neededAverageOnRemaining`, because a unit
 * whose assessments are all graded has `weightingRemaining === 0` and would
 * otherwise divide by zero — yielding Infinity, or NaN when the numerator is
 * also zero, and rendering as "you need Infinity%" on a unit that is already
 * finished.
 */
export function whatDoINeed(
  summary: UnitGradeSummary,
  target: GradeTarget,
): TargetOutcome {
  const resolved = resolveTarget(target);
  const { pointsEarned, weightingRemaining } = summary;

  const neededPointsTotal = round((resolved.percent / 100) * ASSUMED_TOTAL_WEIGHTING);
  const neededFromRemaining = round(neededPointsTotal - pointsEarned);

  const base: TargetOutcomeBase = {
    target: resolved,
    neededPointsTotal,
    neededFromRemaining,
    pointsEarned,
    weightingRemaining,
  };

  // 1. Nothing left to be graded — the result is final either way.
  if (weightingRemaining <= 0) {
    return neededFromRemaining <= 0
      ? {
          ...base,
          status: 'locked-achieved',
          finalScore: pointsEarned,
          margin: round(pointsEarned - neededPointsTotal),
        }
      : {
          ...base,
          status: 'locked-missed',
          finalScore: pointsEarned,
          shortfall: neededFromRemaining,
        };
  }

  const neededAverageOnRemaining = round((neededFromRemaining / weightingRemaining) * 100);

  // 2. Already banked, with work still outstanding: cannot lose it from here.
  if (neededFromRemaining <= 0) {
    return { ...base, status: 'guaranteed', neededAverageOnRemaining };
  }

  // 3. Out of reach even with a perfect score on everything remaining.
  if (neededAverageOnRemaining > 100) {
    const bestPossible = round(pointsEarned + weightingRemaining);
    return {
      ...base,
      status: 'impossible',
      neededAverageOnRemaining,
      bestPossible,
      shortfall: round(neededPointsTotal - bestPossible),
    };
  }

  return { ...base, status: 'achievable', neededAverageOnRemaining };
}

/**
 * The band a score falls in: the highest band whose floor it reaches.
 *
 * Resolving by floor alone is why db/schema.ts stores only `minScore` — there is
 * no upper bound to disagree with, so no score can fall into a gap between two
 * bands or match two at once. Returns null only if the band list is empty or
 * every floor is above the score, which the seeded 'N' band at 0 prevents.
 */
export function scoreToBand<T extends BandLike>(score: number, bands: readonly T[]): T | null {
  const rounded = round(score);
  let best: T | null = null;
  for (const band of bands) {
    if (rounded >= band.minScore && (best === null || band.minScore > best.minScore)) {
      best = band;
    }
  }
  return best;
}

/**
 * Each band's displayable range. The upper bound is derived from the floor of
 * the next band up, so the ranges always tile the scale exactly.
 */
export function bandRanges<T extends BandLike>(
  bands: readonly T[],
  max: number = ASSUMED_TOTAL_WEIGHTING,
): { band: T; min: number; max: number }[] {
  const sorted = [...bands].sort((a, b) => b.minScore - a.minScore);
  return sorted.map((band, index) => ({
    band,
    min: band.minScore,
    max: index === 0 ? max : round(sorted[index - 1]!.minScore - 0.01, 2),
  }));
}
