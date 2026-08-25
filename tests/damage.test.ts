import { describe, expect, it } from 'vitest';
import {
  calculArmorReduction,
  calculateADDamage,
  calculateAPDamage,
  calculateTrueDamage,
  calculMReduction,
  critDamage,
} from '../src/utils/damage';

describe('Damage Calculations', () => {
  describe('calculArmorReduction', () => {
    it('should return 0 when armor is 0', () => {
      expect(calculArmorReduction(100, 0)).toBe(0);
    });

    it('should return 0 when armor is negative', () => {
      expect(calculArmorReduction(100, -10)).toBe(0);
    });

    it('should reduce 50% damage when armor equals 100', () => {
      // 100 / (100 + 100) = 0.5
      expect(calculArmorReduction(100, 100)).toBe(50);
    });

    it('should reduce ~33.33% damage when armor is 50', () => {
      // 50 / (50 + 100) = 0.333...
      const reduction = calculArmorReduction(100, 50);
      expect(reduction).toBeCloseTo(33.33, 1);
    });

    it('should reduce ~66.67% damage when armor is 200', () => {
      // 200 / (200 + 100) = 0.667
      const reduction = calculArmorReduction(100, 200);
      expect(reduction).toBeCloseTo(66.67, 1);
    });
  });

  describe('calculMReduction', () => {
    it('should return 0 when magicResist is 0', () => {
      expect(calculMReduction(100, 0)).toBe(0);
    });

    it('should return 0 when magicResist is negative', () => {
      expect(calculMReduction(100, -5)).toBe(0);
    });

    it('should reduce 50% damage when magicResist equals 100', () => {
      expect(calculMReduction(100, 100)).toBe(50);
    });

    it('should reduce ~23.08% damage when magicResist is 30', () => {
      // 30 / (30 + 100) = 0.2308
      const reduction = calculMReduction(100, 30);
      expect(reduction).toBeCloseTo(23.08, 1);
    });
  });

  describe('critDamage', () => {
    it('should apply default 2x multiplier', () => {
      expect(critDamage(100)).toBe(200);
    });

    it('should apply custom multiplier', () => {
      expect(critDamage(100, 1.75)).toBe(175);
    });

    it('should handle zero base damage', () => {
      expect(critDamage(0)).toBe(0);
    });
  });

  describe('calculateADDamage', () => {
    it('should calculate AD damage with ratio 1.0 and 0 armor', () => {
      // 60 * 1.0 - 0 = 60
      expect(calculateADDamage(60, 1.0, 0)).toBe(60);
    });

    it('should apply armor reduction correctly', () => {
      // 60 * 1.0 = 60 raw, armor 30 → 60 * (100/130) ≈ 46
      const dmg = calculateADDamage(60, 1.0, 30);
      expect(dmg).toBe(46); // Math.round(46.15) = 46
    });

    it('should apply ratio scaling', () => {
      // 60 * 1.5 = 90 raw, armor 50 → 90 * (100/150) = 60
      expect(calculateADDamage(60, 1.5, 50)).toBe(60);
    });

    it('should never return negative damage', () => {
      // Even with absurd armor, damage should be >= 0
      expect(calculateADDamage(10, 0.1, 1000)).toBe(0);
    });

    it('should handle zero AD', () => {
      expect(calculateADDamage(0, 1.0, 30)).toBe(0);
    });

    it('applies attacker percentage armor penetration before physical mitigation', () => {
      expect(calculateADDamage(100, 1, 100, 0)).toBe(50);
      expect(calculateADDamage(100, 1, 100, 0.35)).toBe(61);
    });

    it('clamps invalid armor penetration without amplifying physical damage', () => {
      expect(calculateADDamage(100, 1, 100, -0.5)).toBe(50);
      expect(calculateADDamage(100, 1, 100, 5)).toBe(100);
      expect(calculateADDamage(100, 1, 100, Number.NaN)).toBe(50);
    });
  });

  describe('calculateAPDamage', () => {
    it('should calculate AP damage with ratio 1.0 and 0 MR', () => {
      expect(calculateAPDamage(100, 1.0, 0)).toBe(100);
    });

    it('should apply magic resistance reduction correctly', () => {
      // 100 * 1.0 = 100 raw, MR 30 → 100 * (100/130) ≈ 77
      const dmg = calculateAPDamage(100, 1.0, 30);
      expect(dmg).toBe(77); // Math.round(76.92) = 77
    });

    it('should apply ratio scaling', () => {
      // 100 * 0.8 = 80 raw, MR 50 → 80 * (100/150) ≈ 53
      expect(calculateAPDamage(100, 0.8, 50)).toBe(53); // Math.round(53.33) = 53
    });

    it('should never return negative damage', () => {
      expect(calculateAPDamage(5, 0.1, 1000)).toBe(0);
    });
  });

  describe('calculateTrueDamage', () => {
    it('should return damage unchanged (no reduction)', () => {
      expect(calculateTrueDamage(100)).toBe(100);
    });

    it('should round fractional damage', () => {
      expect(calculateTrueDamage(99.7)).toBe(100);
      expect(calculateTrueDamage(99.3)).toBe(99);
    });

    it('should return 0 for negative input', () => {
      expect(calculateTrueDamage(-50)).toBe(0);
    });

    it('should return 0 for zero input', () => {
      expect(calculateTrueDamage(0)).toBe(0);
    });
  });
});
