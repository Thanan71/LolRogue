import { describe, expect, it } from 'vitest';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import { drawItemDefinitionByRarity, ITEM_DROP_RARITY_WEIGHTS } from '@/game/run/itemDropRules';
import { AugmentEffectType, ItemRarity } from '@/types/inventory';

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
});
