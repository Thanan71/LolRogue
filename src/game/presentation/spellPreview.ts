import { combatCopy } from '@/i18n/combatContent';
import { formatNumber } from '@/i18n/format';
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
  amountStyle?: 'number' | 'percent';
  suffix?: string;
}

const DAMAGE_LABELS = combatCopy.preview.damage;
const CONTROL_LABELS: Readonly<Record<string, string>> = combatCopy.preview.control;
const UTILITY_LABELS: Readonly<Record<string, string>> = combatCopy.preview.utility;
const STAT_LABELS: Readonly<Record<string, string>> = combatCopy.preview.stats;

export function formatSpellImpactAmount(impact: SpellImpactPreview): string {
  if (impact.amount === undefined) return '';
  return impact.amountStyle === 'percent'
    ? formatNumber(impact.amount / 100, { style: 'percent', maximumFractionDigits: 10 })
    : formatNumber(impact.amount, { maximumFractionDigits: 10 });
}

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
      label:
        effect.type === 'dot'
          ? combatCopy.preview.damageOverTime(DAMAGE_LABELS[tone])
          : DAMAGE_LABELS[tone],
      tone,
      amount: estimateDamage(effect, stats, rankIndex),
      suffix: combatCopy.preview.beforeDefenses,
    };
  }
  if (effect.type === 'heal' || effect.type === 'hot') {
    return {
      id,
      label: effect.type === 'hot' ? combatCopy.preview.healOverTime : combatCopy.preview.heal,
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
      label: combatCopy.preview.shield,
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
      label: CONTROL_LABELS[effect.ccType ?? ''] ?? combatCopy.preview.genericControl,
      tone: 'control',
      suffix: duration ? `${formatNumber(duration, { maximumFractionDigits: 10 })} s` : undefined,
    };
  }
  if (effect.type === 'execute') {
    return {
      id,
      label: UTILITY_LABELS.execute,
      tone: 'utility',
      amount: Math.round(percentValue(effect.threshold)),
      amountStyle: 'percent',
      suffix: combatCopy.preview.maxHealth,
    };
  }
  if (effect.type === 'revive') {
    return {
      id,
      label: UTILITY_LABELS.revive,
      tone: 'utility',
      amount: Math.round(percentValue(effect.revivePercent)),
      amountStyle: 'percent',
      suffix: combatCopy.preview.maxHealth,
    };
  }
  if (effect.type === 'buff' || effect.type === 'debuff') {
    const value = rankValue(effect.values, rankIndex);
    return {
      id,
      label: UTILITY_LABELS[effect.type],
      tone: 'utility',
      amount: effect.modifierType === 'percent' ? Math.round(percentValue(value)) : value,
      amountStyle: effect.modifierType === 'percent' ? 'percent' : 'number',
      suffix: effect.stat
        ? (STAT_LABELS[effect.stat] ?? combatCopy.preview.unknownStat)
        : undefined,
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
