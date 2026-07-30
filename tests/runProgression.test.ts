import { describe, expect, it } from 'vitest';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import {
  completeCombatProgression,
  generateAugmentChoices,
  transitionToNextBiome,
} from '@/game/run/runProgression';
import { AugmentTier } from '@/types/inventory';

describe('canonical run progression', () => {
  it('keeps waves global and advances one run level per biome', () => {
    const afterCombat = completeCombatProgression({
      runLevel: 1,
      currentWave: 1,
      totalWavesCompleted: 0,
    });
    expect(afterCombat).toEqual({
      runLevel: 1,
      currentWave: 2,
      totalWavesCompleted: 1,
    });

    const afterExit = transitionToNextBiome({
      seed: 424242,
      currentBiomeIndex: 0,
      biomeCount: 6,
      counters: afterCombat,
      ownedAugmentIds: [],
    });
    expect(afterExit).toMatchObject({
      currentBiomeIndex: 1,
      runLevel: 2,
      currentWave: 2,
      totalWavesCompleted: 1,
    });
    expect(afterExit?.pendingAugmentIds).toHaveLength(3);
  });

  it('generates stable weighted offers without illegal duplicates', () => {
    const first = generateAugmentChoices({
      seed: 987654,
      completedBiomeIndex: 2,
      runLevel: 4,
      ownedAugmentIds: ['glass_cannon'],
    });
    const replay = generateAugmentChoices({
      seed: 987654,
      completedBiomeIndex: 2,
      runLevel: 4,
      ownedAugmentIds: ['glass_cannon'],
    });

    expect(replay).toEqual(first);
    expect(first).toHaveLength(3);
    expect(new Set(first).size).toBe(first.length);
    expect(first).not.toContain('glass_cannon');
  });

  it('applies rarity weights while retaining only legal stacks at capacity', () => {
    const tierCounts: Record<AugmentTier, number> = {
      [AugmentTier.Silver]: 0,
      [AugmentTier.Gold]: 0,
      [AugmentTier.Prismatic]: 0,
    };
    for (let seed = 1; seed <= 400; seed++) {
      const [choice] = generateAugmentChoices({
        seed,
        completedBiomeIndex: 0,
        runLevel: 2,
        ownedAugmentIds: [],
        count: 1,
      });
      if (choice) tierCounts[AUGMENT_DATABASE[choice].tier]++;
    }
    expect(tierCounts[AugmentTier.Silver]).toBeGreaterThan(tierCounts[AugmentTier.Gold]);
    expect(tierCounts[AugmentTier.Gold]).toBeGreaterThan(tierCounts[AugmentTier.Prismatic]);

    const ownedAtCapacity = ['brute_force', 'golden_touch', 'warlord', 'fortune'];
    const offers = generateAugmentChoices({
      seed: 123,
      completedBiomeIndex: 3,
      runLevel: 5,
      ownedAugmentIds: ownedAtCapacity,
    });
    expect(offers.every((id) => ownedAtCapacity.includes(id))).toBe(true);
  });
});
