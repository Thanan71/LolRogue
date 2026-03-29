import { describe, it, expect } from 'vitest';
import type { ChampionStats } from '../src/types';
import {
  lolStatsToGameStats,
  gameStatsAtLevel,
  gameStatsForAllLevels,
} from '../src/utils/statConversion';

// ─── Fixtures ────────────────────────────────────────────────────────────

/** Aatrox-like fighter (melee bruiser) */
const FIGHTER_STATS: ChampionStats = {
  hp: 650, mp: 0, moveSpeed: 345, armor: 38, magicResist: 32,
  attackDamage: 60, attackSpeed: 0.651, attackRange: 175,
  hpPerLevel: 114, mpPerLevel: 0, armorPerLevel: 4.8,
  magicResistPerLevel: 2.05, attackDamagePerLevel: 0,
  attackSpeedPerLevel: 2.5, hpRegen: 3, hpRegenPerLevel: 0.5,
  mpRegen: 0, mpRegenPerLevel: 0, crit: 0, critPerLevel: 0,
};

/** Anivia-like mage (squishy caster) */
const MAGE_STATS: ChampionStats = {
  hp: 550, mp: 495, moveSpeed: 325, armor: 21, magicResist: 30,
  attackDamage: 51, attackSpeed: 0.658, attackRange: 600,
  hpPerLevel: 92, mpPerLevel: 45, armorPerLevel: 4.5,
  magicResistPerLevel: 1.3, attackDamagePerLevel: 0,
  attackSpeedPerLevel: 1.68, hpRegen: 5.5, hpRegenPerLevel: 0.55,
  mpRegen: 8, mpRegenPerLevel: 0.8, crit: 0, critPerLevel: 0,
};

describe('lolStatsToGameStats', () => {
  it('should map HP directly', () => {
    expect(lolStatsToGameStats(650, 38, 32, 60, 345, 0, 0).hp).toBe(650);
  });

  it('should map ATK directly', () => {
    expect(lolStatsToGameStats(650, 38, 32, 60, 345, 0, 0).atk).toBe(60);
  });

  it('should compute DEF as average of armor and magicResist', () => {
    // (38 + 32) / 2 = 35
    expect(lolStatsToGameStats(650, 38, 32, 60, 345, 0, 0).def).toBe(35);
  });

  it('should round DEF to nearest integer', () => {
    // (21 + 30) / 2 = 25.5 → 26
    expect(lolStatsToGameStats(550, 21, 30, 51, 325, 495, 0).def).toBe(26);
  });

  it('should compute AP from mana (mp * 0.03)', () => {
    // 495 * 0.03 = 14.85 → 15
    expect(lolStatsToGameStats(550, 21, 30, 51, 325, 495, 0).ap).toBe(15);
  });

  it('should compute AP = 0 for no-mana champions', () => {
    expect(lolStatsToGameStats(650, 38, 32, 60, 345, 0, 0).ap).toBe(0);
  });

  it('should map moveSpeed 325 → SPD 1', () => {
    expect(lolStatsToGameStats(550, 21, 30, 51, 325, 495, 0).spd).toBe(1);
  });

  it('should map moveSpeed 355 → SPD 10', () => {
    expect(lolStatsToGameStats(650, 38, 32, 60, 355, 0, 0).spd).toBe(10);
  });

  it('should map moveSpeed 345 → SPD 7', () => {
    expect(lolStatsToGameStats(650, 38, 32, 60, 345, 0, 0).spd).toBe(7);
  });

  it('should map moveSpeed 330 → SPD 2', () => {
    expect(lolStatsToGameStats(570, 24, 30, 57, 330, 360, 0).spd).toBe(2);
  });

  it('should clamp SPD between 1 and 10', () => {
    expect(lolStatsToGameStats(500, 20, 30, 50, 300, 0, 0).spd).toBe(1);
    expect(lolStatsToGameStats(500, 20, 30, 50, 400, 0, 0).spd).toBe(10);
  });

  it('should clamp CRIT between 0 and 100', () => {
    expect(lolStatsToGameStats(500, 20, 30, 50, 330, 0, 250).crit).toBe(100);
  });
});
