import { describe, it, expect } from 'vitest';
import {
  calculateLevel,
  calculateCurrentLevelCandies,
  calculateCandiesToNext,
  calculateCandiesForChampion,
  calculateCandiesForTeam,
  buildChampionMastery,
  getStatBonusForLevel,
  getUnlocksForLevel,
  getNewUnlocks,
  getUnlockIdsForLevel,
  awardCandies,
  DEFAULT_UNLOCKS,
} from '../src/services/masteryService';
import {
  MASTERY_THRESHOLDS,
  MAX_MASTERY_LEVEL,
  STAT_BONUS_PER_LEVEL,
} from '../src/types/mastery';
import type { ChampionMastery } from '../src/types/mastery';

describe('Mastery Constants', () => {
  it('should have 5 mastery levels (0-4)', () => {
    expect(MASTERY_THRESHOLDS).toHaveLength(5);
    expect(MAX_MASTERY_LEVEL).toBe(4);
  });
  it('should have ascending thresholds', () => {
    for (let i = 1; i < MASTERY_THRESHOLDS.length; i++) {
      expect(MASTERY_THRESHOLDS[i]).toBeGreaterThan(MASTERY_THRESHOLDS[i - 1]);
    }
  });
  it('first threshold should be 0', () => {
    expect(MASTERY_THRESHOLDS[0]).toBe(0);
  });
});

describe('calculateLevel', () => {
  it('should return level 0 at 0 candies', () => { expect(calculateLevel(0)).toBe(0); });
  it('should return level 0 below first threshold', () => { expect(calculateLevel(49)).toBe(0); });
  it('should return level 1 at first threshold', () => { expect(calculateLevel(50)).toBe(1); });
  it('should return level 2 at 150 candies', () => { expect(calculateLevel(150)).toBe(2); });
  it('should return level 3 at 350 candies', () => { expect(calculateLevel(350)).toBe(3); });
  it('should return level 4 at 700 candies', () => { expect(calculateLevel(700)).toBe(4); });
  it('should cap at max level', () => { expect(calculateLevel(9999)).toBe(4); });
});

describe('calculateCurrentLevelCandies', () => {
  it('should return candies within current level', () => { expect(calculateCurrentLevelCandies(80, 1)).toBe(30); });
  it('should return 0 at max level', () => { expect(calculateCurrentLevelCandies(700, 4)).toBe(0); });
  it('should return total at level 0', () => { expect(calculateCurrentLevelCandies(25, 0)).toBe(25); });
});

describe('calculateCandiesToNext', () => {
  it('should return candies needed for next level', () => { expect(calculateCandiesToNext(10, 0)).toBe(40); });
  it('should return 0 at max level', () => { expect(calculateCandiesToNext(700, 4)).toBe(0); });
  it('should return small number when close to level up', () => { expect(calculateCandiesToNext(345, 2)).toBe(5); });
});

describe('calculateCandiesForChampion', () => {
  it('should calculate base candies', () => { expect(calculateCandiesForChampion(1, 0, 0, false)).toBe(10); });
  it('should add wave bonuses', () => { expect(calculateCandiesForChampion(1, 5, 0, false)).toBe(15); });
  it('should add biome bonuses', () => { expect(calculateCandiesForChampion(1, 0, 3, false)).toBe(16); });
  it('should add victory bonus', () => { expect(calculateCandiesForChampion(1, 0, 0, true)).toBe(15); });
  it('should split among team', () => { expect(calculateCandiesForChampion(3, 10, 4, true)).toBe(11); });
  it('should guarantee minimum 1', () => { expect(calculateCandiesForChampion(20, 0, 0, false)).toBe(1); });
});

describe('calculateCandiesForTeam', () => {
  it('should return same candies for all members', () => {
    const r = calculateCandiesForTeam(['Garen', 'Lux', 'Jinx'], 5, 2, true);
    expect(r['Garen']).toBe(r['Lux']);
    expect(r['Lux']).toBe(r['Jinx']);
  });
  it('should include all champion IDs', () => {
    const r = calculateCandiesForTeam(['Ahri', 'Darius'], 3, 1, false);
    expect(Object.keys(r).sort()).toEqual(['Ahri', 'Darius']);
  });
});

describe('buildChampionMastery', () => {
  it('should build at level 0', () => {
    const m = buildChampionMastery('Garen', 0);
    expect(m.championId).toBe('Garen');
    expect(m.totalCandies).toBe(0);
    expect(m.level).toBe(0);
    expect(m.candiesToNext).toBe(50);
    expect(m.unlockedIds).toEqual([]);
  });
  it('should build at level 2', () => {
    const m = buildChampionMastery('Lux', 200);
    expect(m.level).toBe(2);
    expect(m.currentLevelCandies).toBe(50);
    expect(m.candiesToNext).toBe(150);
  });
  it('should preserve unlockedIds', () => {
    const m = buildChampionMastery('Jinx', 100, ['starter_slot_2']);
    expect(m.unlockedIds).toEqual(['starter_slot_2']);
  });
});

describe('getStatBonusForLevel', () => {
  it('should return 0 at level 0', () => { expect(getStatBonusForLevel(0)).toBe(0); });
  it('should return 2% per level', () => {
    expect(getStatBonusForLevel(1)).toBe(0.02);
    expect(getStatBonusForLevel(4)).toBe(0.08);
  });
  it('should cap at max level', () => {
    expect(getStatBonusForLevel(99)).toBe(MAX_MASTERY_LEVEL * STAT_BONUS_PER_LEVEL);
  });
});

describe('Unlocks', () => {
  it('should have 4 default unlocks', () => { expect(DEFAULT_UNLOCKS).toHaveLength(4); });
  it('getUnlocksForLevel returns unlocks up to level', () => {
    const l2 = getUnlocksForLevel(2);
    expect(l2).toHaveLength(2);
    expect(l2.map(u => u.id)).toEqual(['starter_slot_2', 'skin_chroma_1']);
  });
  it('getNewUnlocks returns only new ones', () => {
    const n = getNewUnlocks(1, 3);
    expect(n).toHaveLength(2);
    expect(n.map(u => u.id)).toEqual(['skin_chroma_1', 'starter_slot_3']);
  });
  it('getNewUnlocks empty if no change', () => { expect(getNewUnlocks(2, 2)).toHaveLength(0); });
  it('getUnlockIdsForLevel returns IDs', () => {
    expect(getUnlockIdsForLevel(3)).toEqual(['starter_slot_2', 'skin_chroma_1', 'starter_slot_3']);
  });
});

describe('awardCandies', () => {
  it('should award to new champions', () => {
    const r = awardCandies({}, ['Garen', 'Lux'], 5, 2, false);
    expect(r.candiesAwarded['Garen']).toBeGreaterThan(0);
    expect(r.updatedMasteries['Garen']).toBeDefined();
    expect(r.newUnlocks).toHaveLength(0);
  });
  it('should accumulate candies', () => {
    const cur: Record<string, ChampionMastery> = { Garen: buildChampionMastery('Garen', 40) };
    const r = awardCandies(cur, ['Garen'], 10, 2, false);
    expect(r.updatedMasteries['Garen'].totalCandies).toBeGreaterThan(40);
    expect(r.updatedMasteries['Garen'].level).toBeGreaterThanOrEqual(1);
  });
  it('should trigger unlocks on level up', () => {
    const cur: Record<string, ChampionMastery> = { Garen: buildChampionMastery('Garen', 45) };
    const r = awardCandies(cur, ['Garen'], 10, 0, false);
    expect(r.newUnlocks.map(u => u.id)).toContain('starter_slot_2');
  });
  it('should handle multi-champion teams', () => {
    const r = awardCandies({}, ['Garen', 'Lux', 'Jinx'], 20, 3, true);
    expect(r.candiesAwarded['Garen']).toBe(13);
    expect(r.candiesAwarded['Lux']).toBe(13);
    expect(r.candiesAwarded['Jinx']).toBe(13);
  });
  it('should not duplicate unlock IDs', () => {
    const cur: Record<string, ChampionMastery> = { Garen: buildChampionMastery('Garen', 45, ['starter_slot_2']) };
    const r = awardCandies(cur, ['Garen'], 10, 0, false);
    const ids = r.updatedMasteries['Garen'].unlockedIds;
    expect(ids.filter(id => id === 'starter_slot_2').length).toBe(1);
  });
});
