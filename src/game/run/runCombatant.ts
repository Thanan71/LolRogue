import { championDB } from '@/data/championDatabase';
import { AUGMENT_DATABASE, ITEM_DATABASE } from '@/data/items';
import { AugmentManager } from '@/game/augments/AugmentManager';
import { ChampionInstance } from '@/game/ChampionInstance';
import { SPELL_SLOTS } from '@/game/run/spellUpgradeRules';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import type { InventoryEntry, TeamMember } from '@/types/run';
import {
  calculateEventStatBonuses,
  calculateFullStats,
  calculateMaxHP,
  toCombatStatKey,
} from '@/utils/statCalculator';

type RunCombatMember = Pick<
  TeamMember,
  'championId' | 'level' | 'spellRanks' | 'statBoosts' | 'statMultiplier'
>;

export interface RunCombatantRules {
  inventory: readonly InventoryEntry[];
  augmentIds: readonly string[];
  currentBiomeIndex: number;
  getUnlockedEnhancements: (championId: string) => Record<string, number>;
  getMasteryLevel: (championId: string) => number;
}

export function createRunAugmentManager(
  augmentIds: readonly string[],
  currentBiomeIndex: number,
): AugmentManager {
  const manager = new AugmentManager(Math.max(4, augmentIds.length));
  for (const augmentId of augmentIds) {
    const definition = AUGMENT_DATABASE[augmentId];
    if (definition) manager.acquireAugment(definition);
  }
  manager.biomesCleared = currentBiomeIndex;
  return manager;
}

function applyRunBonuses(
  instance: ChampionInstance,
  member: RunCombatMember,
  rules: RunCombatantRules,
  augmentManager: AugmentManager,
): void {
  const champion = championDB.getById(member.championId);
  if (!champion) return;

  const calculated = enhancementService.calculateStatBonuses(
    enhancementTreeProvider.getTreeForChampion(champion),
    rules.getUnlockedEnhancements(member.championId),
  );
  const bonuses = {
    flat: { ...calculated.flat } as Record<string, number>,
    percent: { ...calculated.percent } as Record<string, number>,
    effects: [...calculated.effects],
  };
  const addBonus = (stat: string, type: 'flat' | 'percent', value: number): void => {
    const target = toCombatStatKey(stat);
    if (!target || !Number.isFinite(value) || value === 0) return;
    bonuses[type][target] = (bonuses[type][target] ?? 0) + value;
  };

  for (const [stat, bonus] of Object.entries(augmentManager.getTeamStatBonuses())) {
    addBonus(stat, 'flat', bonus.flat);
    addBonus(stat, 'percent', bonus.percent);
  }

  for (const entry of rules.inventory.filter(
    (candidate) => candidate.equippedToChampionId === member.championId,
  )) {
    for (const [stat, value] of Object.entries(entry.item.stats)) {
      if (value) addBonus(stat, 'flat', value);
    }
    const passive = ITEM_DATABASE[entry.item.id]?.passive;
    if (passive?.trigger !== 'always') continue;
    for (const modifier of passive.modifiers) {
      addBonus(modifier.stat, modifier.type, modifier.value);
    }
    bonuses.effects.push({
      type: `item:${passive.trigger}`,
      description: passive.description,
      value: passive.flatValue,
    });
  }

  for (const [stat, value] of Object.entries(calculateEventStatBonuses(member.statBoosts))) {
    if (value) addBonus(stat, 'flat', value);
  }
  instance.setEnhancementBonuses(bonuses);
}

/** Canonical player-team builder shared by CombatPage and the authority replay. */
export function buildRunPlayerTeam(
  team: readonly RunCombatMember[],
  rules: RunCombatantRules,
): ChampionInstance[] {
  const instances: ChampionInstance[] = [];
  const augmentManager = createRunAugmentManager(rules.augmentIds, rules.currentBiomeIndex);

  for (const member of team) {
    const champion = championDB.getById(member.championId);
    if (!champion) continue;
    const instance = new ChampionInstance(champion, member.level ?? 1, member.statMultiplier ?? 1);
    instance.setMasteryLevel(rules.getMasteryLevel(member.championId));
    for (const slot of SPELL_SLOTS) instance.setSpellRank(slot, member.spellRanks?.[slot] ?? 1);
    applyRunBonuses(instance, member, rules, augmentManager);
    instances.push(instance);
  }
  return instances;
}

export function calculateRunMemberMaxHp(
  member: RunCombatMember,
  inventory: readonly InventoryEntry[],
  getUnlockedEnhancements: (championId: string) => Record<string, number>,
  getMasteryLevel: (championId: string) => number,
): number {
  const champion = championDB.getById(member.championId);
  if (!champion) return 100;
  const bonuses = enhancementService.calculateStatBonuses(
    enhancementTreeProvider.getTreeForChampion(champion),
    getUnlockedEnhancements(member.championId),
  );
  return calculateMaxHP(
    champion,
    member.level ?? 1,
    bonuses,
    [...inventory],
    member.championId,
    member.statBoosts,
    member.statMultiplier,
    getMasteryLevel(member.championId),
  );
}

export function calculateRunMemberMaxMp(
  member: RunCombatMember,
  inventory: readonly InventoryEntry[],
  getUnlockedEnhancements: (championId: string) => Record<string, number>,
  getMasteryLevel: (championId: string) => number,
): number {
  const champion = championDB.getById(member.championId);
  if (!champion) return 0;
  const bonuses = enhancementService.calculateStatBonuses(
    enhancementTreeProvider.getTreeForChampion(champion),
    getUnlockedEnhancements(member.championId),
  );
  return Math.max(
    0,
    Math.round(
      calculateFullStats(
        champion,
        member.level ?? 1,
        bonuses,
        [...inventory],
        member.championId,
        getMasteryLevel(member.championId),
        member.statBoosts,
        member.statMultiplier,
      ).mp,
    ),
  );
}
