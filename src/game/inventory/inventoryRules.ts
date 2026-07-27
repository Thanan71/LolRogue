import { ITEM_DATABASE } from '@/data/items';
import type { InventoryEntry, Item } from '@/types/run';

export type ItemAdditionFailure = 'unique_item' | 'max_stacks';

/**
 * Run inventory stores one entry per copy. This validator applies the catalogue's
 * unique/stackable/maxStacks contract before any command debits gold or grants loot.
 */
export function validateItemAddition(
  inventory: readonly InventoryEntry[],
  item: Pick<Item, 'id'>,
): { valid: true } | { valid: false; code: ItemAdditionFailure; message: string } {
  const definition = ITEM_DATABASE[item.id];
  if (!definition) return { valid: true };
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
