import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import { RUNE_DATABASE } from '@/data/items/runeDatabase';
import { ENCOUNTER_POOLS, getBiomeBoss } from '@/game/map/encounters';
import type { Biome } from '@/types/run';

describe('P1 content and encounter balance', () => {
  it('provides validated content for every biome', () => {
    for (const [biome, encounters] of Object.entries(ENCOUNTER_POOLS)) {
      expect(encounters.length, biome).toBeGreaterThanOrEqual(3);
      for (const encounter of encounters) {
        expect(encounter.enemies.length).toBeGreaterThan(0);
        for (const enemy of encounter.enemies) {
          expect(championDB.getById(enemy.championId), enemy.championId).toBeDefined();
          expect(enemy.statMultiplier).toBeGreaterThan(0);
        }
      }
    }
    expect(championDB.count()).toBeGreaterThanOrEqual(10);
    expect(Object.keys(ITEM_DATABASE).length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(RUNE_DATABASE).length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(AUGMENT_DATABASE).length).toBeGreaterThanOrEqual(15);
  });

  it('scales biome bosses above their source encounter', () => {
    for (const biome of ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river'] as Biome[]) {
      const normalMax = Math.max(
        ...ENCOUNTER_POOLS[biome].map((encounter) =>
          encounter.enemies.reduce((sum, enemy) => sum + enemy.statMultiplier, 0),
        ),
      );
      const bossPower = getBiomeBoss(biome, 18).enemies.reduce(
        (sum, enemy) => sum + enemy.statMultiplier,
        0,
      );
      expect(bossPower).toBeGreaterThan(normalMax);
    }
  });
});
