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

export interface RunRewardParticipant {
  championId: string;
  wavesParticipated?: number;
  biomesParticipated?: number;
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function calculateRunCandyBudget(input: {
  wavesCompleted: number;
  biomesVisited: number;
  outcome: RunRewardOutcome;
}): number {
  const wavesCompleted = normalizeCount(input.wavesCompleted);
  const biomesVisited = normalizeCount(input.biomesVisited);
  const policy = RUN_REWARD_POLICY[input.outcome];
  if (policy.requiresCompletedWave && wavesCompleted === 0) return 0;

  return (
    BASE_CANDIES +
    wavesCompleted * CANDIES_PER_WAVE +
    biomesVisited * CANDIES_PER_BIOME +
    (policy.victoryBonus ? VICTORY_BONUS : 0)
  );
}

export function calculateRunCandyAllocation(input: {
  participants: readonly RunRewardParticipant[];
  wavesCompleted: number;
  biomesVisited: number;
  outcome: RunRewardOutcome;
}): Record<string, number> {
  const wavesCompleted = normalizeCount(input.wavesCompleted);
  const biomesVisited = normalizeCount(input.biomesVisited);
  const budget = calculateRunCandyBudget({
    wavesCompleted,
    biomesVisited,
    outcome: input.outcome,
  });
  const participants = [
    ...new Map(
      input.participants
        .filter((participant) => participant.championId.length > 0)
        .map((participant) => [participant.championId, participant]),
    ).values(),
  ];
  if (budget === 0 || participants.length === 0) {
    return Object.fromEntries(participants.map((participant) => [participant.championId, 0]));
  }

  const weighted = participants.map((participant) => {
    const participatedWaves = Math.min(
      wavesCompleted,
      normalizeCount(participant.wavesParticipated ?? wavesCompleted),
    );
    const participatedBiomes = Math.min(
      biomesVisited,
      normalizeCount(participant.biomesParticipated ?? biomesVisited),
    );
    return {
      championId: participant.championId,
      weight: participatedWaves * CANDIES_PER_WAVE + participatedBiomes * CANDIES_PER_BIOME,
    };
  });
  const measuredWeight = weighted.reduce((total, participant) => total + participant.weight, 0);
  const totalWeight = measuredWeight > 0 ? measuredWeight : weighted.length;
  const shares = weighted.map((participant) => {
    const weight = measuredWeight > 0 ? participant.weight : 1;
    const scaled = budget * weight;
    return {
      championId: participant.championId,
      candies: Math.floor(scaled / totalWeight),
      remainder: scaled % totalWeight,
    };
  });
  let undistributed = budget - shares.reduce((total, share) => total + share.candies, 0);
  for (const share of [...shares].sort(
    (left, right) =>
      right.remainder - left.remainder ||
      (left.championId < right.championId ? -1 : left.championId > right.championId ? 1 : 0),
  )) {
    if (undistributed === 0) break;
    share.candies++;
    undistributed--;
  }

  return Object.fromEntries(shares.map((share) => [share.championId, share.candies]));
}

export function calculateRunCandiesPerChampion(input: {
  teamSize: number;
  wavesCompleted: number;
  biomesVisited: number;
  outcome: RunRewardOutcome;
}): number {
  const teamSize = Math.max(0, Math.floor(input.teamSize));
  if (teamSize === 0) return 0;
  const budget = calculateRunCandyBudget(input);
  return budget === 0 ? 0 : Math.max(1, Math.floor(budget / teamSize));
}
