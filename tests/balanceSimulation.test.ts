import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionRegistry';
import {
  BIOME_DESIGN,
  CHAMPION_DESIGN,
  simulateContentBalance,
  validateBalanceCatalog,
} from '@/game/balance/contentBalance';
import { ENCOUNTER_POOLS } from '@/game/map/encounters';
import { BIOME_MAP_CONFIGS, NodeType } from '@/game/map/types';
import { BIOMES } from '@/types/run';

describe('P3 versioned content balance', () => {
  it('defines strengths, weaknesses and tested synergies for the maintained roster', () => {
    expect(Object.keys(CHAMPION_DESIGN).sort()).toEqual(
      implementedChampions.map((champion) => champion.id).sort(),
    );
    for (const champion of implementedChampions) {
      const profile = CHAMPION_DESIGN[champion.id];
      expect(profile.role, champion.id).toBeTruthy();
      expect(profile.strengths.length, champion.id).toBeGreaterThanOrEqual(3);
      expect(profile.weaknesses.length, champion.id).toBeGreaterThanOrEqual(3);
      expect(profile.synergies.length, champion.id).toBeGreaterThanOrEqual(3);
      for (const ally of profile.synergies) {
        expect(CHAMPION_DESIGN[ally], `${champion.id} -> ${ally}`).toBeDefined();
        expect(ally).not.toBe(champion.id);
      }
    }
  });

  it('gives every biome an identity tied to a real generator contract', () => {
    expect(Object.keys(BIOME_DESIGN).sort()).toEqual([...BIOMES].sort());
    for (const biome of BIOMES) {
      const profile = BIOME_DESIGN[biome];
      const config = BIOME_MAP_CONFIGS[biome];
      expect(profile.mechanic).toBeTruthy();
      expect(profile.playerChoice).toBeTruthy();
      expect(profile.visualIdentity).toBeTruthy();
      expect(config.minColumns).toBeLessThanOrEqual(config.maxColumns);
    }

    expect(BIOME_MAP_CONFIGS.jungle.branchChance).toBeGreaterThan(
      BIOME_MAP_CONFIGS.top_lane.branchChance,
    );
    expect(BIOME_MAP_CONFIGS.river.restChance).toBeGreaterThan(
      BIOME_MAP_CONFIGS.top_lane.restChance,
    );
    expect(BIOME_MAP_CONFIGS.base.eventChance).toBe(0);
    expect(BIOME_MAP_CONFIGS.base.eliteChance).toBeGreaterThan(
      BIOME_MAP_CONFIGS.top_lane.eliteChance,
    );
  });

  it('simulates deterministic, ordered difficulty and economy curves', () => {
    const first = simulateContentBalance(100);
    const second = simulateContentBalance(100);
    expect(first).toEqual(second);
    expect(first.gameplayRulesetVersion).toBe(CURRENT_AUTHORITY_VERSION.gameplay);
    expect(first.contentHash).toBe(CURRENT_AUTHORITY_VERSION.contentHash);
    expect(first.dailyScoreVersion).toBe(CURRENT_AUTHORITY_VERSION.dailyScore);
    expect(first.curves.map((curve) => curve.difficulty)).toEqual(['easy', 'normal', 'hard']);

    const [easy, normal, hard] = first.curves;
    expect(easy.meanEnemyPower).toBeLessThan(normal.meanEnemyPower);
    expect(normal.meanEnemyPower).toBeLessThan(hard.meanEnemyPower);
    expect(easy.meanGold).toBeLessThan(normal.meanGold);
    expect(normal.meanGold).toBeLessThan(hard.meanGold);
    expect(easy.meanDropChance).toBeLessThanOrEqual(normal.meanDropChance);
    expect(normal.meanDropChance).toBeLessThanOrEqual(hard.meanDropChance);
    expect(first.economy.minShopPrice).toBeGreaterThan(0);
    expect(first.economy.maxShopPrice).toBeGreaterThan(first.economy.minShopPrice);
    expect(first.economy.augmentCount).toBeGreaterThanOrEqual(15);
  });

  it('keeps node choices visible in every simulated biome', () => {
    const report = simulateContentBalance(100);
    for (const biome of BIOMES) {
      const mix = report.biomeNodeMix[biome];
      expect(mix[NodeType.Combat] ?? 0, biome).toBeGreaterThan(0);
      if (biome === 'base') expect(mix[NodeType.Boss] ?? 0, biome).toBeGreaterThan(0);
      else expect(mix[NodeType.Exit] ?? 0, biome).toBeGreaterThan(0);
      expect(Object.values(mix).filter((count) => count > 0).length, biome).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('rejects invalid stacking or incomplete catalog contracts', () => {
    expect(validateBalanceCatalog()).toEqual([]);
  });

  it('calibrates a scripted cohort of 30 runs per difficulty', () => {
    const cohort = simulateContentBalance(30);
    expect(cohort.seedCount).toBe(30);
    for (const curve of cohort.curves) {
      expect(curve.combatNodes).toBeGreaterThan(300);
      expect(curve.meanGold).toBeGreaterThan(15);
      expect(curve.meanGold).toBeLessThan(150);
      expect(curve.meanDropChance).toBeGreaterThan(0.05);
      expect(curve.meanDropChance).toBeLessThan(0.75);
    }

    const tiers = new Set(Object.values(AUGMENT_DATABASE).map((augment) => augment.tier));
    expect(tiers.size).toBe(3);
    expect(Object.values(AUGMENT_DATABASE).every((augment) => augment.maxStacks >= 1)).toBe(true);
  });

  it('publishes one new supported encounter per biome in v13', () => {
    const expected = {
      top_lane: 'top_fortified_duel',
      jungle: 'jungle_hunted_camp',
      mid_lane: 'mid_arcane_lockdown',
      bot_lane: 'bot_frozen_vanguard',
      river: 'river_guardian_current',
      base: 'base_last_stand',
    } as const;
    for (const biome of BIOMES) {
      const encounter = ENCOUNTER_POOLS[biome].find(({ id }) => id === expected[biome]);
      expect(encounter, biome).toBeDefined();
      expect(encounter?.enemies.length, biome).toBeGreaterThanOrEqual(2);
      expect(encounter?.goldReward, biome).toBeGreaterThan(0);
      expect(encounter?.itemDropChance, biome).toBeGreaterThan(0);
    }
  });
});
