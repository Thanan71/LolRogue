import { type Passive, type Spell, type SpellEffect, TargetingType } from '@/types/champion';

export const IMPLEMENTED_PASSIVE_CHAMPIONS = new Set([
  'Annie',
  'Ashe',
  'Darius',
  'Garen',
  'Jinx',
  'Leona',
  'Lux',
  'Malphite',
  'Soraka',
  'Warwick',
]);

const SUPPORTED_EFFECT_TYPES = new Set([
  'damage',
  'heal',
  'shield',
  'execute',
  'cc',
  'buff',
  'debuff',
  'dot',
  'hot',
  'revive',
]);

const HOSTILE_EFFECT_TYPES = new Set(['damage', 'dot', 'cc', 'debuff', 'execute']);
const HOSTILE_TARGETING_TYPES = new Set([
  TargetingType.Enemy,
  TargetingType.Enemies,
  TargetingType.Area,
]);

function rankValue(values: readonly number[] | undefined, rankIndex: number): number | undefined {
  if (!values || values.length === 0) return undefined;
  return values[rankIndex] ?? values[values.length - 1];
}

export function isSpellEffectConfigured(effect: SpellEffect, rankIndex: number): boolean {
  if (!SUPPORTED_EFFECT_TYPES.has(effect.type)) return false;
  switch (effect.type) {
    case 'damage':
      return (
        Number.isFinite(rankValue(effect.baseDamage, rankIndex)) ||
        (effect.adRatio ?? 0) !== 0 ||
        (effect.apRatio ?? 0) !== 0
      );
    case 'dot':
      return (
        (effect.duration ?? 0) > 0 &&
        (Number.isFinite(rankValue(effect.baseDamage, rankIndex)) ||
          (effect.adRatio ?? 0) !== 0 ||
          (effect.apRatio ?? 0) !== 0)
      );
    case 'heal':
    case 'shield':
      return Number.isFinite(rankValue(effect.baseValue, rankIndex)) || (effect.apRatio ?? 0) !== 0;
    case 'hot':
      return (
        (effect.duration ?? 0) > 0 &&
        (Number.isFinite(rankValue(effect.baseValue, rankIndex)) || (effect.apRatio ?? 0) !== 0)
      );
    case 'cc':
      return typeof effect.ccType === 'string' && effect.ccType.length > 0;
    case 'buff':
    case 'debuff':
      return (
        typeof effect.stat === 'string' &&
        Number.isFinite(rankValue(effect.values, rankIndex)) &&
        rankValue(effect.values, rankIndex) !== 0
      );
    case 'execute':
      return Number.isFinite(effect.threshold) && (effect.threshold ?? 0) > 0;
    case 'revive':
      return Number.isFinite(effect.revivePercent) && (effect.revivePercent ?? 0) > 0;
    default:
      return false;
  }
}

/**
 * Composite spells may target enemies while their positive effects fall back to
 * the caster. The inverse is not safe: a self/allied target cannot resolve a
 * hostile effect and would silently discard it at runtime.
 */
export function getSpellTargetingIssues(spell: Spell): string[] {
  const hostileEffectTypes = [
    ...new Set(
      spell.effects
        .filter((effect) => HOSTILE_EFFECT_TYPES.has(effect.type))
        .map(({ type }) => type),
    ),
  ].sort();
  if (hostileEffectTypes.length === 0 || HOSTILE_TARGETING_TYPES.has(spell.targeting)) return [];
  return [
    `hostile effects (${hostileEffectTypes.join(', ')}) require enemy, enemies or area targeting; received ${spell.targeting}`,
  ];
}

export function isSpellCombatReady(spell: Spell, rank = 1): boolean {
  const rankIndex = Math.max(0, rank - 1);
  return (
    spell.effects.length > 0 &&
    getSpellTargetingIssues(spell).length === 0 &&
    spell.effects.every((effect) => isSpellEffectConfigured(effect, rankIndex))
  );
}

export function isPassiveCombatReady(championId: string, passive: Passive): boolean {
  return (
    IMPLEMENTED_PASSIVE_CHAMPIONS.has(championId) &&
    passive.effects.length > 0 &&
    passive.effects.every((effect) => isSpellEffectConfigured(effect, 0))
  );
}

export const UNAVAILABLE_COMBAT_DESCRIPTION =
  'Effet temporairement indisponible en combat : données ou règle incomplètes.';
