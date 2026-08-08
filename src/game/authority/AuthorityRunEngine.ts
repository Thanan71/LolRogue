import { championDB } from '@/data/championDatabase';
import { decodeCombatActionTrace } from '@/game/battle/actionTrace';
import { BattleManager } from '@/game/battle/BattleManager';
import { BattlePhase, type BattleTeam } from '@/game/battle/types';
import type { ChampionInstance, SpellSlot } from '@/game/ChampionInstance';
import { validateItemAddition, validateItemEquipment } from '@/game/inventory/inventoryRules';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { findNode } from '@/game/map/mapUtils';
import {
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
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import { assertValidRuleCatalogs } from '@/game/rules/catalogValidation';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import { validateAugmentSelection } from '@/game/run/augmentSelectionRules';
import { buildResolvedEnemyTeam, resolveCombatEncounter } from '@/game/run/encounterResolver';
import { resolvePostCombatTeam } from '@/game/run/postCombatRules';
import {
  buildRunPlayerTeam,
  calculateRunMemberMaxHp,
  createRunAugmentManager,
} from '@/game/run/runCombatant';
import {
  getItemSaleGold,
  getShopItemCost,
  getShopRecruitCost,
  resolveEventTeamUpdates,
  resolveRecruitAttempt,
  resolveRestHp,
  resolveRunEvent,
} from '@/game/run/runEncounterRules';
import {
  buildChampionRunStats,
  cloneRunLedger,
  commitCombatEvents,
  createRunLedger,
  ensureLedgerChampion,
  recordGoldGain,
  recordGoldSpend,
  recordItemLedgerEvent,
} from '@/game/run/runLedger';
import { completeCombatProgression, transitionToNextBiome } from '@/game/run/runProgression';
import { canUpgradeSpell, queueSpellUpgradeChoices } from '@/game/run/spellUpgradeRules';
import { validateTeamAddition } from '@/game/run/teamRules';
import {
  type InventoryEntry,
  type Item,
  MAX_INVENTORY_ITEMS,
  MAX_TEAM_SIZE,
  type RunItemLedgerAction,
  type RunLedger,
  type RunLedgerSource,
} from '@/types/run';
import { createScopedRunRng } from '@/utils/runRandom';
import {
  AuthorityRunVerificationError,
  failAuthorityVerification as fail,
  parseRunCommand as parseCommand,
  validateRunAttempt as validateAttempt,
} from './RunCommandValidator';
import type {
  AuthorityReplayResult,
  AuthorityRunAttempt,
  AuthorityRunCommand,
  AuthorityRunEndReason,
  AuthorityRunSnapshot,
  AuthorityTeamMember,
  AuthorityVerificationOptions,
  AuthorityVerificationResult,
} from './types';

export const AUTHORITY_ENGINE_VERSION = 'run-engine-v13';
export const AUTHORITY_CONTENT_HASH =
  'b199f8a3573e2e579ddd6ea508a048e7066b864a32ef9b38c27e8ef6b2350fb1';

assertValidRuleCatalogs();

const MAX_COMMANDS = 10_000;
const MAX_COMBAT_TURNS = 100_000;

type PendingEncounter = {
  node: MapNode;
  claimed: boolean;
  purchasedItemIds: Set<string>;
  recruitedChampionIds: Set<string>;
};

export { AuthorityRunVerificationError } from './RunCommandValidator';

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

class AuthorityReplayState {
  private readonly maps: NodeMap[];
  private ledger: RunLedger;
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
      currentMp: null,
      level: 1,
      currentXp: 0,
      statBoosts: {},
      statMultiplier: member.statMultiplier ?? 1,
      spellRanks: { Q: 1, W: 1, E: 1, R: 1 },
    }));
    this.ledger = createRunLedger(this.team.map((member) => member.championId));
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
        this.resolveCombat(command.payload.actions_json, commandIndex);
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
    const championStats = buildChampionRunStats(this.ledger, this.team);
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
      ledger: cloneRunLedger(this.ledger),
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

  private resolveCombat(actionsJson: string, commandIndex: number): void {
    const pending = this.pending;
    const node = pending?.node;
    const encounter = node?.encounter;
    if (!pending || !node || encounter?.type !== 'combat') {
      fail('invalid_encounter', 'No combat encounter is pending.', commandIndex);
    }
    if (pending.claimed)
      fail('encounter_already_claimed', 'Combat is already resolved.', commandIndex);
    pending.claimed = true;

    const combatNodeType = node.type as NodeType.Combat | NodeType.Elite | NodeType.Boss;
    const players = this.buildPlayerTeam();
    const enemies = buildResolvedEnemyTeam(
      resolveCombatEncounter({
        seed: this.attempt.seed,
        nodeId: node.id,
        biome: node.biome,
        nodeType: combatNodeType,
        wave: this.currentWave,
        runLevel: this.runLevel,
        difficulty: this.attempt.difficulty,
        encounter,
        inventory: this.inventory,
      }),
    );
    if (players.length !== this.team.length || enemies.length === 0) {
      fail('invalid_content', 'Combat contains an unknown champion.', commandIndex);
    }
    const initialHpOverrides: Record<string, number> = {};
    for (const member of this.team) {
      if (member.currentHp !== null) initialHpOverrides[member.championId] = member.currentHp;
    }
    const rng = createScopedRunRng(this.attempt.seed, `combat:${encounter.id ?? node.id}`);
    const usesCanonicalAutoPlay = actionsJson === 'auto';
    const scriptedActions = usesCanonicalAutoPlay ? [] : decodeCombatActionTrace(actionsJson);
    if (!scriptedActions) {
      fail('invalid_combat_action_trace', 'Combat action trace is malformed.', commandIndex);
    }
    let scriptedActionIndex = 0;
    const playerTeam: BattleTeam = { side: 'player', champions: players };
    const enemyTeam: BattleTeam = { side: 'enemy', champions: enemies };
    const battle = new BattleManager(playerTeam, enemyTeam, {
      autoActions: usesCanonicalAutoPlay,
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
    if (!usesCanonicalAutoPlay) {
      battle.setActionCallback(() => {
        const action = scriptedActions[scriptedActionIndex];
        // A legal turn may produce no action (for example while rooted with
        // every spell unavailable). Such a turn is intentionally absent from
        // the compact trace, so reaching its end must not consume a phantom
        // entry and invalidate an otherwise exact replay.
        if (!action) return null;
        scriptedActionIndex++;
        return action?.automatic ? null : (action ?? null);
      });
    }
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
    const replayedActions = battle.getPlayerActionTrace();
    const firstMismatchedActionIndex = replayedActions.findIndex(
      (action, index) =>
        action.type !== scriptedActions[index]?.type ||
        action.targetId !== scriptedActions[index]?.targetId ||
        action.automatic !== scriptedActions[index]?.automatic,
    );
    const unconsumedActions = scriptedActions.slice(scriptedActionIndex);
    const hasValidReplayPrefix =
      replayedActions.length === scriptedActionIndex && firstMismatchedActionIndex === -1;
    const hasOnlyHarmlessAutomaticSuffix = unconsumedActions.every((action) => action.automatic);
    if (!usesCanonicalAutoPlay && (!hasValidReplayPrefix || !hasOnlyHarmlessAutomaticSuffix)) {
      const mismatchIndex =
        firstMismatchedActionIndex !== -1 ? firstMismatchedActionIndex : scriptedActionIndex;
      fail(
        'invalid_combat_action_trace',
        `Combat action trace does not match deterministic replay at action ${mismatchIndex + 1} ` +
          `(received ${JSON.stringify(scriptedActions[mismatchIndex] ?? null)}, ` +
          `replayed ${JSON.stringify(replayedActions[mismatchIndex] ?? null)}).`,
        commandIndex,
      );
    }

    this.ledger = commitCombatEvents(
      this.ledger,
      result.log,
      this.team.map((member) => member.championId),
    );
    for (const finalState of battle.getFinalPlayerStates()) {
      const member = this.team.find((candidate) => candidate.championId === finalState.championId);
      if (member) {
        member.currentHp = finalState.currentHp;
        member.currentMp = finalState.currentMp;
      }
    }
    const consumedItems = new Set(battle.getConsumedItemInstanceIds());
    for (const entry of this.inventory) {
      if (!consumedItems.has(entry.instanceId)) continue;
      this.recordItemEvent('consumed', entry, 'combat', entry.equippedToChampionId);
    }
    this.inventory = this.inventory.filter((entry) => !consumedItems.has(entry.instanceId));
    this.runeStacks = battle.getRuneStacks();

    if (result.winner !== 'player') {
      this.terminal = true;
      this.endReason = result.winner === 'draw' ? 'draw' : 'defeat';
      this.expectedNodeIds = [];
      return;
    }

    const augmentManager = this.getAugmentManager();
    const resolution = resolveCombatEncounter({
      seed: this.attempt.seed,
      nodeId: node.id,
      biome: node.biome,
      nodeType: combatNodeType,
      wave: this.currentWave,
      runLevel: this.runLevel,
      difficulty: this.attempt.difficulty,
      encounter,
      inventory: this.inventory,
      bonusGold: augmentManager.getBonusGold(),
    });
    this.gainGold(resolution.reward.gold);
    const postCombat = resolvePostCombatTeam({
      team: this.team.map((member) => ({
        ...member,
        currentHp: member.currentHp ?? undefined,
        currentMp: member.currentMp ?? undefined,
      })),
      finalPlayerStates: battle.getFinalPlayerStates(),
      xpPerChampion: resolution.reward.xpPerChampion,
      healAfterBattlePercent: augmentManager.getHealAfterBattlePercent(),
      getPreLevelMaxHp: (member) => {
        const authorityMember = this.team.find(
          (candidate) => candidate.championId === member.championId,
        );
        return authorityMember ? this.getMemberMaxHp(authorityMember) : 100;
      },
    });
    for (const update of postCombat.updates) {
      const member = this.team.find((candidate) => candidate.championId === update.championId);
      if (!member) continue;
      member.currentHp = update.currentHp;
      member.currentMp = update.currentMp ?? member.currentMp;
      member.level = update.level;
      member.currentXp = update.currentXp;
    }
    this.pendingSpellUpgradeChampionIds = queueSpellUpgradeChoices(
      this.team,
      this.pendingSpellUpgradeChampionIds,
      postCombat.pendingSpellUpgradeChampionIds,
    );
    const progression = completeCombatProgression({
      runLevel: this.runLevel,
      currentWave: this.currentWave,
      totalWavesCompleted: this.totalWavesCompleted,
    });
    this.currentWave = progression.currentWave;
    this.totalWavesCompleted = progression.totalWavesCompleted;
    if (resolution.reward.droppedItem) {
      this.addItem(resolution.reward.droppedItem, 'found', 'combat');
    }
  }

  private buildPlayerTeam(): ChampionInstance[] {
    return buildRunPlayerTeam(this.team, {
      inventory: this.inventory,
      augmentIds: this.augmentIds,
      currentBiomeIndex: this.currentBiomeIndex,
      getUnlockedEnhancements: (championId) => this.attempt.enhancementSnapshot[championId] ?? {},
      getMasteryLevel: (championId) => this.attempt.masterySnapshot[championId] ?? 0,
    });
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
    const cost = getShopItemCost(
      encounter,
      offer.price,
      this.getAugmentManager().getShopDiscountPercent(),
    );
    if (this.gold < cost) fail('insufficient_gold', 'Not enough gold.', commandIndex);
    this.spendGold(cost);
    pending.purchasedItemIds.add(itemId);
    this.addItem(itemFromShopItem(offer), 'bought', 'shop', cost);
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
    const cost = getShopRecruitCost(encounter, offer.cost);
    if (this.gold < cost) fail('insufficient_gold', 'Not enough gold.', commandIndex);
    this.spendGold(cost);
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
    this.spendGold(encounter.goldCost);
    for (const member of this.team) {
      const maxHp = this.getMemberMaxHp(member);
      member.currentHp = resolveRestHp(member.currentHp, maxHp, encounter);
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
    const result = resolveRecruitAttempt(this.attempt.seed, encounter);
    if (result.success) {
      this.spendGold(result.goldCost);
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
    const outcome = resolveRunEvent(this.attempt.seed, encounter, this.gold);
    switch (outcome.type) {
      case 'gold_reward':
        this.gainGold(Math.max(0, outcome.goldAmount ?? 0));
        break;
      case 'gold_cost':
        this.spendGold(Math.min(this.gold, Math.abs(outcome.goldAmount ?? 0)));
        break;
      case 'item_reward':
        if (outcome.item) this.addItem(itemFromShopItem(outcome.item), 'found', 'event');
        break;
      case 'heal':
        this.team = resolveEventTeamUpdates(outcome, this.team, (member) =>
          this.getMemberMaxHp(member),
        );
        break;
      case 'damage':
        this.team = resolveEventTeamUpdates(outcome, this.team, (member) =>
          this.getMemberMaxHp(member),
        );
        break;
      case 'champion_recruit':
        if (outcome.championId) {
          const addition = validateTeamAddition(this.team, outcome.championId);
          if (addition.valid) this.addChampion(addition.value, 1);
        }
        break;
      case 'stat_boost':
        this.team = resolveEventTeamUpdates(outcome, this.team, (member) =>
          this.getMemberMaxHp(member),
        );
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
    this.gainGold(Math.max(0, encounter.gold));
    if (encounter.item) this.addItem(itemFromShopItem(encounter.item), 'found', 'treasure');
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
    const isFinalBoss =
      node.type === NodeType.Boss && this.currentBiomeIndex === this.maps.length - 1;
    if (isFinalBoss) {
      this.terminal = true;
      this.endReason = 'victory';
      this.expectedNodeIds = [];
    } else if (node.type === NodeType.Exit || node.type === NodeType.Boss) {
      this.advanceBiome(commandIndex);
    }
  }

  private completeNode(node: MapNode): void {
    if (!this.completedNodeIds.includes(node.id)) this.completedNodeIds.push(node.id);
    this.pending = null;
    this.expectedNodeIds = [...node.nextNodeIds];
  }

  private advanceBiome(commandIndex: number): void {
    const progression = transitionToNextBiome({
      seed: this.attempt.seed,
      currentBiomeIndex: this.currentBiomeIndex,
      biomeCount: this.maps.length,
      counters: {
        runLevel: this.runLevel,
        currentWave: this.currentWave,
        totalWavesCompleted: this.totalWavesCompleted,
      },
      ownedAugmentIds: this.augmentIds,
    });
    if (!progression) fail('invalid_progression', 'No next biome exists.', commandIndex);
    const nextMap = this.maps[progression.currentBiomeIndex];
    if (!nextMap) fail('invalid_progression', 'The next biome does not exist.', commandIndex);
    this.currentBiomeIndex = progression.currentBiomeIndex;
    this.currentNodeId = null;
    this.runLevel = progression.runLevel;
    this.currentWave = progression.currentWave;
    this.totalWavesCompleted = progression.totalWavesCompleted;
    this.pendingAugmentIds = progression.pendingAugmentIds;
    this.pending = null;
    this.expectedNodeIds = [nextMap.startNodeId];
  }

  private equipItem(instanceId: string, championId: string, commandIndex: number): void {
    const entry = this.inventory.find((candidate) => candidate.instanceId === instanceId);
    if (!entry) fail('invalid_item', `Unknown item instance "${instanceId}".`, commandIndex);
    const equipment = validateItemEquipment(
      this.inventory,
      this.team.map((member) => member.championId),
      instanceId,
      championId,
    );
    if (!equipment.valid) {
      fail(equipment.code, equipment.message, commandIndex);
    }
    if (entry.equippedToChampionId) {
      this.recordItemEvent('unequipped', entry, 'inventory', entry.equippedToChampionId);
    }
    entry.equippedToChampionId = championId;
    this.recordItemEvent('equipped', entry, 'inventory', championId);
  }

  private unequipItem(instanceId: string, commandIndex: number): void {
    const entry = this.inventory.find((candidate) => candidate.instanceId === instanceId);
    if (!entry || entry.equippedToChampionId === null) {
      fail('invalid_item', 'Item is unknown or not equipped.', commandIndex);
    }
    const previousChampionId = entry.equippedToChampionId;
    entry.equippedToChampionId = null;
    this.recordItemEvent('unequipped', entry, 'inventory', previousChampionId);
  }

  private sellItem(instanceId: string, commandIndex: number): void {
    const index = this.inventory.findIndex((candidate) => candidate.instanceId === instanceId);
    if (index < 0) fail('invalid_item', `Unknown item instance "${instanceId}".`, commandIndex);
    const [entry] = this.inventory.splice(index, 1);
    if (!entry) fail('invalid_item', `Unknown item instance "${instanceId}".`, commandIndex);
    const saleGold = getItemSaleGold(entry.item.goldValue);
    this.gainGold(saleGold);
    this.recordItemEvent('sold', entry, 'inventory', entry.equippedToChampionId, saleGold);
  }

  private chooseAugment(augmentId: string, commandIndex: number): void {
    const validation = validateAugmentSelection(this.pendingAugmentIds, this.augmentIds, augmentId);
    if (!validation.valid) {
      fail(validation.code, validation.message, commandIndex);
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
    if (!canUpgradeSpell(member, slot)) {
      fail(
        'spell_rank_locked',
        `Spell ${slot} cannot be upgraded at champion level ${member.level}.`,
        commandIndex,
      );
    }
    member.spellRanks[slot]++;
    this.pendingSpellUpgradeChampionIds.splice(pendingIndex, 1);
  }

  private addItem(
    item: Item,
    action: 'found' | 'bought',
    source: RunLedgerSource,
    goldAmount = 0,
  ): string | null {
    if (this.inventory.length >= MAX_INVENTORY_ITEMS) return null;
    if (!validateItemAddition(this.inventory, item).valid) return null;
    const instanceId = `item_${this.attempt.runUuid}_${this.nextItemInstanceId}`;
    this.nextItemInstanceId++;
    const entry = { instanceId, item, equippedToChampionId: null };
    this.inventory.push(entry);
    this.recordItemEvent(action, entry, source, null, goldAmount);
    return instanceId;
  }

  private getAugmentManager() {
    return createRunAugmentManager(this.augmentIds, this.currentBiomeIndex);
  }

  private addChampion(championId: string, statMultiplier: number): void {
    this.team.push({
      championId,
      currentHp: null,
      currentMp: null,
      level: 1,
      currentXp: 0,
      statBoosts: {},
      statMultiplier,
      spellRanks: { Q: 1, W: 1, E: 1, R: 1 },
    });
    ensureLedgerChampion(this.ledger, championId);
  }

  private requireRecruitable(championId: string, commandIndex: number): void {
    const validation = validateTeamAddition(this.team, championId);
    if (!validation.valid) {
      fail(validation.code, validation.message, commandIndex);
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
    return calculateRunMemberMaxHp(
      member,
      this.inventory,
      (championId) => this.attempt.enhancementSnapshot[championId] ?? {},
      (championId) => this.attempt.masterySnapshot[championId] ?? 0,
    );
  }

  private gainGold(amount: number): void {
    const gain = Math.max(0, Math.round(amount));
    if (gain === 0) return;
    this.gold += gain;
    this.ledger = recordGoldGain(this.ledger, gain);
  }

  private spendGold(amount: number): void {
    const spend = Math.max(0, Math.round(amount));
    if (spend === 0) return;
    this.gold -= spend;
    this.ledger = recordGoldSpend(this.ledger, spend);
  }

  private recordItemEvent(
    action: RunItemLedgerAction,
    entry: InventoryEntry,
    source: RunLedgerSource,
    championId: string | null,
    goldAmount = 0,
  ): void {
    this.ledger = recordItemLedgerEvent(this.ledger, {
      action,
      itemId: entry.item.id,
      instanceId: entry.instanceId,
      championId,
      goldAmount,
      context: {
        source,
        nodeId: this.currentNodeId,
        wave: this.currentWave,
      },
    });
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
