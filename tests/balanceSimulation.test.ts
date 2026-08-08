import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import {
  BALANCE_DAILY_SCORE_VERSION,
  BALANCE_GAMEPLAY_RULESET_VERSION,
  BIOME_DESIGN,
  CHAMPION_DESIGN,
  simulateContentBalance,
  validateBalanceCatalog,
} from '@/game/balance/contentBalance';
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
    expect(first.gameplayRulesetVersion).toBe(BALANCE_GAMEPLAY_RULESET_VERSION);
    expect(first.dailyScoreVersion).toBe(BALANCE_DAILY_SCORE_VERSION);
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
});
