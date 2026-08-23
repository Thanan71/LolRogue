import type { SpellSlot } from '@/game/ChampionInstance';
import type { BattleMetrics } from '@/game/battle/types';
import type {
  Biome,
  ChampionRunStats,
  InventoryEntry,
  RunLedger,
  NodeType as RunNodeType,
} from '@/types/run';

export type AuthorityDifficulty = 'easy' | 'normal' | 'hard';
export type AuthorityRunMode = 'normal' | 'daily';

/**
 * Immutable facts supplied by the trusted attempt creator. The browser must
 * never be allowed to choose any of these values for a verified run.
 */
export interface AuthorityRunAttempt {
  /** UUID used by the client inventory counter (`item_${runUuid}_${counter}`). */
  runUuid: string;
  seed: number;
  team: Array<{
    championId: string;
    statMultiplier?: number;
  }>;
  runeIds: string[];
  difficulty: AuthorityDifficulty;
  mode: AuthorityRunMode;
  enhancementSnapshot: Record<string, Record<string, number>>;
  masterySnapshot: Record<string, number>;
}

interface AuthorityCommand<K extends string, P extends Record<string, string>> {
  sequence: number;
  kind: K;
  payload: P;
}

export type MoveNodeCommand = AuthorityCommand<'move_node', { node_id: string }>;
export type ResolveCombatCommand = AuthorityCommand<
  'resolve_combat',
  { node_id: string; actions_json: string }
>;
export type ShopBuyItemCommand = AuthorityCommand<
  'shop_buy_item',
  { node_id: string; item_id: string }
>;
export type ShopRecruitCommand = AuthorityCommand<
  'shop_recruit',
  { node_id: string; champion_id: string }
>;
export type RestCommand = AuthorityCommand<'rest', { node_id: string }>;
export type RecruitCommand = AuthorityCommand<'recruit', { node_id: string }>;
export type EventCommand = AuthorityCommand<'event', { node_id: string }>;
export type TreasureCommand = AuthorityCommand<'treasure', { node_id: string }>;
export type ResolveNodeCommand = AuthorityCommand<'resolve_node', { node_id: string }>;
export type EquipItemCommand = AuthorityCommand<
  'equip_item',
  { instance_id: string; champion_id: string }
>;
export type UnequipItemCommand = AuthorityCommand<'unequip_item', { instance_id: string }>;
export type SellItemCommand = AuthorityCommand<'sell_item', { instance_id: string }>;
export type ChooseAugmentCommand = AuthorityCommand<'choose_augment', { augment_id: string }>;
export type UpgradeSpellCommand = AuthorityCommand<
  'upgrade_spell',
  { champion_id: string; slot: SpellSlot }
>;
export type AbandonRunCommand = AuthorityCommand<'abandon_run', Record<string, never>>;

/** Canonical DB wire format after Edge has removed journal metadata. */
export type AuthorityRunCommand =
  | MoveNodeCommand
  | ResolveCombatCommand
  | ShopBuyItemCommand
  | ShopRecruitCommand
  | RestCommand
  | RecruitCommand
  | EventCommand
  | TreasureCommand
  | ResolveNodeCommand
  | EquipItemCommand
  | UnequipItemCommand
  | SellItemCommand
  | ChooseAugmentCommand
  | UpgradeSpellCommand
  | AbandonRunCommand;

export type AuthorityRunEndReason = 'victory' | 'defeat' | 'draw' | null;

export interface AuthorityTeamMember {
  championId: string;
  currentHp: number | null;
  currentMp: number | null;
  level: number;
  currentXp: number;
  statBoosts: Record<string, number>;
  statMultiplier: number;
  spellRanks: Record<SpellSlot, number>;
}

export type AuthorityPendingNodeType = RunNodeType | 'start' | 'exit';

interface AuthorityPendingEncounterBase<TNodeType extends AuthorityPendingNodeType> {
  nodeId: string;
  nodeType: TNodeType;
  encounterId: string | null;
  claimed: boolean;
}

export interface AuthorityPendingCombatSnapshot
  extends AuthorityPendingEncounterBase<'combat' | 'elite' | 'boss'> {
  encounterId: string;
}

export interface AuthorityShopItemOfferSnapshot {
  itemId: string;
  cost: number;
  consumed: boolean;
  legal: boolean;
}

export interface AuthorityShopRecruitOfferSnapshot {
  championId: string;
  cost: number;
  consumed: boolean;
  legal: boolean;
}

export interface AuthorityPendingShopSnapshot extends AuthorityPendingEncounterBase<'shop'> {
  encounterId: string;
  itemOffers: AuthorityShopItemOfferSnapshot[];
  recruitOffers: AuthorityShopRecruitOfferSnapshot[];
}

export interface AuthorityPendingRestSnapshot extends AuthorityPendingEncounterBase<'rest'> {
  encounterId: string;
  cost: number;
  legal: boolean;
}

export interface AuthorityPendingRecruitSnapshot extends AuthorityPendingEncounterBase<'recruit'> {
  encounterId: string;
  championId: string;
  cost: number;
  legal: boolean;
}

export interface AuthorityPendingEventSnapshot extends AuthorityPendingEncounterBase<'event'> {
  encounterId: string;
}

export interface AuthorityPendingTreasureSnapshot
  extends AuthorityPendingEncounterBase<'treasure'> {
  encounterId: string;
}

export interface AuthorityPendingStructuralSnapshot
  extends AuthorityPendingEncounterBase<'start' | 'exit'> {
  encounterId: null;
}

/** Public, serializable facts needed to choose the next legal encounter command. */
export type AuthorityPendingEncounterSnapshot =
  | AuthorityPendingCombatSnapshot
  | AuthorityPendingShopSnapshot
  | AuthorityPendingRestSnapshot
  | AuthorityPendingRecruitSnapshot
  | AuthorityPendingEventSnapshot
  | AuthorityPendingTreasureSnapshot
  | AuthorityPendingStructuralSnapshot;

export interface AuthorityRunSnapshot {
  runUuid: string;
  seed: number;
  difficulty: AuthorityDifficulty;
  terminal: boolean;
  endReason: AuthorityRunEndReason;
  won: boolean;
  runLevel: number;
  currentBiome: Biome | null;
  currentBiomeIndex: number;
  biomesVisited: Biome[];
  currentNodeId: string | null;
  expectedNodeIds: string[];
  pendingEncounter: AuthorityPendingEncounterSnapshot | null;
  /** @deprecated Use pendingEncounter, which distinguishes structural nodes and offer state. */
  pendingNodeType: RunNodeType | null;
  completedNodeIds: string[];
  team: AuthorityTeamMember[];
  inventory: InventoryEntry[];
  runeIds: string[];
  augmentIds: string[];
  pendingAugmentIds: string[];
  pendingSpellUpgradeChampionIds: string[];
  gold: number;
  currentWave: number;
  totalWavesCompleted: number;
  championStats: ChampionRunStats[];
  totalKills: number;
  totalDamage: number;
  ledger: RunLedger;
  nextSequence: number;
}

export type AuthorityCombatNodeType = Extract<RunNodeType, 'combat' | 'elite' | 'boss'>;
export type AuthorityCombatWinner = 'player' | 'enemy' | 'draw';

/**
 * Immutable, analytics-safe view of one combatant's battle resources.
 * `combatantId` remains unique when an encounter contains duplicate champions.
 */
export interface AuthorityCombatantResources {
  combatantId: string;
  championId: string;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  defeated: boolean;
}

export interface AuthorityCombatTeamResources {
  initial: AuthorityCombatantResources[];
  final: AuthorityCombatantResources[];
}

/** Player resources after post-combat healing, mana recovery and XP. */
export interface AuthorityPostCombatResources {
  championId: string;
  currentHp: number | null;
  maxHp: number;
  currentMp: number | null;
  maxMp: number;
  level: number;
  currentXp: number;
}

export interface AuthorityCombatRewardSummary {
  gold: number;
  xpPerChampion: number;
  itemDropChance: number;
  droppedItemId: string | null;
  dropBlockedByCapacity: boolean;
  /** The deterministic inventory ID, or null when no item was added. */
  droppedItemInstanceId: string | null;
}

/** One immutable record for every successfully replayed `resolve_combat`. */
export interface AuthorityCombatSummary {
  combatIndex: number;
  commandIndex: number;
  nodeId: string;
  encounterId: string;
  nodeType: AuthorityCombatNodeType;
  biome: Biome;
  biomeIndex: number;
  wave: number;
  runLevel: number;
  winner: AuthorityCombatWinner;
  rounds: number;
  metrics: BattleMetrics;
  playerTeam: AuthorityCombatTeamResources;
  enemyTeam: AuthorityCombatTeamResources;
  /** Null after a defeat/draw because no post-combat transition is granted. */
  playerAfterEncounter: AuthorityPostCombatResources[] | null;
  /** Null after a defeat/draw because no reward is granted. */
  reward: AuthorityCombatRewardSummary | null;
}

export interface AuthorityReplayResult {
  engineVersion: string;
  snapshot: AuthorityRunSnapshot;
  commandCount: number;
  combatSummaries: AuthorityCombatSummary[];
}

/**
 * Incremental form of the canonical authority replay. A failed append invalidates
 * the session because a command may have partially mutated its private state
 * before validation rejected it. Callers must then create a fresh session and
 * replay the accepted prefix.
 */
export interface AuthorityReplaySession {
  append(command: unknown): void;
  getResult(): AuthorityReplayResult;
}

export interface AuthorityVerificationFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    commandIndex: number | null;
  };
}

export interface AuthorityVerificationSuccess {
  ok: true;
  result: AuthorityReplayResult;
}

export type AuthorityVerificationResult =
  | AuthorityVerificationFailure
  | AuthorityVerificationSuccess;

export interface AuthorityVerificationOptions {
  /** Defaults to true for progression-granting verification. */
  requireTerminal?: boolean;
}
