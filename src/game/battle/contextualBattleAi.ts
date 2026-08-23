import { normalizeThreshold } from '@/game/effects/effectUnits';
import { type Spell, type SpellEffect, TargetingType } from '@/types/champion';
import { actionToSpellSlot } from './actionSlots';
import {
  ActionType,
  type BattleAction,
  type BattleActionOption,
  type CombatantState,
} from './types';

export const SUPPORT_ACTION_HP_RATIO = 0.7;

const ACTION_ORDER = [
  ActionType.SpellQ,
  ActionType.SpellW,
  ActionType.SpellE,
  ActionType.SpellR,
  ActionType.BasicAttack,
] as const;

function hpRatio(combatant: CombatantState): number {
  return combatant.maxHp <= 0 ? 0 : combatant.currentHp / combatant.maxHp;
}

function effectiveHealthRatio(combatant: CombatantState): number {
  return combatant.maxHp <= 0
    ? 0
    : (combatant.currentHp + combatant.currentShield) / combatant.maxHp;
}

function compareWeakestAlly(left: CombatantState, right: CombatantState): number {
  return hpRatio(left) - hpRatio(right) || left.targetId.localeCompare(right.targetId);
}

function compareEffectiveEnemy(left: CombatantState, right: CombatantState): number {
  return (
    effectiveHealthRatio(left) - effectiveHealthRatio(right) ||
    left.currentHp + left.currentShield - (right.currentHp + right.currentShield) ||
    left.targetId.localeCompare(right.targetId)
  );
}

function hasEffect(spell: Spell, types: ReadonlySet<string>): boolean {
  return spell.effects.some((effect) => types.has(effect.type));
}

const SUPPORT_EFFECTS = new Set(['heal', 'hot', 'shield']);
const OFFENSIVE_EFFECTS = new Set(['damage', 'dot', 'cc', 'debuff', 'execute']);

function executeThreshold(effect: SpellEffect): number | null {
  return effect.type === 'execute' ? normalizeThreshold(effect.threshold, 0) : null;
}

function executableTargets(spell: Spell, enemies: readonly CombatantState[]): CombatantState[] {
  const thresholds = spell.effects
    .map(executeThreshold)
    .filter((threshold): threshold is number => threshold !== null && threshold > 0);
  if (thresholds.length === 0) return [];
  const threshold = Math.max(...thresholds);
  return enemies.filter((enemy) => hpRatio(enemy) <= threshold);
}

interface Candidate {
  readonly action: BattleAction;
  readonly score: number;
  readonly cost: number;
  readonly order: number;
}

function createSpellCandidate(input: {
  readonly attacker: CombatantState;
  readonly option: BattleActionOption;
  readonly spell: Spell;
  readonly allies: readonly CombatantState[];
  readonly enemies: readonly CombatantState[];
}): Candidate | null {
  const { attacker, option, spell, allies, enemies } = input;
  const validTargetIds = new Set(option.validTargetIds);
  const livingEnemies = enemies.filter((enemy) => !enemy.isDefeated);
  const livingAllies = allies.filter((ally) => !ally.isDefeated);
  const selectableEnemies = livingEnemies.filter((enemy) => validTargetIds.has(enemy.targetId));
  const selectableAllies = livingAllies.filter((ally) => validTargetIds.has(ally.targetId));
  const isArea =
    option.targeting === TargetingType.Area || option.targeting === TargetingType.Enemies;
  if (isArea && selectableEnemies.length < 2) return null;

  const hasExecute = spell.effects.some((effect) => effect.type === 'execute');
  const executeTargets = executableTargets(spell, selectableEnemies).sort(compareEffectiveEnemy);
  if (hasExecute && executeTargets.length === 0) return null;
  const supports = hasEffect(spell, SUPPORT_EFFECTS);
  const offensive = hasEffect(spell, OFFENSIVE_EFFECTS);
  const isPureSupport = supports && !offensive;
  let targetId: string | undefined;
  let score = 0;

  if (isPureSupport) {
    const weakAllies = selectableAllies
      .filter((ally) => hpRatio(ally) < SUPPORT_ACTION_HP_RATIO)
      .sort(compareWeakestAlly);
    if (option.targeting === TargetingType.Self) {
      if (hpRatio(attacker) >= SUPPORT_ACTION_HP_RATIO) return null;
    } else if (option.targeting === TargetingType.Ally) {
      const target = weakAllies[0];
      if (!target) return null;
      targetId = target.targetId;
    } else if (option.targeting === TargetingType.Allies) {
      if (weakAllies.length === 0) return null;
    } else {
      return null;
    }
    score = 400;
  } else if (offensive) {
    const target = executeTargets[0] ?? [...selectableEnemies].sort(compareEffectiveEnemy)[0];
    if (!target) return null;
    if (option.requiresTarget) targetId = target.targetId;
    score = executeTargets.length > 0 ? 500 : isArea ? 300 : 200;
  } else if (spell.effects.some((effect) => effect.type === 'buff')) {
    score = 150;
    if (option.targeting === TargetingType.Ally) {
      targetId = [...livingAllies].sort(compareWeakestAlly)[0]?.targetId;
      if (!targetId) return null;
    }
  } else {
    return null;
  }

  return {
    action: { type: option.type, ...(targetId ? { targetId } : {}) },
    score,
    cost: option.cost,
    order: ACTION_ORDER.indexOf(option.type as (typeof ACTION_ORDER)[number]),
  };
}

/** Deterministic policy used by both autoplay and authority combat replay. */
export function selectContextualBattleAction(input: {
  readonly attacker: CombatantState;
  readonly options: readonly BattleActionOption[];
  readonly allies: readonly CombatantState[];
  readonly enemies: readonly CombatantState[];
}): BattleAction | null {
  const candidates: Candidate[] = [];
  for (const option of input.options) {
    if (option.type === ActionType.BasicAttack) {
      const target = [...input.enemies]
        .filter((enemy) => !enemy.isDefeated && option.validTargetIds.includes(enemy.targetId))
        .sort(compareEffectiveEnemy)[0];
      if (target) {
        candidates.push({
          action: { type: ActionType.BasicAttack, targetId: target.targetId },
          score: 100,
          cost: 0,
          order: ACTION_ORDER.indexOf(ActionType.BasicAttack),
        });
      }
      continue;
    }
    const slot = actionToSpellSlot(option.type);
    const spell = slot ? input.attacker.champion.getSpell(slot) : undefined;
    if (!spell) continue;
    const candidate = createSpellCandidate({ ...input, option, spell });
    if (candidate) candidates.push(candidate);
  }
  return (
    candidates.sort(
      (left, right) =>
        right.score - left.score || left.cost - right.cost || left.order - right.order,
    )[0]?.action ?? null
  );
}
