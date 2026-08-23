import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import {
  ACHIEVEMENT_POLICY,
  canCompareRunVersions,
  COSMETIC_CONCEPTS,
  MASTERY_PERSONALIZATION_POLICY,
  SEASON_POLICY,
} from '@/game/progression/personalizationContract';

describe('P3 progression and personalization contract', () => {
  it('keeps mastery personalization stat-free and retires historical starter slots', () => {
    expect(MASTERY_PERSONALIZATION_POLICY.affectsBalance).toBe(false);
    expect(MASTERY_PERSONALIZATION_POLICY.legacyUnlockIds).toEqual([
      'starter_slot_2',
      'starter_slot_3',
    ]);
    expect(MASTERY_PERSONALIZATION_POLICY.legacyUnlockBehavior).toBe('history_only');
    expect(MASTERY_PERSONALIZATION_POLICY.unlocks).toEqual([
      { id: 'roster_offer_7', masteryLevel: 1, rosterOfferSize: 7 },
      { id: 'starter_reroll_1', masteryLevel: 3, rerolls: 1 },
    ]);
    expect(MASTERY_PERSONALIZATION_POLICY.dailyPolicy).toBe('disabled');
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
