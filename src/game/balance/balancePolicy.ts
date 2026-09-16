import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { validateRunAttempt } from '@/game/authority/RunCommandValidator';
import type {
  AuthorityDifficulty,
  AuthorityRunAttempt,
  AuthorityRunCommand,
  AuthorityRunSnapshot,
} from '@/game/authority/types';
import { validateItemEquipment } from '@/game/inventory/inventoryRules';
import { canUpgradeSpell } from '@/game/run/spellUpgradeRules';
import { AugmentCategory, AugmentEffectType } from '@/types/inventory';
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

export const SAFETY_FIRST_POLICY_MANIFEST = Object.freeze({
  id: 'safety-first',
  version: 1,
}) satisfies BalancePolicyManifest;

export const ECONOMY_FIRST_POLICY_MANIFEST = Object.freeze({
  id: 'economy-first',
  version: 1,
}) satisfies BalancePolicyManifest;

const SPELL_PRIORITY = ['R', 'Q', 'W', 'E'] as const;
const SAFETY_SPELL_PRIORITY = ['R', 'W', 'E', 'Q'] as const;
const ECONOMY_SPELL_PRIORITY = ['R', 'Q', 'E', 'W'] as const;
export const ECONOMY_POLICY_GOLD_RESERVE = 100;

interface BalancePolicyStrategy {
  readonly manifest: BalancePolicyManifest;
  readonly spellPriority: readonly (typeof SPELL_PRIORITY)[number][];
  readonly shopPriority: 'recruits' | 'items';
  readonly reserveGold: number;
  readonly payForRest: boolean;
  readonly augmentScore: (augmentId: string) => number;
  readonly woundedChampionFirst: boolean;
  readonly reverseRouteOrder: boolean;
}

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

function nextPendingCommand(
  snapshot: Readonly<AuthorityRunSnapshot>,
  strategy: BalancePolicyStrategy,
): AuthorityRunCommand | null {
  const pending = snapshot.pendingEncounter;
  if (!pending) return null;
  const nodePayload = { node_id: pending.nodeId };
  const spendableGold = Math.max(0, snapshot.gold - strategy.reserveGold);

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
      return pending.legal &&
        (strategy.payForRest || pending.cost === 0) &&
        (strategy.reserveGold === 0 || pending.cost <= spendableGold)
        ? command(snapshot, 'rest', nodePayload)
        : command(snapshot, 'resolve_node', nodePayload);
    case 'recruit':
      return pending.legal && (strategy.reserveGold === 0 || pending.cost <= spendableGold)
        ? command(snapshot, 'recruit', nodePayload)
        : command(snapshot, 'resolve_node', nodePayload);
    case 'shop': {
      const recruit = [...pending.recruitOffers]
        .filter((offer) => offer.legal && !offer.consumed && offer.cost <= spendableGold)
        .sort((left, right) => compareByCostThenId(left, right, (offer) => offer.championId))[0];
      const item = [...pending.itemOffers]
        .filter((offer) => offer.legal && !offer.consumed && offer.cost <= spendableGold)
        .sort((left, right) => compareByCostThenId(left, right, (offer) => offer.itemId))[0];
      const buyRecruit = recruit
        ? command(snapshot, 'shop_recruit', {
            ...nodePayload,
            champion_id: recruit.championId,
          })
        : null;
      const buyItem = item
        ? command(snapshot, 'shop_buy_item', {
            ...nodePayload,
            item_id: item.itemId,
          })
        : null;
      return strategy.shopPriority === 'recruits'
        ? (buyRecruit ?? buyItem ?? command(snapshot, 'resolve_node', nodePayload))
        : (buyItem ?? buyRecruit ?? command(snapshot, 'resolve_node', nodePayload));
    }
    case 'start':
    case 'exit':
      return command(snapshot, 'resolve_node', nodePayload);
  }
}

function nextEquipmentCommand(
  snapshot: Readonly<AuthorityRunSnapshot>,
  strategy: BalancePolicyStrategy,
): AuthorityRunCommand | null {
  const teamIds = [...snapshot.team]
    .sort((left, right) => {
      if (!strategy.woundedChampionFirst) return 0;
      return (
        (left.currentHp ?? Number.MAX_SAFE_INTEGER) -
          (right.currentHp ?? Number.MAX_SAFE_INTEGER) ||
        left.championId.localeCompare(right.championId)
      );
    })
    .map((member) => member.championId);
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

function defensiveAugmentScore(augmentId: string): number {
  const augment = AUGMENT_DATABASE[augmentId];
  if (!augment) return 0;
  return augment.effects.reduce((score, effect) => {
    if (effect.type === AugmentEffectType.ExtraRevive) return score + 1_000;
    if (effect.type === AugmentEffectType.DamageReduction) return score + 900;
    if (effect.type === AugmentEffectType.HealAfterBattle) return score + 800;
    if (effect.stat === 'hp') return score + 700;
    if (effect.stat === 'def') return score + 600;
    return score;
  }, 0);
}

function economicAugmentScore(augmentId: string): number {
  const augment = AUGMENT_DATABASE[augmentId];
  if (!augment) return 0;
  return augment.category === AugmentCategory.Economy ? 1_000 : 0;
}

function chooseAugmentId(
  pendingAugmentIds: readonly string[],
  strategy: BalancePolicyStrategy,
): string | null {
  return (
    [...pendingAugmentIds].sort(
      (left, right) =>
        strategy.augmentScore(right) - strategy.augmentScore(left) || left.localeCompare(right),
    )[0] ?? null
  );
}

function buildBalanceAttempt(input: {
  scenario: BalanceScenario;
  seed: number;
}): AuthorityRunAttempt {
  const { scenario, seed } = input;
  if (!Number.isSafeInteger(seed)) {
    throw new BalancePolicyDecisionError('invalid_scenario', 'Balance seed must be an integer.');
  }
  const attempt: AuthorityRunAttempt = {
    runUuid: createBalanceRunUuid(scenario, seed),
    seed,
    difficulty: scenario.difficulty,
    mode: 'normal',
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
}

function createBalancePolicy(strategy: BalancePolicyStrategy): BalancePolicy {
  return {
    manifest: strategy.manifest,
    buildAttempt: buildBalanceAttempt,
    nextCommand(snapshot) {
      if (snapshot.terminal) return null;

      const pendingCommand = nextPendingCommand(snapshot, strategy);
      if (pendingCommand) return pendingCommand;

      const pendingChampionId = snapshot.pendingSpellUpgradeChampionIds[0];
      if (pendingChampionId) {
        const member = snapshot.team.find(
          (candidate) => candidate.championId === pendingChampionId,
        );
        const slot = member
          ? strategy.spellPriority.find((candidate) => canUpgradeSpell(member, candidate))
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

      const augmentId = chooseAugmentId(snapshot.pendingAugmentIds, strategy);
      if (augmentId) return command(snapshot, 'choose_augment', { augment_id: augmentId });

      const equipmentCommand = nextEquipmentCommand(snapshot, strategy);
      if (equipmentCommand) return equipmentCommand;

      const orderedNodeIds = [...snapshot.expectedNodeIds].sort();
      const nodeId = strategy.reverseRouteOrder ? orderedNodeIds.reverse()[0] : orderedNodeIds[0];
      if (nodeId) return command(snapshot, 'move_node', { node_id: nodeId });

      throw new BalancePolicyDecisionError(
        'no_legal_command',
        `Policy ${strategy.manifest.id}@${strategy.manifest.version} reached no legal command at sequence ${snapshot.nextSequence}.`,
      );
    },
  };
}

export const survivalGreedyPolicy = createBalancePolicy({
  manifest: SURVIVAL_GREEDY_POLICY_MANIFEST,
  spellPriority: SPELL_PRIORITY,
  shopPriority: 'recruits',
  reserveGold: 0,
  payForRest: true,
  augmentScore: () => 0,
  woundedChampionFirst: false,
  reverseRouteOrder: false,
});

export const safetyFirstPolicy = createBalancePolicy({
  manifest: SAFETY_FIRST_POLICY_MANIFEST,
  spellPriority: SAFETY_SPELL_PRIORITY,
  shopPriority: 'recruits',
  reserveGold: 0,
  payForRest: true,
  augmentScore: defensiveAugmentScore,
  woundedChampionFirst: true,
  reverseRouteOrder: false,
});

export const economyFirstPolicy = createBalancePolicy({
  manifest: ECONOMY_FIRST_POLICY_MANIFEST,
  spellPriority: ECONOMY_SPELL_PRIORITY,
  shopPriority: 'items',
  reserveGold: ECONOMY_POLICY_GOLD_RESERVE,
  payForRest: false,
  augmentScore: economicAugmentScore,
  woundedChampionFirst: false,
  reverseRouteOrder: true,
});

/** The field calibration set is explicit so adding a policy changes a versioned contract. */
export const FIELD_CALIBRATION_POLICIES = Object.freeze([
  safetyFirstPolicy,
  economyFirstPolicy,
]) satisfies readonly BalancePolicy[];

export const BALANCE_POLICY_REGISTRY = Object.freeze([
  survivalGreedyPolicy,
  ...FIELD_CALIBRATION_POLICIES,
]) satisfies readonly BalancePolicy[];

export function getBalancePolicy(manifest: string): BalancePolicy | undefined {
  return BALANCE_POLICY_REGISTRY.find(
    (policy) => `${policy.manifest.id}@${policy.manifest.version}` === manifest,
  );
}
