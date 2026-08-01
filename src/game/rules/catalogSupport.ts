import type { EnhancementEffect, EnhancementNode } from '@/types/enhancementTree';
import { AugmentEffectType, RuneConditionType } from '@/types/inventory';

export const SUPPORTED_ENHANCEMENT_EFFECTS = new Set([
  'execute_damage',
  'burst_amplify',
  'survival_shield',
  'revive',
  'ally_damage_reduction',
  'thornmail',
  'burn_reflect',
  'vengeance_burst',
  'slow',
  'root_chance',
  'mana_restore',
  'cdr_ultimate',
  'attack_speed_on_kill',
  'bleed',
  'dodge',
  'berserker',
  'champion_damage',
  'duelist',
  'heal_on_kill',
  'heal_amp',
  'shield_amp',
  'damage_aura',
  'cc_extension',
]);

export const UNAVAILABLE_ENHANCEMENT_EFFECTS = new Set([
  'out_of_combat_speed',
  'ambush_damage',
  'stealth_on_kill',
  'heal_share',
  'damage_intercept',
  'spell_echo',
  'pierce',
  'long_range_damage',
  'riposte',
  'smoke_screen',
  'damage_sacrifice',
  'bush_vision',
  'aoe_slow',
  'cc_aoe',
]);

export const OFFICIALLY_SUPPORTED_RULE_TRIGGERS = {
  runes: Object.values(RuneConditionType),
  items: [
    'always',
    'on_hit',
    'on_damage_taken',
    'on_kill',
    'on_ability_cast',
    'turn_start',
    'below_hp_threshold',
    'combat_start',
  ],
  augments: Object.values(AugmentEffectType),
  enhancements: [...SUPPORTED_ENHANCEMENT_EFFECTS],
} as const;

export function getUnavailableEnhancementEffects(
  effects: readonly EnhancementEffect[] | undefined,
): EnhancementEffect[] {
  return (effects ?? []).filter((effect) => UNAVAILABLE_ENHANCEMENT_EFFECTS.has(effect.type));
}

export function getEnhancementNodeUnavailableReasons(node: EnhancementNode): string[] {
  const reasons = getUnavailableEnhancementEffects(node.effects).map(
    (effect) => effect.description,
  );
  if (node.statBonuses?.attackRange || node.percentBonuses?.attackRange) {
    reasons.push('La portée spatiale n’est pas représentée dans ce mode de combat');
  }
  return reasons;
}
