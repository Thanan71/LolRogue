import { championDB } from '@/data';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import type { InventoryEntry } from '@/types/run';
import type { CombatRuleLoadout } from './types';

export function buildCombatRuleLoadout(input: {
  championIds: readonly string[];
  runeIds: readonly string[];
  runeStacks?: Record<string, Record<string, number>>;
  augmentIds: readonly string[];
  inventory: readonly InventoryEntry[];
  getUnlockedEnhancements: (championId: string) => Record<string, number>;
}): CombatRuleLoadout {
  const enhancementEffects: CombatRuleLoadout['enhancementEffects'] = {};
  const enhancementStats: CombatRuleLoadout['enhancementStats'] = {};
  for (const championId of input.championIds) {
    const champion = championDB.getById(championId);
    if (!champion) continue;
    const bonuses = enhancementService.calculateStatBonuses(
      enhancementTreeProvider.getTreeForChampion(champion),
      input.getUnlockedEnhancements(championId),
    );
    enhancementEffects[championId] = bonuses.effects;
    enhancementStats[championId] = bonuses;
  }
  return {
    runeIds: [...input.runeIds],
    runeStacks: input.runeStacks,
    augmentIds: [...input.augmentIds],
    inventory: [...input.inventory],
    enhancementEffects,
    enhancementStats,
  };
}
