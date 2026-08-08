import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import {
  ACHIEVEMENT_POLICY,
  canCompareRunVersions,
  COSMETIC_CONCEPTS,
  SEASON_POLICY,
  STARTER_SLOT_POLICY,
} from '@/game/progression/personalizationContract';

describe('P3 progression and personalization contract', () => {
  it('treats starter slots as server-owned balance power', () => {
    expect(STARTER_SLOT_POLICY.affectsBalance).toBe(true);
    expect(STARTER_SLOT_POLICY.defaultSlots).toBe(1);
    expect(STARTER_SLOT_POLICY.maximumSlots).toBe(3);
    expect(STARTER_SLOT_POLICY.unlocks.map(({ slots }) => slots)).toEqual([2, 3]);
  });

  it('defines exactly one stat-free cosmetic concept per maintained champion', () => {
    expect(COSMETIC_CONCEPTS.map(({ championId }) => championId).sort()).toEqual(
      implementedChampions.map(({ id }) => id).sort(),
    );
    expect(new Set(COSMETIC_CONCEPTS.map(({ id }) => id)).size).toBe(COSMETIC_CONCEPTS.length);
    for (const cosmetic of COSMETIC_CONCEPTS) {
      expect(cosmetic.palette).toHaveLength(2);
      expect(cosmetic.gameplayModifiers).toEqual([]);
    }
  });

  it('keeps achievements gated behind reliable, private server metrics', () => {
    expect(ACHIEVEMENT_POLICY.enabled).toBe(false);
    expect(ACHIEVEMENT_POLICY.requiredSource).toBe('verified');
    expect(ACHIEVEMENT_POLICY.requirementsBeforeActivation).toContain('privacy_review');
  });

  it('compares only runs from the same known gameplay ruleset', () => {
    expect(canCompareRunVersions(13, 13)).toBe(true);
    expect(canCompareRunVersions(12, 13)).toBe(false);
    expect(canCompareRunVersions(null, null)).toBe(false);
  });

  it('preserves permanent progression across additive seasons', () => {
    expect(SEASON_POLICY.permanent).toEqual(['mastery', 'enhancements', 'cosmetics']);
    expect(SEASON_POLICY.resetMode).toBe('new_rows_never_destructive_update');
    expect(SEASON_POLICY.migrationOrder).toContain('preserve_verified_run_history');
  });
});
