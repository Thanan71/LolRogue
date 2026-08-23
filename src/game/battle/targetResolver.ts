import { TargetingType } from '@/types/champion';
import type { ActionTargeting, TeamSide } from './types';

export interface TargetableCombatant {
  id: string;
  side: TeamSide;
  isDefeated: boolean;
}

export interface BattleTargetResolution<T extends TargetableCombatant> {
  ok: boolean;
  requiresTarget: boolean;
  legalTargets: T[];
  targets: T[];
  error?: 'invalid_actor' | 'invalid_target' | 'missing_target' | 'no_target';
}

export function isActionTargeting(value: unknown): value is ActionTargeting {
  return (
    value === TargetingType.Self ||
    value === TargetingType.Ally ||
    value === TargetingType.Allies ||
    value === TargetingType.Enemy ||
    value === TargetingType.Enemies ||
    value === TargetingType.Area
  );
}

export function actionRequiresTarget(targeting: ActionTargeting): boolean {
  return (
    targeting === TargetingType.Ally ||
    targeting === TargetingType.Enemy ||
    targeting === TargetingType.Area
  );
}

/**
 * The one targeting matrix used by command validation and target presentation.
 *
 * Ally intentionally includes the actor: abilities described as "self or ally"
 * are represented by the ally targeting type in the champion data.
 * Area has no positional radius in the battle model, but it still requires a
 * primary enemy. The selected enemy is returned first, followed by the living
 * secondary enemies in stable formation order so damage falloff is deterministic.
 */
export function resolveBattleTargets<T extends TargetableCombatant>(
  combatants: readonly T[],
  actorId: string,
  actorSide: TeamSide,
  targeting: ActionTargeting,
  requestedTargetId?: string | 'all',
  options: { includeDefeated?: boolean } = {},
): BattleTargetResolution<T> {
  const actor = combatants.find(
    (candidate) =>
      candidate.id === actorId && candidate.side === actorSide && !candidate.isDefeated,
  );
  const requiresTarget = actionRequiresTarget(targeting);
  if (!actor) {
    return { ok: false, requiresTarget, legalTargets: [], targets: [], error: 'invalid_actor' };
  }

  const targetPool = options.includeDefeated
    ? [...combatants]
    : combatants.filter((candidate) => !candidate.isDefeated);
  let legalTargets: T[];
  switch (targeting) {
    case TargetingType.Self:
      legalTargets = [actor];
      break;
    case TargetingType.Ally:
    case TargetingType.Allies:
      legalTargets = targetPool.filter((candidate) => candidate.side === actorSide);
      break;
    case TargetingType.Enemy:
    case TargetingType.Enemies:
    case TargetingType.Area:
      legalTargets = targetPool.filter((candidate) => candidate.side !== actorSide);
      break;
  }

  if (legalTargets.length === 0) {
    return { ok: false, requiresTarget, legalTargets, targets: [], error: 'no_target' };
  }

  if (targeting === TargetingType.Area) {
    if (!requestedTargetId || requestedTargetId === 'all') {
      return { ok: false, requiresTarget, legalTargets, targets: [], error: 'missing_target' };
    }
    const primary = legalTargets.find((candidate) => candidate.id === requestedTargetId);
    return primary
      ? {
          ok: true,
          requiresTarget,
          legalTargets,
          targets: [primary, ...legalTargets.filter((candidate) => candidate !== primary)],
        }
      : { ok: false, requiresTarget, legalTargets, targets: [], error: 'invalid_target' };
  }

  if (requiresTarget) {
    if (!requestedTargetId || requestedTargetId === 'all') {
      return { ok: false, requiresTarget, legalTargets, targets: [], error: 'missing_target' };
    }
    const target = legalTargets.find((candidate) => candidate.id === requestedTargetId);
    return target
      ? { ok: true, requiresTarget, legalTargets, targets: [target] }
      : { ok: false, requiresTarget, legalTargets, targets: [], error: 'invalid_target' };
  }

  if (targeting === TargetingType.Self) {
    const validRequest = requestedTargetId === undefined || requestedTargetId === actor.id;
    return validRequest
      ? { ok: true, requiresTarget, legalTargets, targets: [actor] }
      : { ok: false, requiresTarget, legalTargets, targets: [], error: 'invalid_target' };
  }

  const validGroupRequest = requestedTargetId === undefined || requestedTargetId === 'all';
  return validGroupRequest
    ? { ok: true, requiresTarget, legalTargets, targets: legalTargets }
    : { ok: false, requiresTarget, legalTargets, targets: [], error: 'invalid_target' };
}
