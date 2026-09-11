import { describe, expect, it } from 'vitest';
import {
  bandRanges,
  clampNumber,
  gradePointAverage,
  scoreToBand,
  summariseUnit,
  unitStanding,
  weightedContribution,
  weightingAllowance,
  whatDoINeed,
  type AssessmentInput,
  type BandLike,
  type BandWithPoint,
} from './grades';

/** The PRD.md §7 defaults, mirroring what lib/db/seed.ts inserts. */
const BANDS: BandWithPoint[] = [
  { code: 'HD', label: 'High Distinction', minScore: 80, gradePoint: 4 },
  { code: 'D', label: 'Distinction', minScore: 70, gradePoint: 3 },
  { code: 'C', label: 'Credit', minScore: 60, gradePoint: 2 },
  { code: 'P', label: 'Pass', minScore: 50, gradePoint: 1 },
  { code: 'N', label: 'Fail', minScore: 0, gradePoint: 0 },
];

/**
 * `maxMark` defaults to the weighting, which makes (mark/maxMark)*weighting
 * collapse to `mark`. That is exactly what the max_mark migration does to
 * existing rows, so every expectation below written against the original
 * weighted-points model still holds — which is the proof that the migration
 * preserved behaviour.
 */
const graded = (weighting: number, mark: number, maxMark: number = weighting): AssessmentInput => ({
  weighting,
  mark,
  maxMark,
  completed: true,
});
const pending = (weighting: number, maxMark = 100): AssessmentInput => ({
  weighting,
  mark: null,
  maxMark,
  completed: false,
});

const band = (code: string): BandLike => BANDS.find((b) => b.code === code)!;

describe('summariseUnit', () => {
  it("reproduces PRD §5's worked example: weighting 40, mark 36.8 is 92% raw", () => {
    const summary = summariseUnit([graded(40, 36.8)]);
    expect(summary.pointsEarned).toBe(36.8);
    expect(summary.weightingCompleted).toBe(40);
    expect(summary.currentAveragePercent).toBe(92);
  });

  it('splits completed and remaining weight, and reports both running totals', () => {
    const summary = summariseUnit([graded(10, 8), graded(40, 36.8), pending(50)]);

    expect(summary.pointsEarned).toBe(44.8);
    expect(summary.weightingCompleted).toBe(50);
    expect(summary.weightingRemaining).toBe(50);
    expect(summary.totalWeighting).toBe(100);

    // §7: points banked, out of 100.
    expect(summary.currentRunningTotal).toBe(44.8);
    // §7: and out of the weight graded so far.
    expect(summary.currentAveragePercent).toBe(89.6);
  });

  it('brackets the final grade with best and worst case (§7)', () => {
    const summary = summariseUnit([graded(30, 24), pending(70)]);
    expect(summary.worstCase).toBe(24); // 0% on everything remaining
    expect(summary.bestCase).toBe(94); // 100% on everything remaining
  });

  it('ignores a mark sitting on an assessment that is not yet graded', () => {
    // §7 defines the inputs as marks "where completed = true". A stray value on
    // an ungraded row must not leak into the total.
    const summary = summariseUnit([
      { weighting: 50, mark: 45, maxMark: 50, completed: false },
      graded(50, 40),
    ]);
    expect(summary.pointsEarned).toBe(40);
    expect(summary.weightingRemaining).toBe(50);
  });

  it('returns zeroes, not NaN, for a unit with no assessments', () => {
    const summary = summariseUnit([]);
    expect(summary.pointsEarned).toBe(0);
    expect(summary.totalWeighting).toBe(0);
    expect(summary.bestCase).toBe(0);
    // 0/0 is not "zero percent" — nothing has been graded.
    expect(summary.currentAveragePercent).toBeNull();
    // An empty unit is not a data-entry error.
    expect(summary.warnings).toEqual([]);
  });

  it('reports no average when nothing is graded yet', () => {
    const summary = summariseUnit([pending(50), pending(50)]);
    expect(summary.currentAveragePercent).toBeNull();
    expect(summary.weightingRemaining).toBe(100);
  });

  it('handles fractional weightings without drift', () => {
    // 7.5 x 4 + 70 = 100 exactly, but only if the float sum is rounded.
    const summary = summariseUnit([
      graded(7.5, 7.5),
      graded(7.5, 6),
      graded(7.5, 7.5),
      graded(7.5, 5.25),
      pending(70),
    ]);
    expect(summary.totalWeighting).toBe(100);
    expect(summary.pointsEarned).toBe(26.25);
    expect(summary.warnings).toEqual([]);
  });

  it('survives the classic 0.1 + 0.2 float case', () => {
    // Raw JS: 0.1 + 0.2 === 0.30000000000000004
    const summary = summariseUnit([graded(0.1, 0.1), graded(0.2, 0.2), pending(99.7)]);
    expect(summary.pointsEarned).toBe(0.3);
    expect(summary.totalWeighting).toBe(100);
  });
});

describe('summariseUnit warnings (§7 edge cases)', () => {
  it('warns when weightings sum under 100', () => {
    const summary = summariseUnit([graded(40, 30), pending(50)]);
    expect(summary.warnings).toContainEqual({ kind: 'weighting-sum-not-100', totalWeighting: 90 });
  });

  it('warns when weightings sum over 100', () => {
    const summary = summariseUnit([graded(60, 50), pending(50)]);
    expect(summary.warnings).toContainEqual({ kind: 'weighting-sum-not-100', totalWeighting: 110 });
  });

  it('stays silent when weightings sum to exactly 100', () => {
    const summary = summariseUnit([graded(50, 40), pending(50)]);
    expect(summary.warnings).toEqual([]);
  });

  it('warns, and scores zero, when an assessment is graded with no mark', () => {
    const summary = summariseUnit([
      { weighting: 50, mark: null, maxMark: 50, completed: true },
      pending(50),
    ]);
    expect(summary.pointsEarned).toBe(0);
    expect(summary.weightingCompleted).toBe(50);
    expect(summary.warnings).toContainEqual({ kind: 'completed-without-mark', indexes: [0] });
  });

  it('warns when a mark exceeds what it was out of', () => {
    // 25 out of 20, on a 20%-weighted assessment.
    const summary = summariseUnit([graded(20, 25, 20), pending(80)]);
    expect(summary.warnings).toContainEqual({ kind: 'mark-exceeds-max', indexes: [0] });
    // Still counted: bonus marks are real, so this warns rather than clamps.
    expect(summary.pointsEarned).toBe(25);
  });

  it('warns, and scores zero, when an assessment is marked out of zero', () => {
    const summary = summariseUnit([
      { weighting: 20, mark: 15, maxMark: 0, completed: true },
      pending(80),
    ]);
    expect(summary.warnings).toContainEqual({ kind: 'invalid-max-mark', indexes: [0] });
    // Not Infinity, not NaN — "out of zero" is not a score.
    expect(summary.pointsEarned).toBe(0);
    expect(Number.isFinite(summary.bestCase)).toBe(true);
  });

  it('warns on negative values', () => {
    const summary = summariseUnit([graded(20, -5), pending(80)]);
    expect(summary.warnings).toContainEqual({ kind: 'negative-value', indexes: [0] });
  });
});

describe('whatDoINeed', () => {
  it('computes the §7 formulas for a reachable target', () => {
    // 50 weight graded at 44.8 points, 50 remaining, aiming for 70 overall.
    const summary = summariseUnit([graded(10, 8), graded(40, 36.8), pending(50)]);
    const outcome = whatDoINeed(summary, { kind: 'percent', value: 70 });

    expect(outcome.status).toBe('achievable');
    expect(outcome.neededPointsTotal).toBe(70);
    expect(outcome.neededFromRemaining).toBe(25.2); // 70 - 44.8
    expect(outcome).toMatchObject({ neededAverageOnRemaining: 50.4 }); // 25.2/50*100
  });

  it('targets a band at its floor, not its ceiling', () => {
    const summary = summariseUnit([graded(50, 40), pending(50)]);
    const outcome = whatDoINeed(summary, { kind: 'band', band: band('D') });
    // "Get a D" means reach 70, not 79.
    expect(outcome.neededPointsTotal).toBe(70);
    expect(outcome.target.percent).toBe(70);
  });

  it('flags a target as impossible when it needs over 100% of what remains (§7)', () => {
    // 20 points banked, only 30 weight left, but 80 needed.
    const summary = summariseUnit([graded(70, 20), pending(30)]);
    const outcome = whatDoINeed(summary, { kind: 'band', band: band('HD') });

    expect(outcome.status).toBe('impossible');
    if (outcome.status !== 'impossible') throw new Error('unreachable');
    expect(outcome.neededAverageOnRemaining).toBe(200); // 60/30*100
    expect(outcome.bestPossible).toBe(50); // 20 + 30
    expect(outcome.shortfall).toBe(30); // 80 - 50
  });

  it('flags a target as already guaranteed when nothing more is needed (§7)', () => {
    // 55 banked against a 50 target, with 45 weight still outstanding.
    const summary = summariseUnit([graded(55, 55), pending(45)]);
    const outcome = whatDoINeed(summary, { kind: 'band', band: band('P') });

    expect(outcome.status).toBe('guaranteed');
    expect(outcome.neededFromRemaining).toBe(-5);
    expect(outcome).toMatchObject({ neededAverageOnRemaining: -11.1111111111 });
  });

  it('treats needing exactly 100% on the remainder as achievable, not impossible', () => {
    // The boundary: > 100 is impossible, so exactly 100 must not be.
    const summary = summariseUnit([graded(50, 20), pending(50)]);
    const outcome = whatDoINeed(summary, { kind: 'percent', value: 70 });
    expect(outcome.status).toBe('achievable');
    expect(outcome).toMatchObject({ neededAverageOnRemaining: 100 });
  });

  it('treats needing exactly 0 more as guaranteed, not achievable', () => {
    const summary = summariseUnit([graded(70, 70), pending(30)]);
    const outcome = whatDoINeed(summary, { kind: 'percent', value: 70 });
    expect(outcome.status).toBe('guaranteed');
    expect(outcome.neededFromRemaining).toBe(0);
  });

  describe('when every assessment is graded', () => {
    // The division-by-zero case: weightingRemaining is 0, so these must be
    // settled before neededFromRemaining / weightingRemaining is evaluated.
    const summary = summariseUnit([graded(50, 40), graded(50, 35)]); // 75 final

    it('reports a met target as locked in', () => {
      const outcome = whatDoINeed(summary, { kind: 'band', band: band('D') });
      expect(outcome.status).toBe('locked-achieved');
      if (outcome.status !== 'locked-achieved') throw new Error('unreachable');
      expect(outcome.finalScore).toBe(75);
      expect(outcome.margin).toBe(5);
      expect(Number.isFinite(outcome.neededFromRemaining)).toBe(true);
    });

    it('reports a missed target as locked out', () => {
      const outcome = whatDoINeed(summary, { kind: 'band', band: band('HD') });
      expect(outcome.status).toBe('locked-missed');
      if (outcome.status !== 'locked-missed') throw new Error('unreachable');
      expect(outcome.finalScore).toBe(75);
      expect(outcome.shortfall).toBe(5);
    });

    it('never produces Infinity or NaN', () => {
      for (const target of [0, 50, 75, 100]) {
        const outcome = whatDoINeed(summary, { kind: 'percent', value: target });
        expect(Number.isFinite(outcome.neededPointsTotal)).toBe(true);
        expect(Number.isFinite(outcome.neededFromRemaining)).toBe(true);
      }
    });
  });

  it('still answers when weightings do not sum to 100, alongside the warning', () => {
    // §7 says warn, not rescale: the answer stays computed against 100.
    const summary = summariseUnit([graded(40, 36), pending(50)]); // totals 90
    const outcome = whatDoINeed(summary, { kind: 'percent', value: 70 });

    expect(summary.warnings).toContainEqual({ kind: 'weighting-sum-not-100', totalWeighting: 90 });
    expect(outcome.neededPointsTotal).toBe(70); // not 63
    expect(outcome.neededFromRemaining).toBe(34);
    expect(outcome).toMatchObject({ neededAverageOnRemaining: 68 });
  });

  it('handles an empty unit without dividing by zero', () => {
    const outcome = whatDoINeed(summariseUnit([]), { kind: 'percent', value: 70 });
    expect(outcome.status).toBe('locked-missed');
    expect(Number.isFinite(outcome.neededFromRemaining)).toBe(true);
  });
});

describe('weightedContribution (the marks model)', () => {
  it("converts a marksheet's own numbers into points out of 100", () => {
    // The case that motivated the change: an assignment returned as 18/25,
    // worth 40% of the unit. The user types 18 and 25, never 28.8.
    expect(weightedContribution({ weighting: 40, mark: 18, maxMark: 25, completed: true })).toBe(
      28.8,
    );
  });

  it('makes each mark worth weighting/maxMark of the final grade', () => {
    // The user's own example: worth 50%, marked out of 10, so each mark is 5.
    const one = weightedContribution({ weighting: 50, mark: 1, maxMark: 10, completed: true });
    expect(one).toBe(5);
    expect(weightedContribution({ weighting: 50, mark: 8, maxMark: 10, completed: true })).toBe(40);
  });

  it('treats a maxMark of 100 as a plain percentage', () => {
    expect(weightedContribution({ weighting: 50, mark: 85, maxMark: 100, completed: true })).toBe(
      42.5,
    );
  });

  it('returns 0 rather than Infinity or NaN for a non-positive maxMark', () => {
    expect(weightedContribution({ weighting: 40, mark: 18, maxMark: 0, completed: true })).toBe(0);
    expect(weightedContribution({ weighting: 40, mark: 18, maxMark: -5, completed: true })).toBe(0);
  });

  it('returns 0 for an ungraded assessment', () => {
    expect(weightedContribution({ weighting: 40, mark: null, maxMark: 25, completed: false })).toBe(
      0,
    );
  });

  it('sums into the unit total the same way regardless of how marks are scaled', () => {
    // 18/25 at 40% and 72/100 at 40% are the same score by different routes.
    const a = summariseUnit([graded(40, 18, 25), pending(60)]);
    const b = summariseUnit([graded(40, 72, 100), pending(60)]);
    expect(a.pointsEarned).toBe(28.8);
    expect(b.pointsEarned).toBe(28.8);
  });
});

describe('unitStanding', () => {
  it('reports the grade on marked work, not the running total', () => {
    // 45.3 banked out of 100, but only 50% of the unit has been graded. The
    // honest answer is 90.6% (HD), never 45.3 (N).
    const summary = summariseUnit([graded(10, 8.5), graded(40, 36.8), pending(50)]);
    const standing = unitStanding(summary, BANDS);

    expect(standing.percent).toBe(90.6);
    expect(standing.band?.code).toBe('HD');
    expect(standing.settled).toBe(false);
  });

  it('is settled, and final, once nothing is outstanding', () => {
    const summary = summariseUnit([graded(50, 40), graded(50, 35)]);
    const standing = unitStanding(summary, BANDS);
    expect(standing.percent).toBe(75);
    expect(standing.band?.code).toBe('D');
    expect(standing.settled).toBe(true);
  });

  it('has no standing before anything is graded', () => {
    const standing = unitStanding(summariseUnit([pending(50), pending(50)]), BANDS);
    expect(standing.percent).toBeNull();
    expect(standing.band).toBeNull();
    expect(standing.settled).toBe(false);
  });

  it('does not call an empty unit settled', () => {
    // Nothing outstanding, but nothing graded either — that is not a finished unit.
    expect(unitStanding(summariseUnit([]), BANDS).settled).toBe(false);
  });
});

describe('gradePointAverage', () => {
  it('averages band grade points across units', () => {
    // HD(4) + D(3) + C(2) = 9 / 3 = 3
    expect(gradePointAverage([85, 72, 65], BANDS)).toEqual({ gpa: 3, unitCount: 3 });
  });

  it('weights every unit equally', () => {
    // Confirmed with the user: straight average, not credit-point weighted.
    expect(gradePointAverage([80, 50], BANDS).gpa).toBe(2.5);
  });

  it('skips units with no graded work rather than scoring them zero', () => {
    const result = gradePointAverage([85, null, null], BANDS);
    expect(result).toEqual({ gpa: 4, unitCount: 1 });
  });

  it('returns null, not 0, when nothing qualifies', () => {
    expect(gradePointAverage([null, null], BANDS)).toEqual({ gpa: null, unitCount: 0 });
    expect(gradePointAverage([], BANDS)).toEqual({ gpa: null, unitCount: 0 });
  });

  it('counts a fail as a real zero', () => {
    // Distinct from the null case above: this unit was graded and failed.
    expect(gradePointAverage([30, 85], BANDS)).toEqual({ gpa: 2, unitCount: 2 });
  });

  it('follows edited grade points', () => {
    // A 7-point scale, which is why grade points live in the bands table.
    const sevenPoint = BANDS.map((b) => ({ ...b, gradePoint: b.gradePoint * 1.75 }));
    expect(gradePointAverage([85], sevenPoint).gpa).toBe(7);
  });
});

describe('clamps', () => {
  it('holds a value inside its bounds', () => {
    expect(clampNumber(150, 0, 100)).toBe(100);
    expect(clampNumber(-5, 0, 100)).toBe(0);
    expect(clampNumber(42.5, 0, 100)).toBe(42.5);
  });

  it('falls back to the minimum for a non-finite value', () => {
    expect(clampNumber(Number.NaN, 0, 100)).toBe(0);
    expect(clampNumber(Number.POSITIVE_INFINITY, 0, 100)).toBe(0);
  });

  it('computes what weight is left for one assessment', () => {
    expect(weightingAllowance([{ weighting: 40 }, { weighting: 30 }])).toBe(30);
    expect(weightingAllowance([])).toBe(100);
  });

  it('never offers a negative allowance', () => {
    expect(weightingAllowance([{ weighting: 80 }, { weighting: 40 }])).toBe(0);
  });

  it('ignores a negative weighting when computing the allowance', () => {
    // A bad row must not hand out MORE than 100 of allowance to the others.
    expect(weightingAllowance([{ weighting: -20 }, { weighting: 50 }])).toBe(50);
  });

  it('leaves fractional allowances exact', () => {
    expect(weightingAllowance([{ weighting: 7.5 }, { weighting: 7.5 }])).toBe(85);
  });
});

describe('scoreToBand', () => {
  it.each([
    [100, 'HD'],
    [80, 'HD'],
    [79.999, 'D'],
    [70, 'D'],
    [69.5, 'C'],
    [60, 'C'],
    [50, 'P'],
    [49.9, 'N'],
    [0, 'N'],
  ])('maps %s to %s', (score, expected) => {
    expect(scoreToBand(score, BANDS)?.code).toBe(expected);
  });

  it('does not let float drift demote a boundary score', () => {
    // These three marks sum to exactly 80 in decimal, but in IEEE-754 doubles
    // 0.1 + 64.1 + 15.8 === 79.99999999999999. Unrounded, that is a D — the
    // user would see their HD silently downgraded by the last bit of a float.
    expect(0.1 + 64.1 + 15.8).not.toBe(80);

    const summary = summariseUnit([graded(0.1, 0.1), graded(64.1, 64.1), graded(35.8, 15.8)]);
    expect(summary.pointsEarned).toBe(80);
    expect(scoreToBand(summary.pointsEarned, BANDS)?.code).toBe('HD');
  });

  it('rounds the score it is given before comparing, not just summed totals', () => {
    // scoreToBand must guard its own input too: callers can pass a value that
    // drifted somewhere else entirely.
    expect(scoreToBand(79.99999999999999, BANDS)?.code).toBe('HD');
    // ...without swallowing a real difference just below the boundary.
    expect(scoreToBand(79.99, BANDS)?.code).toBe('D');
  });

  it('returns null when no band floor is reached', () => {
    expect(scoreToBand(10, [{ code: 'HD', label: 'High Distinction', minScore: 80 }])).toBeNull();
  });
});

describe('bandRanges', () => {
  it('derives upper bounds from the next band up, tiling the scale', () => {
    expect(bandRanges(BANDS)).toEqual([
      { band: band('HD'), min: 80, max: 100 },
      { band: band('D'), min: 70, max: 79.99 },
      { band: band('C'), min: 60, max: 69.99 },
      { band: band('P'), min: 50, max: 59.99 },
      { band: band('N'), min: 0, max: 49.99 },
    ]);
  });

  it('adapts when a threshold is edited, leaving no gap', () => {
    // CLAUDE.md requires bands stay editable; the ranges must follow.
    const edited = BANDS.map((b) => (b.code === 'HD' ? { ...b, minScore: 85 } : b));
    const ranges = bandRanges(edited);
    expect(ranges[0]).toMatchObject({ min: 85, max: 100 });
    expect(ranges[1]).toMatchObject({ min: 70, max: 84.99 });
  });
});
