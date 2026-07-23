/**
 * Encounter Manager
 *
 * Orchestrates encounter resolution for all node types.
 * Handles combat, shop, rest, event, and recruit encounters.
 */

import {
  type CombatEncounter,
  type EventEncounter,
  type EventOutcome,
  type MapNode,
  NodeType,
  type RecruitEncounter,
  type RestEncounter,
  type ShopEncounter,
} from './types';

// ─── Result Types ────────────────────────────────────────────────────────────

export type EncounterResult =
  | CombatEncounterResult
  | ShopEncounterResult
  | RestEncounterResult
  | EventEncounterResult
  | RecruitEncounterResult
  | TreasureEncounterResult;

export interface CombatEncounterResult {
  type: 'combat';
  encounter: CombatEncounter;
  victory: boolean;
  goldEarned: number;
  itemDropped: boolean;
}

export interface ShopEncounterResult {
  type: 'shop';
  encounter: ShopEncounter;
  purchasedItemIds: string[];
  recruitedChampionIds: string[];
  goldSpent: number;
}

export interface RestEncounterResult {
  type: 'rest';
  encounter: RestEncounter;
  hpRestored: number;
  goldSpent: number;
}

export interface EventEncounterResult {
  type: 'event';
  encounter: EventEncounter;
  outcome: EventOutcome;
  goldChange: number;
  itemReceived: boolean;
  championRecruited: string | null;
}

export interface RecruitEncounterResult {
  type: 'recruit';
  encounter: RecruitEncounter;
  success: boolean;
  goldSpent: number;
  recruitedChampionId: string | null;
}

export interface TreasureEncounterResult {
  type: 'treasure';
  goldEarned: number;
}

// ─── Event Outcome Resolution ───────────────────────────────────────────────

/**
 * Resolve a random event outcome from weighted outcomes.
 */
export function resolveEventOutcome(
  outcomes: EventOutcome[],
  rand: () => number = Math.random,
): EventOutcome {
  const totalWeight = outcomes.reduce((sum, o) => sum + o.weight, 0);
  let roll = rand() * totalWeight;

  for (const outcome of outcomes) {
    roll -= outcome.weight;
    if (roll <= 0) return outcome;
  }

  return outcomes[outcomes.length - 1];
}

// ─── Encounter Manager ──────────────────────────────────────────────────────

export class EncounterManager {
  constructor(private readonly rand: () => number = Math.random) {}

  resolveNode(node: MapNode): EncounterResult | null {
    if (!node.encounter) {
      if (node.type === NodeType.Treasure) {
        return this.resolveTreasure();
      }
      return null;
    }

    switch (node.encounter.type) {
      case 'combat':
        return this.resolveCombat(node.encounter as CombatEncounter);
      case 'shop':
        return this.resolveShop(node.encounter as ShopEncounter);
      case 'rest':
        return this.resolveRest(node.encounter as RestEncounter);
      case 'event':
        return this.resolveEvent(node.encounter as EventEncounter);
      case 'recruit':
        return this.resolveRecruit(node.encounter as RecruitEncounter);
      default:
        return null;
    }
  }

  resolveCombat(encounter: CombatEncounter, victory: boolean = true): CombatEncounterResult {
    const itemDropped = victory && this.rand() < encounter.itemDropChance;

    return {
      type: 'combat',
      encounter,
      victory,
      goldEarned: victory ? encounter.goldReward : 0,
      itemDropped,
    };
  }

  resolveShop(
    encounter: ShopEncounter,
    purchasedItemIds: string[] = [],
    recruitedChampionIds: string[] = [],
  ): ShopEncounterResult {
    let goldSpent = 0;

    for (const itemId of purchasedItemIds) {
      const item = encounter.items.find((i) => i.itemId === itemId);
      if (item) {
        goldSpent += Math.round(item.price * encounter.priceMultiplier);
      }
    }

    for (const champId of recruitedChampionIds) {
      const recruit = encounter.recruitableChampions.find((c) => c.championId === champId);
      if (recruit) {
        goldSpent += Math.round(recruit.cost * encounter.priceMultiplier);
      }
    }

    return {
      type: 'shop',
      encounter,
      purchasedItemIds,
      recruitedChampionIds,
      goldSpent,
    };
  }

  resolveRest(encounter: RestEncounter): RestEncounterResult {
    return {
      type: 'rest',
      encounter,
      hpRestored: encounter.healPercent,
      goldSpent: encounter.goldCost,
    };
  }

  resolveEvent(encounter: EventEncounter): EventEncounterResult {
    const outcome = resolveEventOutcome(encounter.outcomes, this.rand);

    let goldChange = 0;
    if (outcome.goldAmount !== undefined) {
      goldChange = outcome.goldAmount;
    }

    const itemReceived = outcome.type === 'item_reward' && !!outcome.item;
    const championRecruited =
      outcome.type === 'champion_recruit' ? (outcome.championId ?? null) : null;

    return {
      type: 'event',
      encounter,
      outcome,
      goldChange,
      itemReceived,
      championRecruited,
    };
  }

  resolveRecruit(encounter: RecruitEncounter): RecruitEncounterResult {
    const success = this.rand() < encounter.successChance;

    return {
      type: 'recruit',
      encounter,
      success,
      goldSpent: success ? encounter.cost : 0,
      recruitedChampionId: success ? encounter.championId : null,
    };
  }

  resolveTreasure(): TreasureEncounterResult {
    return {
      type: 'treasure',
      goldEarned: 10 + Math.floor(this.rand() * 50),
    };
  }
}
