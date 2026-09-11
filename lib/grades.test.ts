import { describe, expect, it } from 'vitest';
import {
  bandRanges,
  scoreToBand,
  summariseUnit,
  whatDoINeed,
  type AssessmentInput,
  type BandLike,
} from './grades';

/** The PRD.md §7 defaults, mirroring what lib/db/seed.ts inserts. */
const BANDS: BandLike[] = [
  { code: 'HD', label: 'High Distinction', minScore: 80 },
  { code: 'D', label: 'Distinction', minScore: 70 },
  { code: 'C', label: 'Credit', minScore: 60 },
  { code: 'P', label: 'Pass', minScore: 50 },
  { code: 'N', label: 'Fail', minScore: 0 },
];

const graded = (weighting: number, mark: number): AssessmentInput => ({
  weighting,
  mark,
  completed: true,
});
const pending = (weighting: number): AssessmentInput => ({
  weighting,
  mark: null,
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
    const summary = summariseUnit([{ weighting: 50, mark: 45, completed: false }, graded(50, 40)]);
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
      { weighting: 50, mark: null, completed: true },
      pending(50),
    ]);
    expect(summary.pointsEarned).toBe(0);
    expect(summary.weightingCompleted).toBe(50);
    expect(summary.warnings).toContainEqual({ kind: 'completed-without-mark', indexes: [0] });
  });

  it('warns when a mark exceeds its own weighting', () => {
    const summary = summariseUnit([graded(20, 25), pending(80)]);
    expect(summary.warnings).toContainEqual({ kind: 'mark-exceeds-weighting', indexes: [0] });
    // Still counted: bonus marks are real, so this warns rather than clamps.
    expect(summary.pointsEarned).toBe(25);
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
