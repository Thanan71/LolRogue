import { ItemRarity, type ItemDefinition } from '@/types/inventory';

export const ITEM_DROP_RARITY_WEIGHTS = {
  [ItemRarity.Common]: 55,
  [ItemRarity.Uncommon]: 25,
  [ItemRarity.Epic]: 15,
  [ItemRarity.Legendary]: 5,
} as const satisfies Partial<Record<ItemRarity, number>>;

export type DropItemRarity = keyof typeof ITEM_DROP_RARITY_WEIGHTS;

const ITEM_DROP_RARITY_ORDER: readonly DropItemRarity[] = [
  ItemRarity.Common,
  ItemRarity.Uncommon,
  ItemRarity.Epic,
  ItemRarity.Legendary,
];

/**
 * Draws the published rarity first with its explicit weight, then draws an item
 * uniformly by stable ID inside that rarity. If inventory rules exhaust a rarity,
 * the remaining published weights are normalized without changing their order.
 */
export function drawItemDefinitionByRarity(
  eligibleDefinitions: readonly ItemDefinition[],
  next: () => number,
): ItemDefinition | undefined {
  const definitionsByRarity = new Map<DropItemRarity, ItemDefinition[]>();
  for (const rarity of ITEM_DROP_RARITY_ORDER) definitionsByRarity.set(rarity, []);
  for (const definition of [...eligibleDefinitions].sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    if (definition.rarity in ITEM_DROP_RARITY_WEIGHTS) {
      definitionsByRarity.get(definition.rarity as DropItemRarity)?.push(definition);
    }
  }

  const availableRarities = ITEM_DROP_RARITY_ORDER.filter(
    (rarity) => (definitionsByRarity.get(rarity)?.length ?? 0) > 0,
  );
  const totalWeight = availableRarities.reduce(
    (total, rarity) => total + ITEM_DROP_RARITY_WEIGHTS[rarity],
    0,
  );
  if (totalWeight === 0) return undefined;

  let rarityRoll = next() * totalWeight;
  let selectedRarity = availableRarities[availableRarities.length - 1]!;
  for (const rarity of availableRarities) {
    rarityRoll -= ITEM_DROP_RARITY_WEIGHTS[rarity];
    if (rarityRoll < 0) {
      selectedRarity = rarity;
      break;
    }
  }

  const definitions = definitionsByRarity.get(selectedRarity)!;
  return definitions[Math.floor(next() * definitions.length)];
}
