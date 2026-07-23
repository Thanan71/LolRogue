import { calculateCandiesForTeam } from '@/services/masteryService';
import type { RunSummary } from '@/types/run';

export interface RunCandyRewards {
  total: number;
  byChampion: Record<string, number>;
}

export function calculateRunCandyRewards(
  summary: RunSummary,
): RunCandyRewards {
  const byChampion = calculateCandiesForTeam(
    summary.championStats.map((stats) => stats.championId),
    summary.wavesCompleted,
    summary.biomesVisited.length,
    summary.won,
  );

  return {
    byChampion,
    total: Object.values(byChampion).reduce((sum, candies) => sum + candies, 0),
  };
}
