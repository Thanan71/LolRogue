import { describe, expect, it } from 'vitest';
import {
  compareEnhancementResetFees,
  createEnhancementEconomyReport,
  simulateEnhancementSavings,
} from '../tooling/enhancements/economySimulation';

const options = {
  seed: 24,
  cohortSize: 8,
  horizonWeeks: 4,
  teamSize: 6,
  runsPerWeek: 3,
  assumedMinutesPerRun: 35,
  victoryProbability: 0.5,
  immediateAbandonProbability: 0,
};

describe('TREE-09 Candy economy evidence', () => {
  it('preserves the fixed account reward budget independently of team allocation', () => {
    const solo = simulateEnhancementSavings([], { ...options, teamSize: 1 });
    const team = simulateEnhancementSavings([], options);
    expect(solo.accountWallet).toEqual(team.accountWallet);
    expect(solo.focusMasteryCandies.median).toBeGreaterThan(team.focusMasteryCandies.median!);
  });
  it('does not treat an unavailable path or a zero reward run as achieved', () => {
    const result = simulateEnhancementSavings(
      [
        { id: 'disabled', candyCost: 10, requiredMasteryLevel: 0, available: false },
        { id: 'root', candyCost: 20, requiredMasteryLevel: 0, available: true },
      ],
      { ...options, immediateAbandonProbability: 1 },
    );
    expect(result.accountWallet.maximum).toBe(0);
    for (const goal of result.goals) {
      expect(goal.observations).toBe(0);
      expect(goal.runs.median).toBeNull();
      expect(goal.censoredPlayers).toBe(options.cohortSize);
    }
  });
  it('requires mastery as well as an account balance, even in saving scenarios', () => {
    const result = simulateEnhancementSavings(
      [
        { id: 'zero', candyCost: 0, requiredMasteryLevel: 0, available: true },
        { id: 'mastery-four', candyCost: 20, requiredMasteryLevel: 4, available: true },
      ],
      options,
    );
    expect(result.goals[0].observations).toBe(8);
    expect(result.goals[1].observations).toBe(0);
    expect(result.goals[1].assumedHours.median).toBeNull();
  });
  it('reproduces identical evidence and makes its time assumptions explicit', () => {
    const goals = [{ id: 'rank', candyCost: 40, requiredMasteryLevel: 0, available: true }];
    expect(simulateEnhancementSavings(goals, options)).toEqual(
      simulateEnhancementSavings(goals, options),
    );
    expect(simulateEnhancementSavings(goals, options)).toMatchObject({
      minutesAreAssumed: true,
      savingScenariosAreIndependent: true,
      evidence: 'synthetic-reward-policy',
    });
  });
  it.each([0, -1, Number.NaN, 5000])(
    'rejects a non-finite or unbounded population %s',
    (cohortSize) => {
      expect(() => simulateEnhancementSavings([], { ...options, cohortSize })).toThrow();
    },
  );
  it('compares a ten percent fee with integer accounting without creating Candies', () => {
    expect(compareEnhancementResetFees(101, 0).proposedTenPercent).toEqual({ fee: 0, refund: 101 });
    expect(compareEnhancementResetFees(101, 1).proposedTenPercent).toEqual({ fee: 10, refund: 91 });
    expect(compareEnhancementResetFees(101, 1, true).proposedTenPercent.refund).toBe(101);
    for (let spend = 0; spend < 300; spend++) {
      const result = compareEnhancementResetFees(spend, 2);
      expect(result.proposedTenPercent.fee + result.proposedTenPercent.refund).toBe(spend);
      expect(result.free.refund).toBe(spend);
    }
    expect(() => compareEnhancementResetFees(-1, 0)).toThrow();
  });
  it('inventories all role nodes, worst case prices and six labeled modeled cohorts', () => {
    const report = createEnhancementEconomyReport(4);
    expect(report.inventory).toHaveLength(6);
    expect(report.inventory.flatMap((tree) => tree.nodeCosts)).toHaveLength(72);
    expect(report.cohorts).toHaveLength(6);
    expect(
      report.inventory.every(
        (tree) =>
          tree.catalogueMaximumCandies !== null &&
          tree.catalogueMaximumCandies >= tree.supportedRanksMaximumCandies,
      ),
    ).toBe(true);
    expect(report.policy).toMatchObject({
      pricesChanged: false,
      championPermanentPurchaseShards: 400,
      shippedRepeatResetFeeBasisPoints: 0,
    });
    expect(report.resetAlternatives.every((row) => row.free.refund === row.actualSpend)).toBe(true);
  });
});
