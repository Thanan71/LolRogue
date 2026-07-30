import { ITEM_DATABASE } from '@/data/items';
import {
  MAX_INVENTORY_ITEMS,
  MAX_ITEMS_PER_CHAMPION,
  type InventoryEntry,
  type Item,
} from '@/types/run';

export type InventoryRuleFailure =
  | 'unknown_item'
  | 'inventory_full'
  | 'unique_item'
  | 'max_stacks'
  | 'item_not_found'
  | 'champion_not_in_team'
  | 'item_already_equipped'
  | 'equipment_full';

export type InventoryRuleResult =
  | { valid: true }
  | { valid: false; code: InventoryRuleFailure; message: string };

export function getCanonicalRunItem(itemId: string): Item | null {
  const definition = ITEM_DATABASE[itemId];
  if (!definition) return null;
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    iconUrl: definition.iconUrl,
    stats: definition.stats.reduce<Item['stats']>((stats, bonus) => {
      const key = bonus.stat as keyof Item['stats'];
      stats[key] = (stats[key] ?? 0) + bonus.value;
      return stats;
    }, {}),
    passiveId: definition.passive?.id,
    goldValue: definition.goldValue,
  };
}

/**
 * Run inventory stores one entry per copy. This validator applies the catalogue's
 * unique/stackable/maxStacks contract before any command debits gold or grants loot.
 */
export function validateItemAddition(
  inventory: readonly InventoryEntry[],
  item: Pick<Item, 'id'>,
): InventoryRuleResult {
  const definition = ITEM_DATABASE[item.id];
  if (!definition) {
    return { valid: false, code: 'unknown_item', message: `Unknown item: ${item.id}.` };
  }
  if (inventory.length >= MAX_INVENTORY_ITEMS) {
    return { valid: false, code: 'inventory_full', message: 'The inventory is already full.' };
  }
  const copies = inventory.filter((entry) => entry.item.id === item.id).length;
  if ((definition.unique ?? !definition.stackable) && copies > 0) {
    return {
      valid: false,
      code: 'unique_item',
      message: `${definition.name} est un objet unique.`,
    };
  }
  if (definition.stackable && copies >= definition.maxStacks) {
    return {
      valid: false,
      code: 'max_stacks',
      message: `${definition.name} a atteint sa limite de ${definition.maxStacks}.`,
    };
  }
  return { valid: true };
}

export function validateItemEquipment(
  inventory: readonly InventoryEntry[],
  teamChampionIds: readonly string[],
  instanceId: string,
  championId: string,
): InventoryRuleResult {
  const entry = inventory.find((candidate) => candidate.instanceId === instanceId);
  if (!entry) {
    return { valid: false, code: 'item_not_found', message: 'The item instance is unknown.' };
  }
  if (!teamChampionIds.includes(championId)) {
    return {
      valid: false,
      code: 'champion_not_in_team',
      message: `Champion ${championId} is not on the team.`,
    };
  }
  if (entry.equippedToChampionId === championId) {
    return {
      valid: false,
      code: 'item_already_equipped',
      message: 'The item is already equipped to that champion.',
    };
  }
  if (
    inventory.filter((candidate) => candidate.equippedToChampionId === championId).length >=
    MAX_ITEMS_PER_CHAMPION
  ) {
    return {
      valid: false,
      code: 'equipment_full',
      message: `Champion ${championId} has no free equipment slot.`,
    };
  }
  const definition = ITEM_DATABASE[entry.item.id];
  if (!definition) {
    return { valid: false, code: 'unknown_item', message: `Unknown item: ${entry.item.id}.` };
  }
  if (
    (definition.unique ?? !definition.stackable) &&
    inventory.some(
      (candidate) =>
        candidate.instanceId !== instanceId &&
        candidate.item.id === entry.item.id &&
        candidate.equippedToChampionId === championId,
    )
  ) {
    return {
      valid: false,
      code: 'unique_item',
      message: `${definition.name} can only be equipped once per champion.`,
    };
  }
  return { valid: true };
}

export function normalizeInventory(
  inventory: unknown,
  teamChampionIds: readonly string[],
): InventoryEntry[] {
  if (!Array.isArray(inventory)) return [];
  const normalized: InventoryEntry[] = [];
  const instanceIds = new Set<string>();
  for (const candidate of inventory) {
    if (normalized.length >= MAX_INVENTORY_ITEMS || !candidate || typeof candidate !== 'object') {
      continue;
    }
    const entry = candidate as Partial<InventoryEntry>;
    if (
      typeof entry.instanceId !== 'string' ||
      entry.instanceId.length === 0 ||
      instanceIds.has(entry.instanceId) ||
      !entry.item ||
      typeof entry.item.id !== 'string'
    ) {
      continue;
    }
    const addition = validateItemAddition(normalized, entry.item);
    if (!addition.valid) continue;
    const item = getCanonicalRunItem(entry.item.id);
    if (!item) continue;
    instanceIds.add(entry.instanceId);
    normalized.push({
      instanceId: entry.instanceId,
      item,
      equippedToChampionId: null,
    });
  }

  for (const candidate of inventory) {
    if (!candidate || typeof candidate !== 'object') continue;
    const entry = candidate as Partial<InventoryEntry>;
    if (typeof entry.instanceId !== 'string' || typeof entry.equippedToChampionId !== 'string') {
      continue;
    }
    const validation = validateItemEquipment(
      normalized,
      teamChampionIds,
      entry.instanceId,
      entry.equippedToChampionId,
    );
    if (!validation.valid) continue;
    const target = normalized.find((item) => item.instanceId === entry.instanceId);
    if (target) target.equippedToChampionId = entry.equippedToChampionId;
  }
  return normalized;
}
