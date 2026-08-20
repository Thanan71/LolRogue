import { implementedChampions } from '@/data/champion';
import { ENHANCEMENT_TREES_BY_ROLE } from '@/data/enhancementTrees';
import { AUGMENT_DATABASE, ITEM_DATABASE, RUNE_DATABASE } from '@/data/items';
import { getSpellTargetingIssues } from '@/game/battle/combatContentSupport';
import { AugmentEffectType, RuneConditionType } from '@/types/inventory';
import { SUPPORTED_ENHANCEMENT_EFFECTS, UNAVAILABLE_ENHANCEMENT_EFFECTS } from './catalogSupport';

const SUPPORTED_ITEM_PASSIVES = new Set([
  'ie_passive',
  'rabadons_passive',
  'sunfire_passive',
  'ga_passive',
  'bt_passive',
  'sv_passive',
  'hp_pot_passive',
  'elixir_wrath_passive',
]);

const SUPPORTED_AUGMENT_EFFECTS = new Set([
  AugmentEffectType.TeamStatFlat,
  AugmentEffectType.TeamStatPercent,
  AugmentEffectType.ScalingStatFlat,
  AugmentEffectType.DamagePercent,
  AugmentEffectType.DamageReduction,
  AugmentEffectType.BonusGold,
  AugmentEffectType.HealAfterBattle,
  AugmentEffectType.ExtraRevive,
  AugmentEffectType.ShopDiscount,
]);

export function validateRuleCatalogs(): string[] {
  const issues: string[] = [];
  for (const champion of implementedChampions) {
    for (const spell of champion.spells) {
      for (const issue of getSpellTargetingIssues(spell)) {
        issues.push(`champion:${champion.id}:spell:${spell.id}: ${issue}`);
      }
    }
  }
  for (const item of Object.values(ITEM_DATABASE)) {
    if (item.passive && !SUPPORTED_ITEM_PASSIVES.has(item.passive.id)) {
      issues.push(`item:${item.id}: passive "${item.passive.id}" has no handler`);
    }
    if ((item.unique ?? !item.stackable) && item.maxStacks !== 1) {
      issues.push(`item:${item.id}: unique items must have maxStacks=1`);
    }
  }
  for (const rune of Object.values(RUNE_DATABASE)) {
    if (!Object.values(RuneConditionType).includes(rune.condition.type)) {
      issues.push(`rune:${rune.id}: condition "${rune.condition.type}" has no handler`);
    }
  }
  for (const augment of Object.values(AUGMENT_DATABASE)) {
    for (const effect of augment.effects) {
      if (!SUPPORTED_AUGMENT_EFFECTS.has(effect.type)) {
        issues.push(`augment:${augment.id}: effect "${effect.type}" has no handler`);
      }
    }
  }
  for (const [role, tree] of Object.entries(ENHANCEMENT_TREES_BY_ROLE)) {
    for (const node of [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)]) {
      for (const effect of node.effects ?? []) {
        if (
          !SUPPORTED_ENHANCEMENT_EFFECTS.has(effect.type) &&
          !UNAVAILABLE_ENHANCEMENT_EFFECTS.has(effect.type)
        ) {
          issues.push(`enhancement:${role}:${node.id}: effect "${effect.type}" is not classified`);
        }
      }
    }
  }
  return issues;
}

export function assertValidRuleCatalogs(): void {
  const issues = validateRuleCatalogs();
  if (issues.length > 0) throw new Error(`Invalid rule catalog:\n${issues.join('\n')}`);
}
