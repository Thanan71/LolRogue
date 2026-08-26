import { championDB } from '@/data';
import { localizeUserCopy } from '@/i18n/content';
import { UNAVAILABLE_ENHANCEMENT_EFFECTS } from '@/game/rules/catalogSupport';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useRunStore } from '@/stores/runStore';

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
      const statNames: Record<string, string> = {
        hp: 'PV',
        mp: 'PM',
        atk: 'AD',
        ap: 'AP',
        def: 'Armure',
        mr: 'RM',
        spd: 'Vitesse',
        crit: 'Critique',
        attackSpeed: 'Vitesse ATQ',
        hpRegen: 'Regen PV',
        mpRegen: 'Regen PM',
        armorPen: 'Pen. Armure',
        magicPen: 'Pen. Magique',
        lifesteal: 'Vol de vie',
        omnivamp: 'Omnivamp',
        tenacity: 'Ténacité',
        abilityHaste: 'Hâte',
        attackRange: 'Portée',
      };
      const name = statNames[stat] || stat;
      descriptions.push(
        stat === 'attackRange' ? `+${value} ${name} (indisponible)` : `+${value} ${name}`,
      );
    }
  }

  // Add percentage bonuses
  for (const [stat, percent] of Object.entries(bonuses.percent)) {
    if (percent > 0) {
      const statNames: Record<string, string> = {
        hp: 'PV',
        mp: 'PM',
        atk: 'AD',
        ap: 'AP',
        def: 'Armure',
        mr: 'RM',
        spd: 'Vitesse',
        crit: 'Critique',
        attackSpeed: 'Vitesse ATQ',
        hpRegen: 'Regen PV',
        mpRegen: 'Regen PM',
        armorPen: 'Pen. Armure',
        magicPen: 'Pen. Magique',
        lifesteal: 'Vol de vie',
        omnivamp: 'Omnivamp',
        tenacity: 'Ténacité',
        abilityHaste: 'Hâte',
        attackRange: 'Portée',
      };
      const name = statNames[stat] || stat;
      descriptions.push(
        stat === 'attackRange'
          ? `+${Math.round(percent * 100)}% ${name} (indisponible)`
          : `+${Math.round(percent * 100)}% ${name}`,
      );
    }
  }

  // Add effect descriptions
  for (const effect of bonuses.effects) {
    if (effect.description) {
      descriptions.push(
        UNAVAILABLE_ENHANCEMENT_EFFECTS.has(effect.type)
          ? `${localizeUserCopy(effect.description)} (indisponible)`
          : localizeUserCopy(effect.description),
      );
    }
  }

  return descriptions;
}
