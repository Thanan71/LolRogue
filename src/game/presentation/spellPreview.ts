import type { Spell, SpellEffect } from '@/types/champion';
import type { CalculatedStats } from '@/utils/champion';

export type SpellImpactTone =
  | 'physical'
  | 'magical'
  | 'true'
  | 'heal'
  | 'shield'
  | 'control'
  | 'utility';

export interface SpellImpactPreview {
  id: string;
  label: string;
  tone: SpellImpactTone;
  amount?: number;
  suffix?: string;
}

const DAMAGE_LABELS: Record<'physical' | 'magical' | 'true', string> = {
  physical: 'Dégâts physiques',
  magical: 'Dégâts magiques',
  true: 'Dégâts bruts',
};

const CONTROL_LABELS: Record<string, string> = {
  charm: 'Charme',
  fear: 'Peur',
  knockup: 'Projection',
  root: 'Immobilisation',
  silence: 'Silence',
  slow: 'Ralentissement',
  snare: 'Immobilisation',
  stun: 'Étourdissement',
};

const UTILITY_LABELS: Record<string, string> = {
  buff: 'Bonus temporaire',
  debuff: 'Affaiblissement',
  execute: "Seuil d'exécution",
  revive: 'Réanimation',
};

function rankValue(values: number[] | undefined, rankIndex: number): number {
  if (!values || values.length === 0) return 0;
  return values[rankIndex] ?? values[values.length - 1] ?? 0;
}

function damageTone(value: string | undefined): 'physical' | 'magical' | 'true' {
  if (value === 'magical' || value === 'ap') return 'magical';
  if (value === 'true') return 'true';
  return 'physical';
}

function percentValue(value: number | undefined): number {
  if (!value) return 0;
  return Math.abs(value) <= 1 ? value * 100 : value;
}

function estimateDamage(
  effect: SpellEffect,
  stats: Pick<CalculatedStats, 'attackDamage' | 'abilityPower'>,
  rankIndex: number,
): number {
  return Math.max(
    0,
    Math.round(
      rankValue(effect.baseDamage, rankIndex) +
        stats.attackDamage * (effect.adRatio ?? 0) +
        stats.abilityPower * (effect.apRatio ?? 0),
    ),
  );
}

function effectPreview(
  spell: Spell,
  effect: SpellEffect,
  effectIndex: number,
  stats: Pick<CalculatedStats, 'attackDamage' | 'abilityPower'>,
  rankIndex: number,
): SpellImpactPreview | null {
  const id = `${spell.id}-${effect.type}-${effectIndex}`;
  if (effect.type === 'damage' || effect.type === 'dot') {
    const tone = damageTone(effect.damageType);
    return {
      id,
      label: effect.type === 'dot' ? `${DAMAGE_LABELS[tone]} sur la durée` : DAMAGE_LABELS[tone],
      tone,
      amount: estimateDamage(effect, stats, rankIndex),
      suffix: 'avant défenses',
    };
  }
  if (effect.type === 'heal' || effect.type === 'hot') {
    return {
      id,
      label: effect.type === 'hot' ? 'Soin sur la durée' : 'Soin',
      tone: 'heal',
      amount: Math.max(
        0,
        Math.round(
          rankValue(effect.baseValue, rankIndex) + stats.abilityPower * (effect.apRatio ?? 0),
        ),
      ),
    };
  }
  if (effect.type === 'shield') {
    return {
      id,
      label: 'Bouclier',
      tone: 'shield',
      amount: Math.max(
        0,
        Math.round(
          rankValue(effect.baseValue, rankIndex) + stats.abilityPower * (effect.apRatio ?? 0),
        ),
      ),
    };
  }
  if (effect.type === 'cc') {
    const duration = effect.ccDuration;
    return {
      id,
      label: CONTROL_LABELS[effect.ccType ?? ''] ?? 'Contrôle',
      tone: 'control',
      suffix: duration ? `${duration} s` : undefined,
    };
  }
  if (effect.type === 'execute') {
    return {
      id,
      label: UTILITY_LABELS.execute,
      tone: 'utility',
      amount: Math.round(percentValue(effect.threshold)),
      suffix: 'des PV max',
    };
  }
  if (effect.type === 'revive') {
    return {
      id,
      label: UTILITY_LABELS.revive,
      tone: 'utility',
      amount: Math.round(percentValue(effect.revivePercent)),
      suffix: 'des PV max',
    };
  }
  if (effect.type === 'buff' || effect.type === 'debuff') {
    const value = rankValue(effect.values, rankIndex);
    return {
      id,
      label: UTILITY_LABELS[effect.type],
      tone: 'utility',
      amount: effect.modifierType === 'percent' ? Math.round(percentValue(value)) : value,
      suffix: effect.modifierType === 'percent' ? '%' : effect.stat,
    };
  }
  return null;
}

/**
 * Builds a target-independent preview from the same base values and AD/AP ratios
 * used by the battle engine. Damage is intentionally shown before Armor/MR,
 * because no target has been chosen on the run map.
 */
export function buildSpellImpactPreview(
  spell: Spell,
  rank: number,
  stats: Pick<CalculatedStats, 'attackDamage' | 'abilityPower'>,
): SpellImpactPreview[] {
  const rankIndex = Math.max(0, Math.min(spell.maxRank - 1, rank - 1));
  return spell.effects.flatMap((effect, index) => {
    const preview = effectPreview(spell, effect, index, stats, rankIndex);
    return preview ? [preview] : [];
  });
}
