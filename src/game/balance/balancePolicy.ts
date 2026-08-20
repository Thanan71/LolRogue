import { validateRunAttempt } from '@/game/authority/RunCommandValidator';
import type {
  AuthorityDifficulty,
  AuthorityRunAttempt,
  AuthorityRunCommand,
  AuthorityRunSnapshot,
} from '@/game/authority/types';
import { validateItemEquipment } from '@/game/inventory/inventoryRules';
import { canUpgradeSpell } from '@/game/run/spellUpgradeRules';
import { MAX_INVENTORY_ITEMS } from '@/types/run';

export interface BalancePolicyManifest {
  id: string;
  version: number;
}

export interface BalanceScenario {
  id: string;
  difficulty: AuthorityDifficulty;
  team: ReadonlyArray<{
    championId: string;
    statMultiplier?: number;
  }>;
  runeIds: readonly string[];
  masterySnapshot: Readonly<Record<string, number>>;
  enhancementSnapshot: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface BalancePolicy {
  readonly manifest: BalancePolicyManifest;
  buildAttempt(input: { scenario: BalanceScenario; seed: number }): AuthorityRunAttempt;
  nextCommand(snapshot: Readonly<AuthorityRunSnapshot>): AuthorityRunCommand | null;
}

export class BalancePolicyDecisionError extends Error {
  constructor(
    readonly code: 'invalid_scenario' | 'no_legal_command',
    message: string,
  ) {
    super(message);
    this.name = 'BalancePolicyDecisionError';
  }
}

export const SURVIVAL_GREEDY_POLICY_MANIFEST = Object.freeze({
  id: 'survival-greedy',
  version: 1,
}) satisfies BalancePolicyManifest;

const SPELL_PRIORITY = ['R', 'Q', 'W', 'E'] as const;

function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

/** UUID-shaped, deterministic identity suitable for inventory instance IDs and reports. */
export function createBalanceRunUuid(scenario: BalanceScenario, seed: number): string {
  const identity = JSON.stringify([
    scenario.id,
    scenario.difficulty,
    scenario.team,
    scenario.runeIds,
    scenario.masterySnapshot,
    scenario.enhancementSnapshot,
    seed,
  ]);
  const raw = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((initial) => hash32(identity, initial).toString(16).padStart(8, '0'))
    .join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-8${raw.slice(
    17,
    20,
  )}-${raw.slice(20, 32)}`;
}

function command<K extends AuthorityRunCommand['kind']>(
  snapshot: Readonly<AuthorityRunSnapshot>,
  kind: K,
  payload: Extract<AuthorityRunCommand, { kind: K }>['payload'],
): Extract<AuthorityRunCommand, { kind: K }> {
  return {
    sequence: snapshot.nextSequence,
    kind,
    payload,
  } as Extract<AuthorityRunCommand, { kind: K }>;
}

function compareByCostThenId<T extends { cost: number }>(
  left: T,
  right: T,
  getId: (value: T) => string,
): number {
  return left.cost - right.cost || getId(left).localeCompare(getId(right));
}

function nextPendingCommand(snapshot: Readonly<AuthorityRunSnapshot>): AuthorityRunCommand | null {
  const pending = snapshot.pendingEncounter;
  if (!pending) return null;
  const nodePayload = { node_id: pending.nodeId };

  if (pending.claimed) return command(snapshot, 'resolve_node', nodePayload);

  switch (pending.nodeType) {
    case 'combat':
    case 'elite':
    case 'boss':
      return command(snapshot, 'resolve_combat', {
        ...nodePayload,
        actions_json: 'auto',
      });
    case 'treasure':
      return command(snapshot, 'treasure', nodePayload);
    case 'event':
      return command(snapshot, 'event', nodePayload);
    case 'rest':
      return pending.legal
        ? command(snapshot, 'rest', nodePayload)
        : command(snapshot, 'resolve_node', nodePayload);
    case 'recruit':
      return pending.legal
        ? command(snapshot, 'recruit', nodePayload)
        : command(snapshot, 'resolve_node', nodePayload);
    case 'shop': {
      const recruit = [...pending.recruitOffers]
        .filter((offer) => offer.legal && !offer.consumed && offer.cost <= snapshot.gold)
        .sort((left, right) => compareByCostThenId(left, right, (offer) => offer.championId))[0];
      if (recruit) {
        return command(snapshot, 'shop_recruit', {
          ...nodePayload,
          champion_id: recruit.championId,
        });
      }
      const item = [...pending.itemOffers]
        .filter((offer) => offer.legal && !offer.consumed && offer.cost <= snapshot.gold)
        .sort((left, right) => compareByCostThenId(left, right, (offer) => offer.itemId))[0];
      return item
        ? command(snapshot, 'shop_buy_item', {
            ...nodePayload,
            item_id: item.itemId,
          })
        : command(snapshot, 'resolve_node', nodePayload);
    }
    case 'start':
    case 'exit':
      return command(snapshot, 'resolve_node', nodePayload);
  }
}

function nextEquipmentCommand(
  snapshot: Readonly<AuthorityRunSnapshot>,
): AuthorityRunCommand | null {
  const teamIds = snapshot.team.map((member) => member.championId);
  const bag = snapshot.inventory
    .filter((entry) => entry.equippedToChampionId === null)
    .sort((left, right) => left.instanceId.localeCompare(right.instanceId));
  for (const entry of bag) {
    for (const championId of teamIds) {
      if (validateItemEquipment(snapshot.inventory, teamIds, entry.instanceId, championId).valid) {
        return command(snapshot, 'equip_item', {
          instance_id: entry.instanceId,
          champion_id: championId,
        });
      }
    }
  }
  if (snapshot.inventory.length < MAX_INVENTORY_ITEMS || bag.length === 0) return null;
  const sale = [...bag].sort(
    (left, right) =>
      left.item.goldValue - right.item.goldValue || left.instanceId.localeCompare(right.instanceId),
  )[0];
  return sale ? command(snapshot, 'sell_item', { instance_id: sale.instanceId }) : null;
}

export const survivalGreedyPolicy: BalancePolicy = {
  manifest: SURVIVAL_GREEDY_POLICY_MANIFEST,

  buildAttempt({ scenario, seed }) {
    if (!Number.isSafeInteger(seed)) {
      throw new BalancePolicyDecisionError('invalid_scenario', 'Balance seed must be an integer.');
    }
    const attempt: AuthorityRunAttempt = {
      runUuid: createBalanceRunUuid(scenario, seed),
      seed,
      difficulty: scenario.difficulty,
      team: scenario.team.map((member) => ({ ...member })),
      runeIds: [...scenario.runeIds],
      masterySnapshot: { ...scenario.masterySnapshot },
      enhancementSnapshot: Object.fromEntries(
        Object.entries(scenario.enhancementSnapshot).map(([championId, ranks]) => [
          championId,
          { ...ranks },
        ]),
      ),
    };
    try {
      validateRunAttempt(attempt);
    } catch (error) {
      throw new BalancePolicyDecisionError(
        'invalid_scenario',
        error instanceof Error ? error.message : 'Balance scenario is invalid.',
      );
    }
    return attempt;
  },

  nextCommand(snapshot) {
    if (snapshot.terminal) return null;

    const pendingCommand = nextPendingCommand(snapshot);
    if (pendingCommand) return pendingCommand;

    const pendingChampionId = snapshot.pendingSpellUpgradeChampionIds[0];
    if (pendingChampionId) {
      const member = snapshot.team.find((candidate) => candidate.championId === pendingChampionId);
      const slot = member
        ? SPELL_PRIORITY.find((candidate) => canUpgradeSpell(member, candidate))
        : null;
      if (!slot) {
        throw new BalancePolicyDecisionError(
          'no_legal_command',
          `No legal spell upgrade exists for ${pendingChampionId}.`,
        );
      }
      return command(snapshot, 'upgrade_spell', {
        champion_id: pendingChampionId,
        slot,
      });
    }

    const augmentId = [...snapshot.pendingAugmentIds].sort()[0];
    if (augmentId) return command(snapshot, 'choose_augment', { augment_id: augmentId });

    const equipmentCommand = nextEquipmentCommand(snapshot);
    if (equipmentCommand) return equipmentCommand;

    const nodeId = [...snapshot.expectedNodeIds].sort()[0];
    if (nodeId) return command(snapshot, 'move_node', { node_id: nodeId });

    throw new BalancePolicyDecisionError(
      'no_legal_command',
      `Policy ${SURVIVAL_GREEDY_POLICY_MANIFEST.id}@${SURVIVAL_GREEDY_POLICY_MANIFEST.version} reached no legal command at sequence ${snapshot.nextSequence}.`,
    );
  },
};
