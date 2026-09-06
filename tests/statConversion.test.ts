import { describe, expect, it } from 'vitest';
import { lolStatsToGameStats } from '../src/utils/statConversion';

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

  it('should expose the supplied natural combat AP', () => {
    expect(lolStatsToGameStats(550, 21, 30, 51, 325, 25, 0).ap).toBe(25);
  });

  it('should round fractional natural AP independently from mana', () => {
    expect(lolStatsToGameStats(650, 38, 32, 60, 345, 25.4, 0).ap).toBe(25);
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
