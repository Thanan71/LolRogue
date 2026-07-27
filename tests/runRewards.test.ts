import { calculateRunCandyRewards } from '../src/game/run/runRewards';
import {
  calculateRunCandiesPerChampion,
  type RunRewardOutcome,
} from '../src/game/run/runRewardPolicy';
import type { RunSummary } from '../src/types/run';

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

  it.each([
    { won: false, biomesVisited: [] as RunSummary['biomesVisited'] },
    { won: false, biomesVisited: ['top_lane'] as RunSummary['biomesVisited'] },
    { won: true, biomesVisited: ['top_lane'] as RunSummary['biomesVisited'] },
  ])('awards no candies for every zero-combat terminal path: %o', ({ won, biomesVisited }) => {
    const summary: RunSummary = {
      won,
      wavesCompleted: 0,
      biomesVisited,
      championStats: [{ championId: 'Garen', kills: 0, totalDamage: 0, survived: true }],
      totalKills: 0,
      totalDamage: 0,
      goldEarned: 0,
      runLevel: 1,
    };

    expect(calculateRunCandyRewards(summary)).toEqual({
      byChampion: { Garen: 0 },
      total: 0,
    });
  });
});
