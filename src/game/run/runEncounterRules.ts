import { resolveAffordableEventOutcome } from '@/game/map/eventOutcome';
import type {
  EventEncounter,
  EventOutcome,
  RecruitEncounter,
  RestEncounter,
  ShopEncounter,
} from '@/game/map/types';
import {
  getRecruitmentGoldCost,
  normalizeRecruitmentGoldCost,
} from '@/game/recruitment/recruitmentRules';
import { createScopedRunRng } from '@/utils/runRandom';
import { applyRunHeal, getEffectiveRunHp, materializeRunHpAfterStatChange } from './runHealth';

interface RunEncounterMember {
  currentHp?: number | null;
  statBoosts?: Record<string, number>;
}

export function getShopItemCost(
  encounter: ShopEncounter,
  basePrice: number,
  discountPercent: number,
): number {
  return Math.max(
    0,
    Math.round(
      basePrice * encounter.priceMultiplier * (1 - Math.min(0.8, Math.max(0, discountPercent))),
    ),
  );
}

export function getShopRecruitCost(encounter: ShopEncounter, baseCost: number): number {
  return normalizeRecruitmentGoldCost(baseCost * encounter.priceMultiplier);
}

export function getItemSaleGold(goldValue: number): number {
  return Math.max(1, Math.floor(Math.max(0, goldValue) / 2));
}

export function getRestGoldCost(
  encounter: Pick<RestEncounter, 'fullHeal' | 'goldCost'>,
  teamSize: number,
): number {
  const normalizedTeamSize = Number.isFinite(teamSize) ? Math.max(1, Math.trunc(teamSize)) : 1;
  const additionalMemberCost = encounter.fullHeal ? 40 : 20;
  return (
    Math.max(0, Math.round(encounter.goldCost)) + additionalMemberCost * (normalizedTeamSize - 1)
  );
}

export function resolveRecruitAttempt(
  seed: number,
  encounter: RecruitEncounter,
): { success: boolean; goldCost: number } {
  const rng = createScopedRunRng(seed, `recruit:${encounter.id}:attempt`);
  const success = rng.next() < encounter.successChance;
  return { success, goldCost: getRecruitmentGoldCost(encounter.cost, success) };
}

export function resolveRunEvent(
  seed: number,
  encounter: EventEncounter,
  availableGold: number,
): EventOutcome {
  const rng = createScopedRunRng(seed, `event:${encounter.id}:outcome`);
  return resolveAffordableEventOutcome(encounter.outcomes, availableGold, () => rng.next());
}

export function resolveRestHp(
  currentHp: number | undefined | null,
  maxHp: number,
  encounter: Pick<RestEncounter, 'fullHeal' | 'healPercent'>,
): number {
  if (encounter.fullHeal) return maxHp;
  return applyRunHeal(currentHp ?? undefined, maxHp, encounter.healPercent);
}

/** Every rest fully restores the combat resource, independently of its HP tier. */
export function resolveRestMp(maxMp: number): number {
  return Math.max(0, maxMp);
}

export function resolveEventTeamUpdates<T extends RunEncounterMember>(
  outcome: EventOutcome,
  team: readonly T[],
  getMaxHp: (member: T) => number,
): T[] {
  if (!['heal', 'damage', 'stat_boost'].includes(outcome.type)) {
    return team.map((member) => ({ ...member }));
  }
  return team.map((member) => {
    if (outcome.type === 'heal') {
      const maxHp = getMaxHp(member);
      return {
        ...member,
        currentHp: applyRunHeal(member.currentHp ?? undefined, maxHp, outcome.healPercent ?? 0.3),
      };
    }
    if (outcome.type === 'damage') {
      const maxHp = getMaxHp(member);
      const currentHp = getEffectiveRunHp(member.currentHp ?? undefined, maxHp);
      return {
        ...member,
        currentHp: Math.max(1, currentHp - Math.floor(currentHp * (outcome.damagePercent ?? 0.15))),
      };
    }
    if (!outcome.statBoost) return { ...member };
    const statBoosts = {
      ...member.statBoosts,
      [outcome.statBoost.stat]:
        (member.statBoosts?.[outcome.statBoost.stat] ?? 0) + outcome.statBoost.amount,
    };
    return {
      ...member,
      statBoosts,
      currentHp: materializeRunHpAfterStatChange(
        member.currentHp ?? undefined,
        getMaxHp({ ...member, statBoosts }),
      ),
    };
  });
}
