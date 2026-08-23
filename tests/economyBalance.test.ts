import { describe, expect, it } from 'vitest';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import { generateRunMap } from '@/game/map';
import { NodeType } from '@/game/map/types';
import {
  drawItemDefinitionByRarity,
  drawItemDefinitionForBiome,
  getTierTwoDropChance,
  ITEM_DROP_RARITY_WEIGHTS,
  TIER_TWO_DROP_CHANCE_BY_BIOME,
} from '@/game/run/itemDropRules';
import { generateAugmentChoices } from '@/game/run/runProgression';
import { AugmentEffectType, ItemRarity } from '@/types/inventory';
import { BIOMES, type Biome } from '@/types/run';
import { SeededRNG } from '@/utils/seededRandom';

function flatStat(augmentId: string): number | undefined {
  return AUGMENT_DATABASE[augmentId]?.effects.find(
    (effect) => effect.type === AugmentEffectType.TeamStatFlat,
  )?.flatValue;
}

describe('P0-BAL-04 economy balance', () => {
  it('calibrates Silver flat-stat augments to the published budget', () => {
    expect(flatStat('brute_force')).toBe(7);
    expect(flatStat('iron_skin')).toBe(5);
    expect(flatStat('arcane_mind')).toBe(7);
    expect(flatStat('vitality_boost')).toBe(90);
    expect(flatStat('swift_feet')).toBe(12);
  });

  it('keeps comparable Gold and Prismatic percentages in a strict hierarchy', () => {
    const goldValues = ['warlord', 'bulwark', 'sorcery_supreme', 'glass_cannon'].flatMap((id) =>
      AUGMENT_DATABASE[id].effects
        .filter(
          (effect) =>
            effect.type === AugmentEffectType.TeamStatPercent && (effect.percentValue ?? 0) > 0,
        )
        .map((effect) => effect.percentValue ?? 0),
    );
    const prismValues = [
      ...AUGMENT_DATABASE.divine_blessing.effects.map((effect) => effect.percentValue ?? 0),
      AUGMENT_DATABASE.hyper_carry.effects[0].percentValue ?? 0,
      AUGMENT_DATABASE.unstoppable.effects[0].percentValue ?? 0,
    ];

    expect(goldValues.every((value) => value >= 0.12 && value <= 0.15)).toBe(true);
    expect(prismValues.every((value) => value >= 0.22 && value <= 0.25)).toBe(true);
    expect(Math.min(...prismValues)).toBeGreaterThan(Math.max(...goldValues));
    expect(AUGMENT_DATABASE.divine_blessing.effects[0].percentValue).toBe(0.23);
    expect(AUGMENT_DATABASE.hyper_carry.effects[0].percentValue).toBe(0.25);
  });

  it('bounds per-combat economy augments without stack-driven snowball', () => {
    const expected = {
      golden_touch: 20,
      fortune: 40,
      golden_age: 70,
    } as const;

    for (const [id, gold] of Object.entries(expected)) {
      const augment = AUGMENT_DATABASE[id];
      expect(
        augment.effects.find((effect) => effect.type === AugmentEffectType.BonusGold)?.flatValue,
      ).toBe(gold);
      expect(augment.stackable).toBe(false);
      expect(augment.maxStacks).toBe(1);
    }
    expect(
      AUGMENT_DATABASE.golden_age.effects.find(
        (effect) => effect.type === AugmentEffectType.ShopDiscount,
      )?.percentValue,
    ).toBe(0.1);
  });

  it('draws an explicit weighted rarity before a uniform item within that rarity', () => {
    expect(ITEM_DROP_RARITY_WEIGHTS).toEqual({
      [ItemRarity.Common]: 55,
      [ItemRarity.Uncommon]: 25,
      [ItemRarity.Epic]: 15,
      [ItemRarity.Legendary]: 5,
    });

    const values = [0.96, 0.5];
    const legendary = drawItemDefinitionByRarity(
      Object.values(ITEM_DATABASE),
      () => values.shift()!,
    );
    const legendaryIds = Object.values(ITEM_DATABASE)
      .filter((item) => item.rarity === ItemRarity.Legendary)
      .map((item) => item.id)
      .sort();
    expect(legendary?.rarity).toBe(ItemRarity.Legendary);
    expect(legendary?.id).toBe(legendaryIds[Math.floor(0.5 * legendaryIds.length)]);
  });

  it('gates tier 2 by biome and guarantees the final Base boss table', () => {
    expect(TIER_TWO_DROP_CHANCE_BY_BIOME).toEqual({
      top_lane: 0,
      jungle: 0.1,
      mid_lane: 0.1,
      bot_lane: 0.2,
      river: 0.3,
      base: 0,
    });
    expect(getTierTwoDropChance('base', NodeType.Boss)).toBe(1);

    const definitions = Object.values(ITEM_DATABASE);
    const topValues = [0, 0, 0];
    const topDrop = drawItemDefinitionForBiome(
      definitions,
      'top_lane',
      NodeType.Combat,
      () => topValues.shift()!,
    );
    const bossValues = [0.999, 0, 0];
    const bossDrop = drawItemDefinitionForBiome(
      definitions,
      'base',
      NodeType.Boss,
      () => bossValues.shift()!,
    );
    expect(topDrop?.tier).toBe(1);
    expect(bossDrop?.tier).toBe(2);
  });

  it('keeps 10k-sample rarity, tier, value, yield and augment picks within gates', () => {
    const sampleSize = 10_000;
    const definitions = Object.values(ITEM_DATABASE);
    const rarityCounts = Object.fromEntries(
      Object.keys(ITEM_DROP_RARITY_WEIGHTS).map((rarity) => [rarity, 0]),
    ) as Record<keyof typeof ITEM_DROP_RARITY_WEIGHTS, number>;
    const rarityRng = new SeededRNG(0x51_7a_2026);
    for (let sample = 0; sample < sampleSize; sample++) {
      const item = drawItemDefinitionByRarity(definitions, () => rarityRng.next())!;
      rarityCounts[item.rarity as keyof typeof ITEM_DROP_RARITY_WEIGHTS]++;
    }
    for (const [rarity, weight] of Object.entries(ITEM_DROP_RARITY_WEIGHTS)) {
      const observed = rarityCounts[rarity as keyof typeof rarityCounts] / sampleSize;
      expect(Math.abs(observed - weight / 100), rarity).toBeLessThanOrEqual(0.015);
    }

    const tierTwoRates = {} as Record<Biome, number>;
    const meanItemValues = {} as Record<Biome, number>;
    for (const [biomeIndex, biome] of BIOMES.entries()) {
      const rng = new SeededRNG(0x71_32_0000 + biomeIndex);
      let tierTwo = 0;
      let totalValue = 0;
      for (let sample = 0; sample < sampleSize; sample++) {
        const item = drawItemDefinitionForBiome(definitions, biome, NodeType.Combat, () =>
          rng.next(),
        )!;
        tierTwo += Number(item.tier === 2);
        totalValue += item.goldValue;
      }
      tierTwoRates[biome] = tierTwo / sampleSize;
      meanItemValues[biome] = totalValue / sampleSize;
      expect(
        Math.abs(tierTwoRates[biome] - TIER_TWO_DROP_CHANCE_BY_BIOME[biome]),
        biome,
      ).toBeLessThanOrEqual(0.015);
    }
    expect(meanItemValues.top_lane).toBeLessThan(meanItemValues.jungle);
    expect(meanItemValues.top_lane).toBeLessThan(meanItemValues.mid_lane);
    expect(meanItemValues.bot_lane).toBeGreaterThan(
      Math.max(meanItemValues.jungle, meanItemValues.mid_lane),
    );
    expect(meanItemValues.river).toBeGreaterThan(meanItemValues.bot_lane);

    const bossRng = new SeededRNG(0x7b_055_2026);
    for (let sample = 0; sample < sampleSize; sample++) {
      expect(
        drawItemDefinitionForBiome(definitions, 'base', NodeType.Boss, () => bossRng.next())?.tier,
      ).toBe(2);
    }

    let remainingCombats = 0;
    const pickCounts: Record<string, number> = {};
    for (let seed = 1; seed <= sampleSize; seed++) {
      const maps = generateRunMap(seed);
      for (const map of maps.slice(1)) {
        const visited = new Set<string>();
        let nodeId: string | undefined = map.startNodeId;
        while (nodeId && !visited.has(nodeId)) {
          visited.add(nodeId);
          const node = map.nodes.find((candidate) => candidate.id === nodeId);
          if (!node) break;
          if ([NodeType.Combat, NodeType.Elite, NodeType.Boss].includes(node.type)) {
            remainingCombats++;
          }
          nodeId = [...node.nextNodeIds].sort()[0];
        }
      }

      const choice = generateAugmentChoices({
        seed,
        completedBiomeIndex: 0,
        runLevel: 2,
        ownedAugmentIds: [],
      }).sort()[0];
      if (choice) pickCounts[choice] = (pickCounts[choice] ?? 0) + 1;
    }
    const meanRemainingCombats = remainingCombats / sampleSize;
    const projectedYield = [20, 40, 70].map((gold) => gold * meanRemainingCombats);
    expect(projectedYield[0]).toBeLessThan(projectedYield[1]);
    expect(projectedYield[1]).toBeLessThan(projectedYield[2]);
    expect(projectedYield[2]).toBeLessThan(1_500);
    expect(Math.max(...Object.values(pickCounts)) / sampleSize).toBeLessThanOrEqual(0.6);
  }, 15_000);
});
