import { calculateRunCandyRewards } from '../src/game/run/runRewards';
import {
  calculateRunCandiesPerChampion,
  type RunRewardOutcome,
} from '../src/game/run/runRewardPolicy';
import type { RunSummary } from '../src/types/run';

function championStats(
  championId: string,
  kills: number,
  totalDamage: number,
  wavesParticipated?: number,
  biomesParticipated?: RunSummary['biomesVisited'],
) {
  return {
    championId,
    wavesParticipated,
    biomesParticipated,
    kills,
    assists: 0,
    totalDamage,
    damageToShields: 0,
    damageReceived: 0,
    healingDone: 0,
    healingReceived: 0,
    overhealing: 0,
    shieldingDone: 0,
    shieldingAbsorbed: 0,
    deaths: 0,
    itemsCollected: [],
    survived: true,
  };
}

describe('run rewards', () => {
  it.each([
    { outcome: 'immediate_abandon', wavesCompleted: 0, expected: 0 },
    { outcome: 'progressed_abandon', wavesCompleted: 1, expected: 13 },
    { outcome: 'defeat', wavesCompleted: 1, expected: 13 },
    { outcome: 'victory', wavesCompleted: 1, expected: 18 },
  ] satisfies {
    outcome: RunRewardOutcome;
    wavesCompleted: number;
    expected: number;
  }[])('applies the $outcome row of the terminal reward table', (row) => {
    expect(
      calculateRunCandiesPerChampion({
        teamSize: 1,
        wavesCompleted: row.wavesCompleted,
        biomesVisited: 1,
        outcome: row.outcome,
      }),
    ).toBe(row.expected);
  });

  it('uses the mastery candy formula as its single source of truth', () => {
    const summary: RunSummary = {
      won: true,
      wavesCompleted: 20,
      biomesVisited: ['top_lane', 'jungle', 'mid_lane'],
      championStats: [
        championStats('Garen', 5, 1000, 20, ['top_lane', 'jungle', 'mid_lane']),
        championStats('Lux', 3, 1500, 5, ['mid_lane']),
      ],
      totalKills: 8,
      totalDamage: 2500,
      goldEarned: 500,
      goldSpent: 125,
      goldBalance: 375,
      itemEvents: [],
      runLevel: 3,
    };

    expect(calculateRunCandyRewards(summary)).toEqual({
      byChampion: { Garen: 32, Lux: 9 },
      total: 41,
    });
  });

  it.each([
    { won: false, biomesVisited: [] as RunSummary['biomesVisited'] },
    { won: false, biomesVisited: ['top_lane'] as RunSummary['biomesVisited'] },
    { won: true, biomesVisited: ['top_lane'] as RunSummary['biomesVisited'] },
  ])('awards no candies for every zero-combat terminal path: %o', ({ won, biomesVisited }) => {
    const summary: RunSummary = {
      won,
      wavesCompleted: 0,
      biomesVisited,
      championStats: [championStats('Garen', 0, 0)],
      totalKills: 0,
      totalDamage: 0,
      goldEarned: 0,
      goldSpent: 0,
      goldBalance: 0,
      itemEvents: [],
      runLevel: 1,
    };

    expect(calculateRunCandyRewards(summary)).toEqual({
      byChampion: { Garen: 0 },
      total: 0,
    });
  });
});
