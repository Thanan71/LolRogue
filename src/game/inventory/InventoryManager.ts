/**
 * InventoryManager — handles item equip/unequip, stacking, stat aggregation.
 */

import type { StatKey } from '@/game/effects/types';
import type { InventoryItem, ItemDefinition } from '@/types/inventory';

/**
 * @deprecated Compatibility helper for isolated tests. Production inventory mutations must go
 * through runStore and inventoryRules, which are also replayed by the authority.
 */
export class InventoryManager {
  private _items: InventoryItem[] = [];
  private _maxBagSize: number;
  private _maxItemsPerChampion: number;
  private _nextInstanceId = 1;

  constructor(maxItemsPerChampion = 6, maxBagSize = 20) {
    this._maxItemsPerChampion = maxItemsPerChampion;
    this._maxBagSize = maxBagSize;
  }

  private generateInstanceId(): string {
    return `inv_item_${Date.now()}_${this._nextInstanceId++}`;
  }

  get items(): ReadonlyArray<InventoryItem> {
    return this._items;
  }

  get bagItems(): InventoryItem[] {
    return this._items.filter((i) => i.equippedToChampionId === null);
  }

  getEquippedItems(championId: string): InventoryItem[] {
    return this._items.filter((i) => i.equippedToChampionId === championId);
  }

  getTotalItemCount(): number {
    return this._items.reduce((sum, i) => sum + i.stacks, 0);
  }

  /**
   * Add an item to inventory.
   * For stackable items, tries to stack with existing entries first.
   * @returns The instance ID of the item (or existing stack), or null if inventory is full.
   */
  addItem(definition: ItemDefinition, stacks = 1): string | null {
    if (definition.stackable) {
      const existing = this._items.find(
        (i) =>
          i.definition.id === definition.id &&
          i.equippedToChampionId === null &&
          i.stacks < definition.maxStacks,
      );
      if (existing) {
        const canAdd = Math.min(stacks, definition.maxStacks - existing.stacks);
        existing.stacks += canAdd;
        stacks -= canAdd;
      }
      if (stacks <= 0) return existing!.instanceId;
    }

    while (stacks > 0) {
      if (this.bagItems.length >= this._maxBagSize) return null;
      const take = definition.stackable ? Math.min(stacks, definition.maxStacks) : 1;
      const entry: InventoryItem = {
        instanceId: this.generateInstanceId(),
        definition,
        stacks: take,
        equippedToChampionId: null,
      };
      this._items.push(entry);
      stacks -= take;
    }

    const lastEntry = this._items[this._items.length - 1];
    return lastEntry.instanceId;
  }

  /**
   * Remove stacks from an item entry.
   * @returns true if the entry was fully removed.
   */
  removeStacks(instanceId: string, count = 1): boolean {
    const idx = this._items.findIndex((i) => i.instanceId === instanceId);
    if (idx === -1) return false;
    const entry = this._items[idx];
    entry.stacks -= count;
    if (entry.stacks <= 0) {
      this._items.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Remove an entire item entry.
   */
  removeItem(instanceId: string): boolean {
    const idx = this._items.findIndex((i) => i.instanceId === instanceId);
    if (idx === -1) return false;
    this._items.splice(idx, 1);
    return true;
  }

  /**
   * Equip an item to a champion.
   * @returns true if successful.
   */
  equipItem(instanceId: string, championId: string): boolean {
    const entry = this._items.find((i) => i.instanceId === instanceId);
    if (!entry) return false;
    if (entry.equippedToChampionId === championId) return false;

    const equippedCount = this.getEquippedItems(championId).length;
    if (equippedCount >= this._maxItemsPerChampion) return false;

    entry.equippedToChampionId = championId;
    return true;
  }

  /**
   * Unequip an item (move to bag).
   */
  unequipItem(instanceId: string): boolean {
    const entry = this._items.find((i) => i.instanceId === instanceId);
    if (!entry || entry.equippedToChampionId === null) return false;
    entry.equippedToChampionId = null;
    return true;
  }

  /**
   * Get aggregated stat bonuses from all items equipped to a champion.
   */
  getEquippedStatBonuses(championId: string): Record<StatKey, { flat: number; percent: number }> {
    const result: Record<string, { flat: number; percent: number }> = {};
    for (const item of this.getEquippedItems(championId)) {
      for (const bonus of item.definition.stats) {
        if (!result[bonus.stat]) result[bonus.stat] = { flat: 0, percent: 0 };
        const total = bonus.type === 'flat' ? bonus.value * item.stacks : bonus.value;
        if (bonus.type === 'flat') result[bonus.stat].flat += total;
        else result[bonus.stat].percent += total;
      }
      if (item.definition.passive?.modifiers) {
        for (const mod of item.definition.passive.modifiers) {
          if (!result[mod.stat]) result[mod.stat] = { flat: 0, percent: 0 };
          if (mod.type === 'percent') result[mod.stat].percent += mod.value;
          else result[mod.stat].flat += mod.value;
        }
      }
    }
    return result as Record<StatKey, { flat: number; percent: number }>;
  }

  /**
   * Get items with passives that trigger on a specific event.
   */
  getItemsWithTrigger(championId: string, trigger: string): InventoryItem[] {
    return this.getEquippedItems(championId).filter(
      (i) => i.definition.passive?.trigger === trigger,
    );
  }

  /**
   * Split a stack into two entries.
   * @returns instance ID of the new split entry, or null on failure.
   */
  splitStack(instanceId: string, count: number): string | null {
    const entry = this._items.find((i) => i.instanceId === instanceId);
    if (!entry || !entry.definition.stackable) return null;
    if (count <= 0 || count >= entry.stacks) return null;

    entry.stacks -= count;
    const newEntry: InventoryItem = {
      instanceId: this.generateInstanceId(),
      definition: entry.definition,
      stacks: count,
      equippedToChampionId: null,
    };
    this._items.push(newEntry);
    return newEntry.instanceId;
  }

  /**
   * Clear all items.
   */
  clear(): void {
    this._items = [];
  }

  /**
   * Serialize to plain objects.
   */
  toJSON(): Array<{
    instanceId: string;
    itemId: string;
    stacks: number;
    equippedTo: string | null;
  }> {
    return this._items.map((i) => ({
      instanceId: i.instanceId,
      itemId: i.definition.id,
      stacks: i.stacks,
      equippedTo: i.equippedToChampionId,
    }));
  }
}
