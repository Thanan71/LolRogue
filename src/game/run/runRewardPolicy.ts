import { BASE_CANDIES, CANDIES_PER_BIOME, CANDIES_PER_WAVE, VICTORY_BONUS } from '@/types/mastery';

export type RunRewardOutcome = 'immediate_abandon' | 'progressed_abandon' | 'defeat' | 'victory';

export const RUN_REWARD_POLICY = {
  immediate_abandon: { requiresCompletedWave: true, victoryBonus: false },
  progressed_abandon: { requiresCompletedWave: true, victoryBonus: false },
  defeat: { requiresCompletedWave: true, victoryBonus: false },
  victory: { requiresCompletedWave: true, victoryBonus: true },
} as const satisfies Record<
  RunRewardOutcome,
  { requiresCompletedWave: boolean; victoryBonus: boolean }
>;

export function calculateRunCandiesPerChampion(input: {
  teamSize: number;
  wavesCompleted: number;
  biomesVisited: number;
  outcome: RunRewardOutcome;
}): number {
  const teamSize = Math.max(0, Math.floor(input.teamSize));
  const wavesCompleted = Math.max(0, Math.floor(input.wavesCompleted));
  const biomesVisited = Math.max(0, Math.floor(input.biomesVisited));
  const policy = RUN_REWARD_POLICY[input.outcome];

  if (teamSize === 0 || (policy.requiresCompletedWave && wavesCompleted === 0)) return 0;

  const rawTotal =
    BASE_CANDIES +
    wavesCompleted * CANDIES_PER_WAVE +
    biomesVisited * CANDIES_PER_BIOME +
    (policy.victoryBonus ? VICTORY_BONUS : 0);

  return Math.max(1, Math.floor(rawTotal / teamSize));
}
