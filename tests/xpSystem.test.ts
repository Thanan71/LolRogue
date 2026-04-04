import { describe, it, expect } from 'vitest';
import {
  getXpForNextLevel,
  getTotalXpForLevel,
  calculateXpGain,
  addXp,
  getXpProgress,
  formatXpDisplay,
} from '../src/utils/xpSystem';

describe('XP System', () => {
  describe('getXpForNextLevel', () => {
    it('should return correct XP for level 1 to 2', () => {
      expect(getXpForNextLevel(1)).toBe(100);
    });

    it('should return correct XP for level 5 to 6', () => {
      expect(getXpForNextLevel(5)).toBe(320);
    });

    it('should return correct XP for level 17 to 18', () => {
      expect(getXpForNextLevel(17)).toBe(1940);
    });

    it('should return Infinity for max level (18)', () => {
      expect(getXpForNextLevel(18)).toBe(Infinity);
    });

    it('should return first level XP for level 0', () => {
      expect(getXpForNextLevel(0)).toBe(100);
    });
  });

  describe('getTotalXpForLevel', () => {
    it('should return 0 for level 1', () => {
      expect(getTotalXpForLevel(1)).toBe(0);
    });

    it('should return correct total XP for level 2', () => {
      expect(getTotalXpForLevel(2)).toBe(100);
    });

    it('should return cumulative XP for level 5', () => {
      // 100 + 140 + 190 + 250 = 680
      expect(getTotalXpForLevel(5)).toBe(680);
    });

    it('should cap at level 18', () => {
      const level18Total = getTotalXpForLevel(18);
      expect(getTotalXpForLevel(20)).toBe(level18Total);
    });
  });

  describe('calculateXpGain', () => {
    it('should calculate base XP for run level 1', () => {
      // 60 + 1 * 15 = 75
      expect(calculateXpGain(1)).toBe(75);
    });

    it('should calculate base XP for run level 5', () => {
      // 60 + 5 * 15 = 135
      expect(calculateXpGain(5)).toBe(135);
    });

    it('should give 50% more XP for elite combats', () => {
      // 75 * 1.5 = 112.5 -> 112
      expect(calculateXpGain(1, true)).toBe(112);
    });

    it('should give double XP for boss combats', () => {
      // 75 * 2 = 150
      expect(calculateXpGain(1, false, true)).toBe(150);
    });

    it('should stack elite and boss multipliers', () => {
      // 75 * 1.5 * 2 = 225 (but actually it's 75 * 1.5 = 112, then 112 * 2 = 224)
      // Looking at the code: baseXp = 75, if elite: baseXp = 112, if boss: baseXp = 224
      expect(calculateXpGain(1, true, true)).toBe(224);
    });
  });

  describe('addXp', () => {
    it('should add XP without leveling up', () => {
      const result = addXp(1, 0, 50);
      expect(result.previousLevel).toBe(1);
      expect(result.newLevel).toBe(1);
      expect(result.remainingXp).toBe(50);
      expect(result.leveledUp).toBe(false);
      expect(result.levelsGained).toBe(0);
    });

    it('should level up when XP threshold is reached', () => {
      const result = addXp(1, 80, 50);
      expect(result.previousLevel).toBe(1);
      expect(result.newLevel).toBe(2);
      expect(result.remainingXp).toBe(30); // 80 + 50 - 100 = 30
      expect(result.leveledUp).toBe(true);
      expect(result.levelsGained).toBe(1);
    });

    it('should level up multiple times with enough XP', () => {
      // Level 1 needs 100 XP, Level 2 needs 140 XP
      // Starting with 0 XP, adding 300 XP:
      // 300 - 100 = 200 (level 2)
      // 200 - 140 = 60 (level 3)
      const result = addXp(1, 0, 300);
      expect(result.previousLevel).toBe(1);
      expect(result.newLevel).toBe(3);
      expect(result.remainingXp).toBe(60);
      expect(result.leveledUp).toBe(true);
      expect(result.levelsGained).toBe(2);
    });

    it('should not exceed max level 18', () => {
      const result = addXp(17, 1800, 5000);
      expect(result.newLevel).toBe(18);
      expect(result.remainingXp).toBeGreaterThan(0); // XP carries over but level stays at 18
      expect(result.leveledUp).toBe(true);
    });

    it('should handle starting at max level', () => {
      const result = addXp(18, 0, 1000);
      expect(result.newLevel).toBe(18);
      expect(result.remainingXp).toBe(1000);
      expect(result.leveledUp).toBe(false);
    });

    it('should clamp level to valid range', () => {
      const result = addXp(0, 0, 50);
      expect(result.newLevel).toBe(1);
    });
  });

  describe('getXpProgress', () => {
    it('should return 0 for 0 XP at level 1', () => {
      expect(getXpProgress(1, 0)).toBe(0);
    });

    it('should return 50 for half XP at level 1', () => {
      expect(getXpProgress(1, 50)).toBe(50);
    });

    it('should return 100 for max XP at level 1', () => {
      expect(getXpProgress(1, 100)).toBe(100);
    });

    it('should return 100 for max level regardless of XP', () => {
      expect(getXpProgress(18, 0)).toBe(100);
      expect(getXpProgress(18, 1000)).toBe(100);
    });

    it('should cap at 100', () => {
      expect(getXpProgress(1, 150)).toBe(100);
    });
  });

  describe('formatXpDisplay', () => {
    it('should format XP display correctly', () => {
      expect(formatXpDisplay(1, 50)).toBe('50/100 XP');
    });

    it('should format XP display for higher levels', () => {
      expect(formatXpDisplay(5, 160)).toBe('160/320 XP');
    });

    it('should return MAX for level 18', () => {
      expect(formatXpDisplay(18, 0)).toBe('MAX');
      expect(formatXpDisplay(18, 1000)).toBe('MAX');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle a full combat sequence', () => {
      // Start at level 1 with 0 XP
      let level = 1;
      let xp = 0;

      // First combat (run level 1): gain 75 XP
      let result = addXp(level, xp, calculateXpGain(1));
      level = result.newLevel;
      xp = result.remainingXp;
      expect(level).toBe(1);
      expect(xp).toBe(75);

      // Second combat (run level 2): gain 90 XP
      result = addXp(level, xp, calculateXpGain(2));
      level = result.newLevel;
      xp = result.remainingXp;
      // 75 + 90 = 165, need 100 to level up, so level 2 with 65 XP
      expect(level).toBe(2);
      expect(xp).toBe(65);

      // Third combat (elite, run level 2): gain 135 XP
      result = addXp(level, xp, calculateXpGain(2, true));
      level = result.newLevel;
      xp = result.remainingXp;
      // 65 + 135 = 200, need 140 to level up, so level 3 with 60 XP
      expect(level).toBe(3);
      expect(xp).toBe(60);
    });
  });
});