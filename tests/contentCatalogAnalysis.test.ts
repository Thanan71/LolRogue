import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionRegistry';
import {
  analyzeContentCatalog,
  BIOME_DESIGN,
  CHAMPION_DESIGN,
  validateBalanceCatalog,
} from '@/game/balance/contentBalance';
import { ENCOUNTER_POOLS } from '@/game/map/encounters';
import { BIOME_MAP_CONFIGS, NodeType } from '@/game/map/types';
import { BIOMES } from '@/types/run';

describe('versioned content catalog analysis', () => {
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

  it('calculates deterministic difficulty and economy indicators across generated nodes', () => {
    const first = analyzeContentCatalog(100);
    const second = analyzeContentCatalog(100);
    expect(first).toEqual(second);
    expect(first.gameplayRulesetVersion).toBe(CURRENT_AUTHORITY_VERSION.gameplay);
    expect(first.contentHash).toBe(CURRENT_AUTHORITY_VERSION.contentHash);
    expect(first.dailyScoreVersion).toBe(CURRENT_AUTHORITY_VERSION.dailyScore);
    expect(first.difficultyIndicators.map((row) => row.difficulty)).toEqual([
      'easy',
      'normal',
      'hard',
    ]);

    const [easy, normal, hard] = first.difficultyIndicators;
    expect(easy.meanEncounterPower).toBeLessThan(normal.meanEncounterPower);
    expect(normal.meanEncounterPower).toBeLessThan(hard.meanEncounterPower);
    expect(easy.meanNodeGoldReward).toBeLessThan(normal.meanNodeGoldReward);
    expect(normal.meanNodeGoldReward).toBeLessThan(hard.meanNodeGoldReward);
    expect(easy.meanNodeDropChance).toBeLessThanOrEqual(normal.meanNodeDropChance);
    expect(normal.meanNodeDropChance).toBeLessThanOrEqual(hard.meanNodeDropChance);
    expect(first.economy.minShopPrice).toBeGreaterThan(0);
    expect(first.economy.maxShopPrice).toBeGreaterThan(first.economy.minShopPrice);
    expect(first.economy.augmentCount).toBeGreaterThanOrEqual(15);
  });

  it('keeps node choices visible in every sampled biome', () => {
    const report = analyzeContentCatalog(100);
    for (const biome of BIOMES) {
      const mix = report.biomeNodeTypeCounts[biome];
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

  it('samples the generated node catalog over 30 deterministic map seeds', () => {
    const analysis = analyzeContentCatalog(30);
    expect(analysis.mapSeedCount).toBe(30);
    for (const row of analysis.difficultyIndicators) {
      expect(row.combatNodeCount).toBeGreaterThan(300);
      expect(row.meanNodeGoldReward).toBeGreaterThan(15);
      expect(row.meanNodeGoldReward).toBeLessThan(150);
      expect(row.meanNodeDropChance).toBeGreaterThan(0.05);
      expect(row.meanNodeDropChance).toBeLessThan(0.75);
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
