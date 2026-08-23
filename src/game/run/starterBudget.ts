export const STARTER_BUDGET_RULESET_VERSION = 1 as const;
export const MAX_STARTER_TEAM_SIZE = 3 as const;

export type StarterTeamSize = 1 | 2 | 3;
export type StarterBudgetCohortId = `starters-${StarterTeamSize}`;

export interface StarterBudgetProfile {
  readonly teamSize: StarterTeamSize;
  readonly cohortId: StarterBudgetCohortId;
  readonly enemyFormationMultiplier: number;
}

const STARTER_BUDGET_PROFILES: Readonly<Record<StarterTeamSize, StarterBudgetProfile>> = {
  1: { teamSize: 1, cohortId: 'starters-1', enemyFormationMultiplier: 1 },
  2: { teamSize: 2, cohortId: 'starters-2', enemyFormationMultiplier: 1.55 },
  3: { teamSize: 3, cohortId: 'starters-3', enemyFormationMultiplier: 2 },
};

export function getStarterBudgetProfile(teamSize: number): StarterBudgetProfile {
  if (!Number.isSafeInteger(teamSize) || teamSize < 1 || teamSize > MAX_STARTER_TEAM_SIZE) {
    throw new RangeError('Starter budget cohorts require a team size between 1 and 3.');
  }
  return STARTER_BUDGET_PROFILES[teamSize as StarterTeamSize];
}
