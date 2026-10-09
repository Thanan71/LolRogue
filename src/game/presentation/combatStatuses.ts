import { CCEffect } from '@/game/effects/CCEffect';
import type { EffectManager } from '@/game/effects/EffectManager';
import { ShieldEffect } from '@/game/effects/ShieldEffect';
import { CCType, EffectCategory } from '@/game/effects/types';
import type { CombatantInfo, CombatStatusInfo } from '@/stores/battleStore';

const CATEGORY_KIND = {
  [EffectCategory.Buff]: 'buff',
  [EffectCategory.Debuff]: 'debuff',
  [EffectCategory.Damage]: 'dot',
  [EffectCategory.Heal]: 'hot',
  [EffectCategory.Revive]: 'revive',
} as const;

/** Read exact remaining owner turns and shield HP; never infer CC from combat logs. */
export function snapshotCombatStatuses(manager: EffectManager): CombatStatusInfo[] {
  return manager.effects.flatMap<CombatStatusInfo>((effect) => {
    if (effect.expired || effect.isInstant || effect.remainingRounds <= 0) return [];
    const base = { id: effect.id, turnsRemaining: effect.remainingRounds };
    if (effect instanceof CCEffect) return [{ ...base, kind: effect.ccType }];
    if (effect instanceof ShieldEffect) {
      return effect.isActive()
        ? [{ ...base, kind: 'shield' as const, amount: effect.remainingShield }]
        : [];
    }
    const kind = CATEGORY_KIND[effect.category as keyof typeof CATEGORY_KIND];
    if (!kind) return [];
    const stacks =
      'stacks' in effect.data && typeof effect.data.stacks === 'number'
        ? effect.data.stacks
        : undefined;
    return [{ ...base, kind, stacks }];
  });
}

export const COMBAT_STATUS_ICONS: Record<
  CombatStatusInfo['kind'] | 'defeated' | 'lowHealth',
  string
> = {
  [CCType.Stun]: '✦',
  [CCType.Snare]: '⌁',
  [CCType.Silence]: '⊘',
  [CCType.Slow]: '◷',
  [CCType.Knockup]: '↥',
  [CCType.Fear]: '!',
  [CCType.Charm]: '♥',
  shield: '◈',
  buff: '↑',
  debuff: '↓',
  dot: '◆',
  hot: '+',
  revive: '↻',
  defeated: '×',
  lowHealth: '!',
};

export function combatantConditions(combatant: CombatantInfo) {
  const statuses = combatant.isDefeated ? [] : (combatant.statuses ?? []);
  return {
    statuses,
    incapacitated: statuses.some((status) =>
      [CCType.Stun, CCType.Knockup, CCType.Fear, CCType.Charm].includes(status.kind as CCType),
    ),
    silenced: statuses.some((status) => status.kind === CCType.Silence),
    shielded: statuses.some((status) => status.kind === 'shield' && (status.amount ?? 0) > 0),
    lowHealth:
      !combatant.isDefeated && combatant.maxHp > 0 && combatant.currentHp / combatant.maxHp <= 0.25,
  };
}
