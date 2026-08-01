import type { SpellSlot } from '@/game/ChampionInstance';
import type {
  Biome,
  ChampionRunStats,
  InventoryEntry,
  RunLedger,
  NodeType as RunNodeType,
} from '@/types/run';

export type AuthorityDifficulty = 'easy' | 'normal' | 'hard';

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

export interface AuthorityReplayResult {
  engineVersion: string;
  snapshot: AuthorityRunSnapshot;
  commandCount: number;
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
