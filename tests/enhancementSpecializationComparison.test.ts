import { describe, expect, it } from 'vitest';
import { compareChampionEnhancementSpecializations } from './helpers/enhancementSpecializationComparison';

describe('gated specialization autoplay comparison', () => {
  const first = compareChampionEnhancementSpecializations();

  it('reproduces 48 source autoplay encounters with actual kits and declared role opportunity costs', () => {
    expect(compareChampionEnhancementSpecializations()).toEqual(first);
    expect(first.champions).toHaveLength(4);
    expect(
      first.champions.flatMap(({ builds }) => builds.flatMap(({ results }) => results)),
    ).toHaveLength(48);
    expect(first).toMatchSnapshot();
  });

  it('keeps both proposed 200-Candy paths optional and distinguishes role reference spending', () => {
    for (const champion of first.champions) {
      expect(champion.builds.map(({ id }) => id)).toHaveLength(4);
      expect(champion.builds[0].spent).toBe(0);
      expect(champion.builds[1].spent).toBeLessThanOrEqual(200);
      expect(champion.builds[1].ranks).not.toEqual({});
      for (const path of champion.builds.slice(2)) {
        expect(path.spent).toBe(200);
        expect(path.remainingCandies).toBe(0);
        expect(Object.keys(path.ranks)).toHaveLength(2);
      }
    }
    expect(first.protocol.scope).toContain('human balance and Edge parity are separate');
  });

  it('reports finite bounded damage/healing/survival without using a wall-clock DPS metric', () => {
    const results = first.champions.flatMap(({ builds }) =>
      builds.flatMap(({ results }) => results),
    );
    for (const result of results) {
      for (const value of [
        result.damagePerRound,
        result.damage,
        result.healing,
        result.overhealing,
        result.damageTaken,
        result.survivingHealth,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
      expect(result.rounds).toBeGreaterThan(0);
      expect(result.rounds).toBeLessThanOrEqual(first.protocol.maxRounds);
    }
    expect(results.some(({ healing }) => healing > 0)).toBe(true);
  });
});
