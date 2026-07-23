import { calculateRunCandyRewards } from '../src/game/run/runRewards';
import type { RunSummary } from '../src/types/run';

describe('run rewards', () => {
  it('uses the mastery candy formula as its single source of truth', () => {
    const summary: RunSummary = {
      won: true,
      wavesCompleted: 20,
      biomesVisited: ['top_lane', 'jungle', 'mid_lane'],
      championStats: [
        { championId: 'Garen', kills: 5, totalDamage: 1000, survived: true },
        { championId: 'Lux', kills: 3, totalDamage: 1500, survived: true },
      ],
      totalKills: 8,
      totalDamage: 2500,
      goldEarned: 500,
      runLevel: 3,
    };

    expect(calculateRunCandyRewards(summary)).toEqual({
      byChampion: { Garen: 20, Lux: 20 },
      total: 40,
    });
  });
});
