import { describe, it, expect } from 'vitest';
import { calculateStats, statAtLevel } from '../src/utils/champion';
import { championDB } from '../src/data/championDatabase';

describe('Stat Scaling with Level', () => {
  describe('statAtLevel', () => {
    it('should return base stat at level 1', () => {
      // At level 1, n = 0, so stat = base
      expect(statAtLevel(100, 10, 1)).toBe(100);
    });

    it('should increase stat with level', () => {
      // At level 18, n = 17
      // stat = 100 + 10 * 17 * (0.7025 + 0.0175 * 17)
      // = 100 + 170 * (0.7025 + 0.2975)
      // = 100 + 170 * 1.0
      // = 270
      expect(statAtLevel(100, 10, 18)).toBe(270);
    });

    it('should scale correctly at mid levels', () => {
      // At level 9, n = 8
      // stat = 100 + 10 * 8 * (0.7025 + 0.0175 * 8)
      // = 100 + 80 * (0.7025 + 0.14)
      // = 100 + 80 * 0.8425
      // = 100 + 67.4
      // = 167.4
      const result = statAtLevel(100, 10, 9);
      expect(result).toBeGreaterThan(150);
      expect(result).toBeLessThan(180);
    });

    it('should clamp level to 1-18 range', () => {
      expect(statAtLevel(100, 10, 0)).toBe(100); // Should treat as level 1
      expect(statAtLevel(100, 10, 19)).toBe(270); // Should treat as level 18
    });
  });

  describe('Champion damage scaling', () => {
    it('should have higher attack damage at higher levels', () => {
      const champions = championDB.getAll();
      // Test a few champions
      const testChampions = champions.slice(0, 5);
      
      for (const champ of testChampions) {
        const stats1 = calculateStats(champ.stats, 1);
        const stats9 = calculateStats(champ.stats, 9);
        const stats18 = calculateStats(champ.stats, 18);
        
        // Attack damage should increase with level
        expect(stats9.attackDamage).toBeGreaterThan(stats1.attackDamage);
        expect(stats18.attackDamage).toBeGreaterThan(stats9.attackDamage);
      }
    });

    it('should have higher HP at higher levels', () => {
      const champions = championDB.getAll();
      const testChampions = champions.slice(0, 5);
      
      for (const champ of testChampions) {
        const stats1 = calculateStats(champ.stats, 1);
        const stats9 = calculateStats(champ.stats, 9);
        const stats18 = calculateStats(champ.stats, 18);
        
        // HP should increase with level
        expect(stats9.hp).toBeGreaterThan(stats1.hp);
        expect(stats18.hp).toBeGreaterThan(stats9.hp);
      }
    });

    it('should have higher armor at higher levels', () => {
      const champions = championDB.getAll();
      const testChampions = champions.slice(0, 5);
      
      for (const champ of testChampions) {
        const stats1 = calculateStats(champ.stats, 1);
        const stats9 = calculateStats(champ.stats, 9);
        const stats18 = calculateStats(champ.stats, 18);
        
        // Armor should increase with level
        expect(stats9.armor).toBeGreaterThan(stats1.armor);
        expect(stats18.armor).toBeGreaterThan(stats9.armor);
      }
    });

    it('should scale Garen stats correctly', () => {
      const garen = championDB.getById('Garen');
      expect(garen).toBeDefined();
      
      const stats1 = calculateStats(garen!.stats, 1);
      const stats18 = calculateStats(garen!.stats, 18);
      
      // Garen has base AD of ~68
      // Since parsed data has 0 for attackDamagePerLevel, our fallback uses ~3.0-3.5
      // At level 1: ~68 AD
      // At level 18: ~68 + 3.0 * 17 * 1.0 = ~68 + 51 = ~119 (with 3.0 growth)
      // Or with 3.5 growth: ~68 + 59.5 = ~127.5
      expect(stats1.attackDamage).toBeGreaterThan(60);
      expect(stats1.attackDamage).toBeLessThan(80);
      
      // AD should increase significantly by level 18
      expect(stats18.attackDamage).toBeGreaterThan(stats1.attackDamage + 40);
      expect(stats18.attackDamage).toBeLessThan(160);
    });
  });
});