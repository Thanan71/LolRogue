import { championDB } from '@/data';
import { UNAVAILABLE_ENHANCEMENT_EFFECTS } from '@/game/rules/catalogSupport';
import { combatCopy, combatEnhancementEffectId } from '@/i18n/combatContent';
import { formatNumber } from '@/i18n/format';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useRunStore } from '@/stores/runStore';

export function formatCombatFlatBonus(value: number, name: string): string {
  return `+${formatNumber(value)} ${name}`;
}

export function formatCombatPercentageBonus(percent: number, name: string): string {
  return `+${formatNumber(percent, { style: 'percent', maximumFractionDigits: 0 })} ${name}`;
}

export function getEnhancementDescriptions(championId: string): string[] {
  const runState = useRunStore.getState();
  const unlockedNodes = runState.authorityAttempt
    ? (runState.authorityAttempt.enhancementSnapshot[championId] ??
      runState.authorityAttempt.enhancementSnapshot[championId.toLowerCase()] ??
      {})
    : useEnhancementStore.getState().getEnhancementState(championId).unlockedNodes;

  if (Object.keys(unlockedNodes).length === 0) return [];

  const champ = championDB.getById(championId);
  if (!champ) return [];

  const tree = enhancementTreeProvider.getTreeForChampion(champ);
  const bonuses = enhancementService.calculateStatBonuses(tree, unlockedNodes);

  const descriptions: string[] = [];

  // Add flat stat bonuses
  for (const [stat, value] of Object.entries(bonuses.flat)) {
    if (value > 0) {
      const name =
        combatCopy.presenter.stats[stat as keyof typeof combatCopy.presenter.stats] || stat;
      const description = formatCombatFlatBonus(value, name);
      descriptions.push(
        stat === 'attackRange' ? combatCopy.presenter.unavailable(description) : description,
      );
    }
  }

  // Add percentage bonuses
  for (const [stat, percent] of Object.entries(bonuses.percent)) {
    if (percent > 0) {
      const name =
        combatCopy.presenter.stats[stat as keyof typeof combatCopy.presenter.stats] || stat;
      const description = formatCombatPercentageBonus(percent, name);
      descriptions.push(
        stat === 'attackRange' ? combatCopy.presenter.unavailable(description) : description,
      );
    }
  }

  // Add effect descriptions
  const nodes = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
  for (const node of nodes) {
    const rank = unlockedNodes[node.id] || 0;
    if (rank === 0) continue;

    for (const effect of node.effects ?? []) {
      const effectId = combatEnhancementEffectId(node.id, effect.type);
      const localizedDescription = effectId ? combatCopy.presenter.effects[effectId] : effect.type;
      const maxRanks = node.maxRanks || 1;
      const rankedDescription =
        maxRanks > 1 && rank < maxRanks
          ? combatCopy.presenter.ranked(localizedDescription, rank, maxRanks)
          : localizedDescription;
      descriptions.push(
        UNAVAILABLE_ENHANCEMENT_EFFECTS.has(effect.type)
          ? combatCopy.presenter.unavailable(rankedDescription)
          : rankedDescription,
      );
    }
  }

  return descriptions;
}
