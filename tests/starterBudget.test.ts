import { describe, expect, it } from 'vitest';
import { getStarterBudgetProfile, STARTER_BUDGET_RULESET_VERSION } from '@/game/run/starterBudget';

describe('starter formation budgets', () => {
  it('keeps every permitted non-comparable size in an explicit cohort', () => {
    expect(STARTER_BUDGET_RULESET_VERSION).toBe(2);
    expect([1, 2, 3].map(getStarterBudgetProfile)).toEqual([
      {
        teamSize: 1,
        cohortId: 'starters-1',
        enemyFormationMultiplier: 1,
        earlyTopEnemyFormationMultiplier: 0.61,
      },
      {
        teamSize: 2,
        cohortId: 'starters-2',
        enemyFormationMultiplier: 1.55,
        earlyTopEnemyFormationMultiplier: 0.95,
      },
      {
        teamSize: 3,
        cohortId: 'starters-3',
        enemyFormationMultiplier: 2,
        earlyTopEnemyFormationMultiplier: 1.22,
      },
    ]);
  });

  it.each([0, 4, 1.5, Number.NaN])('rejects unclassified team size %s', (teamSize) => {
    expect(() => getStarterBudgetProfile(teamSize)).toThrow('between 1 and 3');
  });
});
