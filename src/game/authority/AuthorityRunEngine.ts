import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import { AUGMENT_DATABASE, getRuneDefinition, ITEM_DATABASE } from '@/data/items';
import { BattleManager } from '@/game/battle/BattleManager';
import { BattlePhase, type BattleTeam } from '@/game/battle/types';
import { ChampionInstance, type SpellSlot } from '@/game/ChampionInstance';
import { AugmentManager } from '@/game/augments/AugmentManager';
import { validateItemAddition } from '@/game/inventory/inventoryRules';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import { assertValidRuleCatalogs } from '@/game/rules/catalogValidation';
import { resolveAffordableEventOutcome } from '@/game/map/EncounterManager';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { findNode } from '@/game/map/mapUtils';
import {
  type CombatEncounter,
  type EventEncounter,
  type MapNode,
  type NodeMap,
  NodeType,
  type RecruitEncounter,
  type RestEncounter,
  type ShopEncounter,
  type ShopItem,
  type TreasureEncounter,
} from '@/game/map/types';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { AugmentEffectType, DEFAULT_MAX_AUGMENTS } from '@/types/inventory';
import {
  type ChampionRunStats,
  type InventoryEntry,
  type Item,
  MAX_INVENTORY_ITEMS,
  MAX_ITEMS_PER_CHAMPION,
  MAX_TEAM_SIZE,
} from '@/types/run';
import { createScopedRunRng } from '@/utils/runRandom';
import { calculateEventStatBonuses, calculateMaxHP, toCombatStatKey } from '@/utils/statCalculator';
import { addXp, calculateXpGain } from '@/utils/xpSystem';
import type {
  AuthorityDifficulty,
  AuthorityReplayResult,
  AuthorityRunAttempt,
  AuthorityRunCommand,
  AuthorityRunEndReason,
  AuthorityRunSnapshot,
  AuthorityTeamMember,
  AuthorityVerificationOptions,
  AuthorityVerificationResult,
} from './types';

export const AUTHORITY_ENGINE_VERSION = 'run-engine-v2';
export const AUTHORITY_CONTENT_HASH =
  '85af7f7d9178597f4f9ed14e362773973f9f2601d679b62c7649de53e2d68223';

assertValidRuleCatalogs();

const MAX_COMMANDS = 10_000;
const MAX_COMBAT_TURNS = 100_000;
const IMPLEMENTED_CHAMPION_IDS = new Set(implementedChampions.map((champion) => champion.id));
const STARTER_RUNE_IDS = new Set([
  'press_the_attack',
  'electrocute',
  'summon_aery',
  'grasp_of_the_undying',
  'glacial_augment',
]);
const SPELL_SLOTS: readonly SpellSlot[] = ['Q', 'W', 'E', 'R'];
const DIFFICULTY_MULTIPLIER: Record<AuthorityDifficulty, number> = {
  easy: 0.85,
  normal: 1,
  hard: 1.2,
};
type PendingEncounter = {
  node: MapNode;
  claimed: boolean;
  purchasedItemIds: Set<string>;
  recruitedChampionIds: Set<string>;
};

export class AuthorityRunVerificationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly commandIndex: number | null = null,
  ) {
    super(message);
    this.name = 'AuthorityRunVerificationError';
  }
}

function fail(code: string, message: string, commandIndex: number | null = null): never {
  throw new AuthorityRunVerificationError(code, message, commandIndex);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function requiredString(
  payload: Record<string, unknown>,
  key: string,
  commandIndex: number,
): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > 160) {
    fail('invalid_command', `Command payload "${key}" must be a non-empty string.`, commandIndex);
  }
  return value;
}

function parseCommand(value: unknown, commandIndex: number): AuthorityRunCommand {
  if (!isRecord(value) || !hasExactKeys(value, ['sequence', 'kind', 'payload'])) {
    fail(
      'invalid_command',
      'Each command must contain exactly sequence, kind and payload.',
      commandIndex,
    );
  }
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1) {
    fail('invalid_sequence', 'Command sequence must be a positive safe integer.', commandIndex);
  }
  if (typeof value.kind !== 'string' || !isRecord(value.payload)) {
    fail('invalid_command', 'Command kind and payload are invalid.', commandIndex);
  }

  const sequence = value.sequence as number;
  const payload = value.payload;
  const nodePayload = (): { node_id: string } => {
    if (!hasExactKeys(payload, ['node_id'])) {
      fail('invalid_command', `${value.kind} expects only node_id.`, commandIndex);
    }
    return { node_id: requiredString(payload, 'node_id', commandIndex) };
  };

  switch (value.kind) {
    case 'move_node':
      return { sequence, kind: value.kind, payload: nodePayload() };
    case 'resolve_combat':
      return { sequence, kind: value.kind, payload: nodePayload() };
    case 'rest':
      return { sequence, kind: value.kind, payload: nodePayload() };
    case 'recruit':
      return { sequence, kind: value.kind, payload: nodePayload() };
    case 'event':
      return { sequence, kind: value.kind, payload: nodePayload() };
    case 'treasure':
      return { sequence, kind: value.kind, payload: nodePayload() };
    case 'resolve_node':
      return { sequence, kind: value.kind, payload: nodePayload() };
    case 'shop_buy_item':
      if (!hasExactKeys(payload, ['node_id', 'item_id'])) {
        fail('invalid_command', 'shop_buy_item expects node_id and item_id.', commandIndex);
      }
      return {
        sequence,
        kind: value.kind,
        payload: {
          node_id: requiredString(payload, 'node_id', commandIndex),
          item_id: requiredString(payload, 'item_id', commandIndex),
        },
      };
    case 'shop_recruit':
      if (!hasExactKeys(payload, ['node_id', 'champion_id'])) {
        fail('invalid_command', 'shop_recruit expects node_id and champion_id.', commandIndex);
      }
      return {
        sequence,
        kind: value.kind,
        payload: {
          node_id: requiredString(payload, 'node_id', commandIndex),
          champion_id: requiredString(payload, 'champion_id', commandIndex),
        },
      };
    case 'equip_item':
      if (!hasExactKeys(payload, ['instance_id', 'champion_id'])) {
        fail('invalid_command', 'equip_item expects instance_id and champion_id.', commandIndex);
      }
      return {
        sequence,
        kind: value.kind,
        payload: {
          instance_id: requiredString(payload, 'instance_id', commandIndex),
          champion_id: requiredString(payload, 'champion_id', commandIndex),
        },
      };
    case 'unequip_item':
    case 'sell_item':
      if (!hasExactKeys(payload, ['instance_id'])) {
        fail('invalid_command', `${value.kind} expects only instance_id.`, commandIndex);
      }
      return {
        sequence,
        kind: value.kind,
        payload: { instance_id: requiredString(payload, 'instance_id', commandIndex) },
      };
    case 'choose_augment':
      if (!hasExactKeys(payload, ['augment_id'])) {
        fail('invalid_command', 'choose_augment expects only augment_id.', commandIndex);
      }
      return {
        sequence,
        kind: value.kind,
        payload: { augment_id: requiredString(payload, 'augment_id', commandIndex) },
      };
    case 'upgrade_spell': {
      if (!hasExactKeys(payload, ['champion_id', 'slot'])) {
        fail('invalid_command', 'upgrade_spell expects champion_id and slot.', commandIndex);
      }
      const slot = requiredString(payload, 'slot', commandIndex);
      if (!SPELL_SLOTS.includes(slot as SpellSlot)) {
        fail('invalid_command', 'Spell slot must be Q, W, E or R.', commandIndex);
      }
      return {
        sequence,
        kind: value.kind,
        payload: {
          champion_id: requiredString(payload, 'champion_id', commandIndex),
          slot: slot as SpellSlot,
        },
      };
    }
    case 'abandon_run':
      if (!hasExactKeys(payload, [])) {
        fail('invalid_command', 'abandon_run payload must be empty.', commandIndex);
      }
      return { sequence, kind: value.kind, payload: {} };
    default:
      fail('unknown_command', `Unsupported command kind "${value.kind}".`, commandIndex);
  }
}

function validateAttempt(value: AuthorityRunAttempt): void {
  if (!isRecord(value)) fail('invalid_attempt', 'Attempt must be an object.');
  if (
    typeof value.runUuid !== 'string' ||
    value.runUuid.length === 0 ||
    value.runUuid.length > 160
  ) {
    fail('invalid_attempt', 'Attempt runUuid is invalid.');
  }
  if (!Number.isSafeInteger(value.seed)) fail('invalid_attempt', 'Attempt seed is invalid.');
  if (!['easy', 'normal', 'hard'].includes(value.difficulty)) {
    fail('invalid_attempt', 'Attempt difficulty is invalid.');
  }
  if (!Array.isArray(value.team) || value.team.length !== 1) {
    fail('invalid_attempt', 'Attempt must contain exactly one starter champion.');
  }
  const teamIds = new Set<string>();
  for (const member of value.team) {
    if (
      !isRecord(member) ||
      typeof member.championId !== 'string' ||
      !IMPLEMENTED_CHAMPION_IDS.has(member.championId) ||
      !championDB.getById(member.championId) ||
      teamIds.has(member.championId)
    ) {
      fail('invalid_attempt', 'Attempt team contains an invalid or duplicate champion.');
    }
    const multiplier = member.statMultiplier ?? 1;
    if (!Number.isFinite(multiplier) || multiplier < 0.1 || multiplier > 10) {
      fail('invalid_attempt', 'Attempt team stat multiplier is invalid.');
    }
    teamIds.add(member.championId);
  }
  if (
    !Array.isArray(value.runeIds) ||
    value.runeIds.length > 3 ||
    new Set(value.runeIds).size !== value.runeIds.length ||
    value.runeIds.some(
      (id) => typeof id !== 'string' || !STARTER_RUNE_IDS.has(id) || !getRuneDefinition(id),
    )
  ) {
    fail('invalid_attempt', 'Attempt rune loadout is invalid.');
  }
  if (!isRecord(value.enhancementSnapshot)) {
    fail('invalid_attempt', 'Attempt enhancement snapshot is invalid.');
  }
  for (const [championId, ranks] of Object.entries(value.enhancementSnapshot)) {
    if (
      !IMPLEMENTED_CHAMPION_IDS.has(championId) ||
      !championDB.getById(championId) ||
      !isRecord(ranks)
    ) {
      fail('invalid_attempt', 'Attempt enhancement snapshot contains an invalid champion.');
    }
    const champion = championDB.getById(championId);
    if (!champion) fail('invalid_attempt', 'Attempt enhancement champion is unavailable.');
    const tree = enhancementTreeProvider.getTreeForChampion(champion);
    const nodes = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    for (const [nodeId, rank] of Object.entries(ranks)) {
      const node = nodeById.get(nodeId);
      if (
        !node ||
        !Number.isSafeInteger(rank) ||
        (rank as number) < 0 ||
        (rank as number) > (node.maxRanks ?? 1)
      ) {
        fail('invalid_attempt', 'Attempt enhancement snapshot contains an invalid rank.');
      }
      if (
        (rank as number) > 0 &&
        node.prerequisites.some(
          (prerequisiteId) =>
            !Number.isSafeInteger(ranks[prerequisiteId]) || ranks[prerequisiteId] < 1,
        )
      ) {
        fail('invalid_attempt', 'Attempt enhancement prerequisites are incomplete.');
      }
    }
  }
}

function itemFromShopItem(shopItem: ShopItem): Item {
  return {
    id: shopItem.itemId,
    name: shopItem.name,
    description: shopItem.description,
    iconUrl: shopItem.iconUrl,
    stats: { ...shopItem.stats },
    passiveId: shopItem.passiveId,
    goldValue: shopItem.price,
  };
}

function itemFromDefinition(definition: (typeof ITEM_DATABASE)[string]): Item {
  const stats: Item['stats'] = {};
  for (const stat of definition.stats) {
    const key = stat.stat as keyof Item['stats'];
    stats[key] = (stats[key] ?? 0) + stat.value;
  }
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    iconUrl: definition.iconUrl,
    stats,
    passiveId: definition.passive?.id,
    goldValue: definition.goldValue,
  };
}

class AuthorityReplayState {
  private readonly maps: NodeMap[];
  private readonly stats = new Map<string, ChampionRunStats>();
  private currentBiomeIndex = 0;
  private currentNodeId: string | null = null;
  private expectedNodeIds: string[];
  private pending: PendingEncounter | null = null;
  private completedNodeIds: string[] = [];
  private team: AuthorityTeamMember[];
  private inventory: InventoryEntry[] = [];
  private augmentIds: string[] = [];
  private runeStacks: Record<string, Record<string, number>> = {};
  private pendingAugmentIds: string[] = [];
  private pendingSpellUpgradeChampionIds: string[] = [];
  private gold = 0;
  private runLevel = 1;
  private currentWave = 1;
  private totalWavesCompleted = 0;
  private terminal = false;
  private endReason: AuthorityRunEndReason = null;
  private nextSequence = 1;
  private nextItemInstanceId = 1;

  constructor(private readonly attempt: AuthorityRunAttempt) {
    validateAttempt(attempt);
    this.maps = generateRunMap(attempt.seed);
    const firstMap = this.maps[0];
    if (!firstMap) fail('invalid_content', 'The ruleset generated no biome map.');
    this.expectedNodeIds = [firstMap.startNodeId];
    this.team = attempt.team.map((member) => ({
      championId: member.championId,
      currentHp: null,
      level: 1,
      currentXp: 0,
      statBoosts: {},
      statMultiplier: member.statMultiplier ?? 1,
      spellRanks: { Q: 1, W: 1, E: 1, R: 1 },
    }));
    for (const member of this.team) this.ensureStats(member.championId);
  }

  apply(command: AuthorityRunCommand, commandIndex: number): void {
    if (this.terminal) {
      fail(
        'command_after_terminal',
        'No command is allowed after the run has ended.',
        commandIndex,
      );
    }
    if (command.sequence !== this.nextSequence) {
      fail(
        'invalid_sequence',
        `Expected sequence ${this.nextSequence}, received ${command.sequence}.`,
        commandIndex,
      );
    }

    switch (command.kind) {
      case 'move_node':
        this.moveNode(command.payload.node_id, commandIndex);
        break;
      case 'resolve_combat':
        this.requirePendingNode(command.payload.node_id, NodeType.Combat, commandIndex, true);
        this.resolveCombat(commandIndex);
        break;
      case 'shop_buy_item':
        this.requirePendingNode(command.payload.node_id, NodeType.Shop, commandIndex);
        this.shopBuyItem(command.payload.item_id, commandIndex);
        break;
      case 'shop_recruit':
        this.requirePendingNode(command.payload.node_id, NodeType.Shop, commandIndex);
        this.shopRecruit(command.payload.champion_id, commandIndex);
        break;
      case 'rest':
        this.requirePendingNode(command.payload.node_id, NodeType.Rest, commandIndex);
        this.resolveRest(commandIndex);
        break;
      case 'recruit':
        this.requirePendingNode(command.payload.node_id, NodeType.Recruit, commandIndex);
        this.resolveRecruit(commandIndex);
        break;
      case 'event':
        this.requirePendingNode(command.payload.node_id, NodeType.Event, commandIndex);
        this.resolveEvent(commandIndex);
        break;
      case 'treasure':
        this.requirePendingNode(command.payload.node_id, NodeType.Treasure, commandIndex);
        this.resolveTreasure(commandIndex);
        break;
      case 'resolve_node':
        this.requirePendingNode(command.payload.node_id, null, commandIndex);
        this.resolveNode(commandIndex);
        break;
      case 'equip_item':
        this.requireBetweenEncounters(commandIndex);
        this.equipItem(command.payload.instance_id, command.payload.champion_id, commandIndex);
        break;
      case 'unequip_item':
        this.requireBetweenEncounters(commandIndex);
        this.unequipItem(command.payload.instance_id, commandIndex);
        break;
      case 'sell_item':
        this.requireBetweenEncounters(commandIndex);
        this.sellItem(command.payload.instance_id, commandIndex);
        break;
      case 'choose_augment':
        this.requireBetweenEncounters(commandIndex);
        this.chooseAugment(command.payload.augment_id, commandIndex);
        break;
      case 'upgrade_spell':
        this.requireBetweenEncounters(commandIndex);
        this.upgradeSpell(
          command.payload.champion_id,
          command.payload.slot as SpellSlot,
          commandIndex,
        );
        break;
      case 'abandon_run':
        this.terminal = true;
        this.endReason = 'defeat';
        break;
    }
    this.nextSequence++;
  }

  snapshot(): AuthorityRunSnapshot {
    const currentMap = this.maps[this.currentBiomeIndex];
    const championStats = [...this.stats.values()]
      .map((entry) => ({
        ...entry,
        survived: this.team.some(
          (member) => member.championId === entry.championId && (member.currentHp ?? 1) > 0,
        ),
      }))
      .sort((left, right) => left.championId.localeCompare(right.championId));
    return {
      runUuid: this.attempt.runUuid,
      seed: this.attempt.seed,
      difficulty: this.attempt.difficulty,
      terminal: this.terminal,
      endReason: this.endReason,
      won: this.endReason === 'victory',
      runLevel: this.runLevel,
      currentBiome: currentMap?.biome ?? null,
      currentBiomeIndex: this.currentBiomeIndex,
      biomesVisited: this.maps.slice(0, this.currentBiomeIndex + 1).map((map) => map.biome),
      currentNodeId: this.currentNodeId,
      expectedNodeIds: [...this.expectedNodeIds],
      pendingNodeType: this.pending ? this.toRunNodeType(this.pending.node.type) : null,
      completedNodeIds: [...this.completedNodeIds],
      team: this.team.map((member) => ({
        ...member,
        statBoosts: { ...member.statBoosts },
        spellRanks: { ...member.spellRanks },
      })),
      inventory: this.inventory.map((entry) => ({
        ...entry,
        item: { ...entry.item, stats: { ...entry.item.stats } },
      })),
      runeIds: [...this.attempt.runeIds],
      augmentIds: [...this.augmentIds],
      pendingAugmentIds: [...this.pendingAugmentIds],
      pendingSpellUpgradeChampionIds: [...this.pendingSpellUpgradeChampionIds],
      gold: this.gold,
      currentWave: this.currentWave,
      totalWavesCompleted: this.totalWavesCompleted,
      championStats,
      totalKills: championStats.reduce((sum, entry) => sum + entry.kills, 0),
      totalDamage: championStats.reduce((sum, entry) => sum + entry.totalDamage, 0),
      nextSequence: this.nextSequence,
    };
  }

  private moveNode(nodeId: string, commandIndex: number): void {
    this.requireBetweenEncounters(commandIndex);
    if (this.pendingAugmentIds.length > 0 || this.pendingSpellUpgradeChampionIds.length > 0) {
      fail('pending_choice', 'All pending upgrades must be chosen before moving.', commandIndex);
    }
    if (!this.expectedNodeIds.includes(nodeId)) {
      fail(
        'node_not_reachable',
        `Node "${nodeId}" is not reachable from the chosen path.`,
        commandIndex,
      );
    }
    const map = this.maps[this.currentBiomeIndex];
    const node = map ? findNode(map, nodeId) : undefined;
    if (!node || this.completedNodeIds.includes(nodeId)) {
      fail('invalid_node', `Node "${nodeId}" is invalid or already completed.`, commandIndex);
    }
    this.currentNodeId = node.id;
    this.expectedNodeIds = [];
    if (!node.encounter && node.type !== NodeType.Start && node.type !== NodeType.Exit) {
      fail('invalid_content', `Node "${node.id}" has no encounter.`, commandIndex);
    }
    this.pending = {
      node,
      claimed: false,
      purchasedItemIds: new Set(),
      recruitedChampionIds: new Set(),
    };
  }

  private resolveCombat(commandIndex: number): void {
    const pending = this.pending;
    const node = pending?.node;
    const encounter = node?.encounter;
    if (!pending || !node || encounter?.type !== 'combat') {
      fail('invalid_encounter', 'No combat encounter is pending.', commandIndex);
    }
    if (pending.claimed)
      fail('encounter_already_claimed', 'Combat is already resolved.', commandIndex);
    pending.claimed = true;

    const players = this.buildPlayerTeam();
    const enemies = this.buildEnemyTeam(encounter);
    if (players.length !== this.team.length || enemies.length === 0) {
      fail('invalid_content', 'Combat contains an unknown champion.', commandIndex);
    }
    const initialHpOverrides: Record<string, number> = {};
    for (const member of this.team) {
      if (member.currentHp !== null) initialHpOverrides[member.championId] = member.currentHp;
    }
    const rng = createScopedRunRng(this.attempt.seed, `combat:${encounter.id ?? node.id}`);
    const playerTeam: BattleTeam = { side: 'player', champions: players };
    const enemyTeam: BattleTeam = { side: 'enemy', champions: enemies };
    const battle = new BattleManager(playerTeam, enemyTeam, {
      autoActions: true,
      maxRounds: 50,
      maxTeamSize: MAX_TEAM_SIZE,
      initialHpOverrides:
        Object.keys(initialHpOverrides).length > 0 ? initialHpOverrides : undefined,
      random: () => rng.next(),
      rules: new CombatRuleRuntime(
        buildCombatRuleLoadout({
          championIds: this.team.map((member) => member.championId),
          runeIds: this.attempt.runeIds,
          runeStacks: this.runeStacks,
          augmentIds: this.augmentIds,
          inventory: this.inventory,
          getUnlockedEnhancements: (championId) =>
            this.attempt.enhancementSnapshot[championId] ?? {},
        }),
        () => rng.next(),
      ),
    });
    battle.startBattle();
    let processedTurns = 0;
    while (battle.phase !== BattlePhase.Finished && processedTurns < MAX_COMBAT_TURNS) {
      battle.processCurrentTurn();
      processedTurns++;
    }
    if (battle.phase !== BattlePhase.Finished) {
      fail('combat_limit', 'Combat exceeded the deterministic safety limit.', commandIndex);
    }
    const result = battle.getResult();
    if (!result) fail('invalid_combat_result', 'Combat ended without a result.', commandIndex);

    for (const event of result.log) {
      if (event.type === 'damage' && event.sourceSide === 'player') {
        this.ensureStats(event.source).totalDamage += event.amount;
      } else if (
        event.type === 'defeat' &&
        event.side === 'enemy' &&
        event.defeatedBy &&
        this.team.some((member) => member.championId === event.defeatedBy)
      ) {
        this.ensureStats(event.defeatedBy).kills++;
      }
    }
    for (const finalState of battle.getFinalPlayerStates()) {
      const member = this.team.find((candidate) => candidate.championId === finalState.championId);
      if (member) member.currentHp = finalState.currentHp;
    }
    const consumedItems = new Set(battle.getConsumedItemInstanceIds());
    this.inventory = this.inventory.filter((entry) => !consumedItems.has(entry.instanceId));
    this.runeStacks = battle.getRuneStacks();

    if (result.winner !== 'player') {
      this.terminal = true;
      this.endReason = result.winner === 'draw' ? 'draw' : 'defeat';
      this.expectedNodeIds = [];
      return;
    }

    const augmentManager = this.getAugmentManager();
    const goldReward = 50 + this.runLevel * 10 + augmentManager.getBonusGold();
    this.gold += goldReward;
    const healAfterBattle = augmentManager.getHealAfterBattlePercent();
    if (healAfterBattle > 0) {
      for (const member of this.team) {
        const maxHp = this.getMemberMaxHp(member);
        member.currentHp = Math.min(maxHp, (member.currentHp ?? 0) + maxHp * healAfterBattle);
      }
    }
    const xpGain = calculateXpGain(
      this.runLevel,
      node.type === NodeType.Elite,
      node.type === NodeType.Boss,
    );
    for (const member of this.team) {
      const resultXp = addXp(member.level, member.currentXp, xpGain);
      member.level = resultXp.newLevel;
      member.currentXp = resultXp.remainingXp;
      for (let level = 0; level < resultXp.levelsGained; level++) {
        this.pendingSpellUpgradeChampionIds.push(member.championId);
      }
    }
    this.totalWavesCompleted++;
    this.currentWave++;
    this.maybeDropCombatItem(node);
  }

  private buildPlayerTeam(): ChampionInstance[] {
    const instances: ChampionInstance[] = [];
    for (const member of this.team) {
      const champion = championDB.getById(member.championId);
      if (!champion) continue;
      const instance = new ChampionInstance(champion, member.level, member.statMultiplier);
      for (const slot of SPELL_SLOTS) instance.setSpellRank(slot, member.spellRanks[slot]);
      this.applyPlayerBonuses(instance, member);
      instances.push(instance);
    }
    return instances;
  }

  private applyPlayerBonuses(instance: ChampionInstance, member: AuthorityTeamMember): void {
    const champion = championDB.getById(instance.id);
    if (!champion) return;
    const tree = enhancementTreeProvider.getTreeForChampion(champion);
    const calculated = enhancementService.calculateStatBonuses(
      tree,
      this.attempt.enhancementSnapshot[instance.id] ?? {},
    );
    const bonuses = {
      flat: { ...calculated.flat } as Record<string, number>,
      percent: { ...calculated.percent } as Record<string, number>,
      effects: [...calculated.effects],
    };

    const addBonus = (stat: string, type: 'flat' | 'percent', value: number): void => {
      const target = toCombatStatKey(stat) ?? stat;
      bonuses[type][target] = (bonuses[type][target] ?? 0) + value;
    };
    for (const augmentId of this.augmentIds) {
      const augment = AUGMENT_DATABASE[augmentId];
      if (!augment) continue;
      for (const effect of augment.effects) {
        if (!effect.stat) continue;
        if (effect.type === AugmentEffectType.TeamStatFlat && effect.flatValue) {
          addBonus(effect.stat, 'flat', effect.flatValue);
        } else if (effect.type === AugmentEffectType.TeamStatPercent && effect.percentValue) {
          addBonus(effect.stat, 'percent', effect.percentValue);
        } else if (effect.type === AugmentEffectType.ScalingStatFlat && effect.flatValue) {
          addBonus(effect.stat, 'flat', effect.flatValue * this.currentBiomeIndex);
        }
      }
    }

    for (const entry of this.inventory.filter(
      (candidate) => candidate.equippedToChampionId === member.championId,
    )) {
      for (const [stat, value] of Object.entries(entry.item.stats)) {
        if (value) addBonus(stat, 'flat', value);
      }
      const passive = ITEM_DATABASE[entry.item.id]?.passive;
      if (passive?.trigger === 'always') {
        for (const modifier of passive.modifiers) {
          addBonus(modifier.stat, modifier.type, modifier.value);
        }
      }
    }
    for (const [stat, value] of Object.entries(calculateEventStatBonuses(member.statBoosts))) {
      if (value) bonuses.flat[stat] = (bonuses.flat[stat] ?? 0) + value;
    }
    instance.setEnhancementBonuses(bonuses);
  }

  private buildEnemyTeam(encounter: CombatEncounter): ChampionInstance[] {
    const multiplier = DIFFICULTY_MULTIPLIER[this.attempt.difficulty];
    const instances: ChampionInstance[] = [];
    for (const enemy of encounter.enemies) {
      const champion = championDB.getById(enemy.championId);
      if (!champion) continue;
      const level = enemy.level ?? 1;
      const scale = (enemy.statMultiplier || 1) * multiplier;
      if (scale === 1) {
        instances.push(new ChampionInstance(champion, level));
        continue;
      }
      const base = champion.stats;
      const scaled = {
        ...champion,
        stats: {
          ...base,
          hp: Math.round(base.hp * scale),
          hpPerLevel: Math.round(base.hpPerLevel * scale),
          mp: Math.round(base.mp * scale),
          mpPerLevel: Math.round(base.mpPerLevel * scale),
          armor: Math.round(base.armor * scale),
          armorPerLevel: Math.round(base.armorPerLevel * scale),
          magicResist: Math.round(base.magicResist * scale),
          magicResistPerLevel: Math.round(base.magicResistPerLevel * scale),
          attackDamage: Math.round(base.attackDamage * scale),
          attackDamagePerLevel: Math.round(base.attackDamagePerLevel * scale),
          attackSpeed: Math.round(base.attackSpeed * scale * 100) / 100,
          attackSpeedPerLevel: Math.round(base.attackSpeedPerLevel * scale * 100) / 100,
          hpRegen: Math.round(base.hpRegen * scale * 10) / 10,
          hpRegenPerLevel: Math.round(base.hpRegenPerLevel * scale * 10) / 10,
          mpRegen: Math.round(base.mpRegen * scale * 10) / 10,
          mpRegenPerLevel: Math.round(base.mpRegenPerLevel * scale * 10) / 10,
          crit: Math.round(base.crit * scale * 10) / 10,
          critPerLevel: Math.round(base.critPerLevel * scale * 10) / 10,
        },
      };
      instances.push(new ChampionInstance(scaled, level));
    }
    return instances;
  }

  private maybeDropCombatItem(node: MapNode): void {
    const rng = createScopedRunRng(
      this.attempt.seed,
      `drop:${node.id}:${this.totalWavesCompleted}`,
    );
    if (rng.next() >= 0.2) return;
    const definitions = Object.values(ITEM_DATABASE);
    if (definitions.length === 0) return;
    const definition = definitions[Math.floor(rng.next() * definitions.length)];
    if (definition) this.addItem(itemFromDefinition(definition));
  }

  private shopBuyItem(itemId: string, commandIndex: number): void {
    const pending = this.pending;
    const encounter = pending?.node.encounter as ShopEncounter | null | undefined;
    if (!pending || encounter?.type !== 'shop') {
      fail('invalid_encounter', 'No shop encounter is pending.', commandIndex);
    }
    if (pending.purchasedItemIds.has(itemId)) {
      fail('offer_consumed', `Shop item "${itemId}" was already purchased.`, commandIndex);
    }
    const offer = encounter.items.find((candidate) => candidate.itemId === itemId);
    if (!offer) fail('invalid_offer', `Item "${itemId}" is not offered.`, commandIndex);
    if (this.inventory.length >= MAX_INVENTORY_ITEMS) {
      fail('inventory_full', 'Inventory is full.', commandIndex);
    }
    const addition = validateItemAddition(this.inventory, { id: offer.itemId });
    if (!addition.valid) fail(addition.code, addition.message, commandIndex);
    const cost = Math.round(
      offer.price *
        encounter.priceMultiplier *
        (1 - this.getAugmentManager().getShopDiscountPercent()),
    );
    if (this.gold < cost) fail('insufficient_gold', 'Not enough gold.', commandIndex);
    this.gold -= cost;
    pending.purchasedItemIds.add(itemId);
    this.addItem(itemFromShopItem(offer));
  }

  private shopRecruit(championId: string, commandIndex: number): void {
    const pending = this.pending;
    const encounter = pending?.node.encounter as ShopEncounter | null | undefined;
    if (!pending || encounter?.type !== 'shop') {
      fail('invalid_encounter', 'No shop encounter is pending.', commandIndex);
    }
    if (pending.recruitedChampionIds.has(championId)) {
      fail('offer_consumed', `Champion "${championId}" was already recruited.`, commandIndex);
    }
    const offer = encounter.recruitableChampions.find(
      (candidate) => candidate.championId === championId,
    );
    if (!offer || !championDB.getById(championId)) {
      fail('invalid_offer', `Champion "${championId}" is not offered.`, commandIndex);
    }
    this.requireRecruitable(championId, commandIndex);
    const cost = Math.round(offer.cost * encounter.priceMultiplier);
    if (this.gold < cost) fail('insufficient_gold', 'Not enough gold.', commandIndex);
    this.gold -= cost;
    pending.recruitedChampionIds.add(championId);
    this.addChampion(championId, 1);
  }

  private resolveRest(commandIndex: number): void {
    const pending = this.pending;
    const encounter = pending?.node.encounter as RestEncounter | null | undefined;
    if (!pending || encounter?.type !== 'rest') {
      fail('invalid_encounter', 'No rest encounter is pending.', commandIndex);
    }
    this.claimPending(commandIndex);
    if (this.gold < encounter.goldCost) {
      fail('insufficient_gold', 'Not enough gold to rest.', commandIndex);
    }
    this.gold -= encounter.goldCost;
    for (const member of this.team) {
      const maxHp = this.getMemberMaxHp(member);
      const currentHp = member.currentHp ?? maxHp;
      const healed = encounter.fullHeal
        ? maxHp
        : Math.min(maxHp, currentHp + Math.floor(maxHp * encounter.healPercent));
      member.currentHp = healed;
    }
  }

  private resolveRecruit(commandIndex: number): void {
    const pending = this.pending;
    const encounter = pending?.node.encounter as RecruitEncounter | null | undefined;
    if (!pending || encounter?.type !== 'recruit') {
      fail('invalid_encounter', 'No recruit encounter is pending.', commandIndex);
    }
    this.requireRecruitable(encounter.championId, commandIndex);
    if (this.gold < encounter.cost) fail('insufficient_gold', 'Not enough gold.', commandIndex);
    this.claimPending(commandIndex);
    const rng = createScopedRunRng(this.attempt.seed, `recruit:${encounter.id}:attempt`);
    if (rng.next() < encounter.successChance) {
      this.gold -= Math.max(0, encounter.cost);
      this.addChampion(encounter.championId, encounter.statMultiplier);
    }
  }

  private resolveEvent(commandIndex: number): void {
    const pending = this.pending;
    const encounter = pending?.node.encounter as EventEncounter | null | undefined;
    if (!pending || encounter?.type !== 'event') {
      fail('invalid_encounter', 'No event encounter is pending.', commandIndex);
    }
    this.claimPending(commandIndex);
    const rng = createScopedRunRng(this.attempt.seed, `event:${encounter.id}:outcome`);
    const outcome = resolveAffordableEventOutcome(encounter.outcomes, this.gold, () => rng.next());
    switch (outcome.type) {
      case 'gold_reward':
        this.gold += Math.max(0, outcome.goldAmount ?? 0);
        break;
      case 'gold_cost':
        this.gold -= Math.min(this.gold, Math.abs(outcome.goldAmount ?? 0));
        break;
      case 'item_reward':
        if (outcome.item) this.addItem(itemFromShopItem(outcome.item));
        break;
      case 'heal':
        for (const member of this.team) {
          const maxHp = this.getMemberMaxHp(member);
          const currentHp = member.currentHp ?? maxHp;
          member.currentHp = Math.min(
            maxHp,
            currentHp + Math.floor(maxHp * (outcome.healPercent ?? 0.3)),
          );
        }
        break;
      case 'damage':
        for (const member of this.team) {
          const maxHp = this.getMemberMaxHp(member);
          const currentHp = member.currentHp ?? maxHp;
          member.currentHp = Math.max(
            1,
            currentHp - Math.floor(currentHp * (outcome.damagePercent ?? 0.15)),
          );
        }
        break;
      case 'champion_recruit':
        if (
          outcome.championId &&
          championDB.getById(outcome.championId) &&
          this.team.length < MAX_TEAM_SIZE &&
          !this.team.some((member) => member.championId === outcome.championId)
        ) {
          this.addChampion(outcome.championId, 1);
        }
        break;
      case 'stat_boost':
        if (outcome.statBoost) {
          for (const member of this.team) {
            member.statBoosts[outcome.statBoost.stat] =
              (member.statBoosts[outcome.statBoost.stat] ?? 0) + outcome.statBoost.amount;
            // A champion without persisted damage remains at full health after
            // the boost, matching EventPage's serializable update.
            member.currentHp = member.currentHp ?? this.getMemberMaxHp(member);
          }
        }
        break;
      case 'nothing':
        break;
    }
  }

  private resolveTreasure(commandIndex: number): void {
    const pending = this.pending;
    const encounter = pending?.node.encounter as TreasureEncounter | null | undefined;
    if (!pending || encounter?.type !== 'treasure') {
      fail('invalid_encounter', 'No treasure encounter is pending.', commandIndex);
    }
    this.claimPending(commandIndex);
    this.gold += Math.max(0, encounter.gold);
    if (encounter.item) this.addItem(itemFromShopItem(encounter.item));
  }

  private resolveNode(commandIndex: number): void {
    const pending = this.pending;
    if (!pending) fail('invalid_encounter', 'No encounter is pending.', commandIndex);
    const node = pending.node;
    const isCombat =
      node.type === NodeType.Combat || node.type === NodeType.Elite || node.type === NodeType.Boss;
    if (isCombat && !pending.claimed) {
      fail(
        'combat_requires_resolution',
        'Combat must be resolved by resolve_combat.',
        commandIndex,
      );
    }
    if (node.type === NodeType.Treasure && !pending.claimed) {
      fail('treasure_not_collected', 'Treasure must be collected before leaving.', commandIndex);
    }
    this.completeNode(node);
    if (node.type === NodeType.Exit) {
      this.advanceBiome(commandIndex);
    } else if (node.type === NodeType.Boss) {
      this.queueAugmentChoices();
      this.runLevel++;
      if (this.currentBiomeIndex === this.maps.length - 1) {
        this.terminal = true;
        this.endReason = 'victory';
        this.expectedNodeIds = [];
      } else {
        this.advanceBiome(commandIndex);
      }
    }
  }

  private completeNode(node: MapNode): void {
    if (!this.completedNodeIds.includes(node.id)) this.completedNodeIds.push(node.id);
    this.pending = null;
    this.expectedNodeIds = [...node.nextNodeIds];
  }

  private advanceBiome(commandIndex: number): void {
    const nextIndex = this.currentBiomeIndex + 1;
    const nextMap = this.maps[nextIndex];
    if (!nextMap) fail('invalid_progression', 'No next biome exists.', commandIndex);
    this.currentBiomeIndex = nextIndex;
    this.currentNodeId = null;
    this.currentWave = 1;
    this.pending = null;
    this.expectedNodeIds = [nextMap.startNodeId];
  }

  private equipItem(instanceId: string, championId: string, commandIndex: number): void {
    const entry = this.inventory.find((candidate) => candidate.instanceId === instanceId);
    if (!entry) fail('invalid_item', `Unknown item instance "${instanceId}".`, commandIndex);
    if (!this.team.some((member) => member.championId === championId)) {
      fail('invalid_champion', `Champion "${championId}" is not on the team.`, commandIndex);
    }
    if (entry.equippedToChampionId === championId) {
      fail('item_already_equipped', 'Item is already equipped to that champion.', commandIndex);
    }
    const equippedCount = this.inventory.filter(
      (candidate) => candidate.equippedToChampionId === championId,
    ).length;
    if (equippedCount >= MAX_ITEMS_PER_CHAMPION) {
      fail('equipment_full', 'Champion equipment is full.', commandIndex);
    }
    entry.equippedToChampionId = championId;
  }

  private unequipItem(instanceId: string, commandIndex: number): void {
    const entry = this.inventory.find((candidate) => candidate.instanceId === instanceId);
    if (!entry || entry.equippedToChampionId === null) {
      fail('invalid_item', 'Item is unknown or not equipped.', commandIndex);
    }
    entry.equippedToChampionId = null;
  }

  private sellItem(instanceId: string, commandIndex: number): void {
    const index = this.inventory.findIndex((candidate) => candidate.instanceId === instanceId);
    if (index < 0) fail('invalid_item', `Unknown item instance "${instanceId}".`, commandIndex);
    const [entry] = this.inventory.splice(index, 1);
    if (!entry) fail('invalid_item', `Unknown item instance "${instanceId}".`, commandIndex);
    this.gold += Math.max(1, Math.floor(entry.item.goldValue / 2));
  }

  private chooseAugment(augmentId: string, commandIndex: number): void {
    if (this.pendingAugmentIds.length === 0) {
      fail('no_pending_augment', 'No augment choice is pending.', commandIndex);
    }
    const definition = AUGMENT_DATABASE[augmentId];
    const stacks = this.augmentIds.filter((id) => id === augmentId).length;
    const distinctAugments = new Set(this.augmentIds).size;
    if (
      !this.pendingAugmentIds.includes(augmentId) ||
      !definition ||
      (stacks === 0 && distinctAugments >= DEFAULT_MAX_AUGMENTS) ||
      (!definition.stackable && stacks > 0) ||
      stacks >= definition.maxStacks
    ) {
      fail('invalid_augment', `Augment "${augmentId}" is not offered.`, commandIndex);
    }
    this.augmentIds.push(augmentId);
    this.pendingAugmentIds = [];
  }

  private upgradeSpell(championId: string, slot: SpellSlot, commandIndex: number): void {
    const pendingIndex = this.pendingSpellUpgradeChampionIds.indexOf(championId);
    if (pendingIndex < 0) {
      fail(
        'no_pending_spell_upgrade',
        `Champion "${championId}" has no pending upgrade.`,
        commandIndex,
      );
    }
    const member = this.team.find((candidate) => candidate.championId === championId);
    if (!member)
      fail('invalid_champion', `Champion "${championId}" is not on the team.`, commandIndex);
    const maximum = slot === 'R' ? 3 : 5;
    if (member.spellRanks[slot] >= maximum) {
      fail('spell_rank_max', `Spell ${slot} is already at maximum rank.`, commandIndex);
    }
    member.spellRanks[slot]++;
    this.pendingSpellUpgradeChampionIds.splice(pendingIndex, 1);
  }

  private queueAugmentChoices(): void {
    const allIds = Object.keys(AUGMENT_DATABASE);
    this.pendingAugmentIds = allIds
      .filter((id) => {
        const definition = AUGMENT_DATABASE[id];
        const stacks = this.augmentIds.filter((ownedId) => ownedId === id).length;
        if (stacks === 0 && new Set(this.augmentIds).size >= DEFAULT_MAX_AUGMENTS) return false;
        return definition.stackable ? stacks < definition.maxStacks : stacks === 0;
      })
      .sort()
      .slice((this.runLevel * 3) % Math.max(1, allIds.length - 3), 3);
  }

  private addItem(item: Item): string | null {
    if (this.inventory.length >= MAX_INVENTORY_ITEMS) return null;
    if (!validateItemAddition(this.inventory, item).valid) return null;
    const instanceId = `item_${this.attempt.runUuid}_${this.nextItemInstanceId}`;
    this.nextItemInstanceId++;
    this.inventory.push({ instanceId, item, equippedToChampionId: null });
    return instanceId;
  }

  private getAugmentManager(): AugmentManager {
    const manager = new AugmentManager(Math.max(4, this.augmentIds.length));
    for (const id of this.augmentIds) {
      const definition = AUGMENT_DATABASE[id];
      if (definition) manager.acquireAugment(definition);
    }
    manager.biomesCleared = this.currentBiomeIndex;
    return manager;
  }

  private addChampion(championId: string, statMultiplier: number): void {
    this.team.push({
      championId,
      currentHp: null,
      level: 1,
      currentXp: 0,
      statBoosts: {},
      statMultiplier,
      spellRanks: { Q: 1, W: 1, E: 1, R: 1 },
    });
    this.ensureStats(championId);
  }

  private requireRecruitable(championId: string, commandIndex: number): void {
    if (!IMPLEMENTED_CHAMPION_IDS.has(championId) || !championDB.getById(championId)) {
      fail('invalid_champion', `Unknown champion "${championId}".`, commandIndex);
    }
    if (this.team.length >= MAX_TEAM_SIZE) fail('team_full', 'Team is full.', commandIndex);
    if (this.team.some((member) => member.championId === championId)) {
      fail('duplicate_champion', `Champion "${championId}" is already on the team.`, commandIndex);
    }
  }

  private claimPending(commandIndex: number): void {
    if (!this.pending) fail('invalid_encounter', 'No encounter is pending.', commandIndex);
    if (this.pending.claimed) {
      fail('encounter_already_claimed', 'Encounter action was already consumed.', commandIndex);
    }
    this.pending.claimed = true;
  }

  private requirePendingNode(
    nodeId: string,
    expectedType: NodeType | null,
    commandIndex: number,
    combatFamily = false,
  ): void {
    const pending = this.pending;
    if (!pending || pending.node.id !== nodeId || this.currentNodeId !== nodeId) {
      fail(
        'wrong_pending_node',
        `Command node_id "${nodeId}" is not the pending node.`,
        commandIndex,
      );
    }
    if (
      expectedType !== null &&
      (combatFamily
        ? ![NodeType.Combat, NodeType.Elite, NodeType.Boss].includes(pending.node.type)
        : pending.node.type !== expectedType)
    ) {
      fail('wrong_encounter_type', `Command does not match node "${nodeId}".`, commandIndex);
    }
  }

  private requireBetweenEncounters(commandIndex: number): void {
    if (this.pending) {
      fail('encounter_pending', 'This command is not allowed during an encounter.', commandIndex);
    }
  }

  private getMemberMaxHp(member: AuthorityTeamMember): number {
    const champion = championDB.getById(member.championId);
    if (!champion) return 100;
    const bonuses = enhancementService.calculateStatBonuses(
      enhancementTreeProvider.getTreeForChampion(champion),
      this.attempt.enhancementSnapshot[member.championId] ?? {},
    );
    return calculateMaxHP(
      champion,
      member.level,
      bonuses,
      this.inventory,
      member.championId,
      member.statBoosts,
      member.statMultiplier,
    );
  }

  private ensureStats(championId: string): ChampionRunStats {
    let entry = this.stats.get(championId);
    if (!entry) {
      entry = { championId, kills: 0, totalDamage: 0, survived: false };
      this.stats.set(championId, entry);
    }
    return entry;
  }

  private toRunNodeType(nodeType: NodeType): AuthorityRunSnapshot['pendingNodeType'] {
    if (nodeType === NodeType.Start || nodeType === NodeType.Exit) return null;
    return nodeType;
  }
}

export function replayAuthorityRun(
  attempt: AuthorityRunAttempt,
  trace: readonly unknown[],
): AuthorityReplayResult {
  if (!Array.isArray(trace)) fail('invalid_trace', 'Trace must be an array.');
  if (trace.length > MAX_COMMANDS) fail('trace_too_large', 'Trace contains too many commands.');
  const state = new AuthorityReplayState(attempt);
  for (let index = 0; index < trace.length; index++) {
    state.apply(parseCommand(trace[index], index), index);
  }
  return {
    engineVersion: AUTHORITY_ENGINE_VERSION,
    snapshot: state.snapshot(),
    commandCount: trace.length,
  };
}

export function verifyAuthorityRun(
  attempt: AuthorityRunAttempt,
  trace: readonly unknown[],
  options: AuthorityVerificationOptions = {},
): AuthorityVerificationResult {
  try {
    const result = replayAuthorityRun(attempt, trace);
    if ((options.requireTerminal ?? true) && !result.snapshot.terminal) {
      fail('run_not_terminal', 'Verified progression requires a terminal run.');
    }
    return { ok: true, result };
  } catch (error) {
    if (error instanceof AuthorityRunVerificationError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          commandIndex: error.commandIndex,
        },
      };
    }
    throw error;
  }
}
