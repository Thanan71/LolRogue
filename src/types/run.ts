import type { PendingRunAttemptStart, RunAuthorityAttempt, RunCommandInput } from './runAttempt';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of champions in a team */
export const MAX_TEAM_SIZE = 5;

/** Maximum number of items a champion can have equipped */
export const MAX_ITEMS_PER_CHAMPION = 6;
export const MAX_INVENTORY_ITEMS = 20;

// ─── Biome (LoL Lane Zones) ─────────────────────────────────────────────────

/**
 * The 6 lane-based zones in a LoL roguelike run.
 * Each zone has unique encounters, themes, and difficulty scaling.
 */
export const BIOMES = [
  'top_lane',
  'jungle',
  'mid_lane',
  'bot_lane',
  'river',
  'base', // Boss zone
] as const;

export type Biome = (typeof BIOMES)[number];

/** Display metadata for each biome */
export interface BiomeInfo {
  id: Biome;
  name: string;
  description: string;
  icon: string; // emoji or icon identifier
  difficultyMultiplier: number;
  /** Number of nodes in this biome's map */
  nodeCount: { min: number; max: number };
}

export const BIOME_INFO: Record<Biome, BiomeInfo> = {
  top_lane: {
    id: 'top_lane',
    name: 'Top Lane',
    description: 'A lonely path guarded by powerful duelists and tanks.',
    icon: '🛡️',
    difficultyMultiplier: 1.0,
    nodeCount: { min: 6, max: 8 },
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle',
    description: 'Dense forests filled with beasts and elusive assassins.',
    icon: '🌿',
    difficultyMultiplier: 1.1,
    nodeCount: { min: 7, max: 10 },
  },
  mid_lane: {
    id: 'mid_lane',
    name: 'Mid Lane',
    description: 'The central corridor where mages and assassins clash.',
    icon: '⚡',
    difficultyMultiplier: 1.2,
    nodeCount: { min: 5, max: 7 },
  },
  bot_lane: {
    id: 'bot_lane',
    name: 'Bot Lane',
    description: 'A duo lane defended by marksmen and their supports.',
    icon: '🏹',
    difficultyMultiplier: 1.25,
    nodeCount: { min: 6, max: 8 },
  },
  river: {
    id: 'river',
    name: 'River',
    description: 'Treacherous waters home to elemental drakes and scuttle crabs.',
    icon: '🌊',
    difficultyMultiplier: 1.4,
    nodeCount: { min: 4, max: 6 },
  },
  base: {
    id: 'base',
    name: 'Enemy Base',
    description: 'The final stronghold. Defeat the enemy Nexus to win!',
    icon: '🏰',
    difficultyMultiplier: 1.6,
    nodeCount: { min: 3, max: 4 },
  },
};

// ─── Item ───────────────────────────────────────────────────────────────────

/** Stat bonuses that an item can provide */
export interface ItemStatBonuses {
  hp?: number;
  atk?: number;
  def?: number;
  ap?: number;
  spd?: number;
  crit?: number;
}

/** An item collected during a run */
export interface Item {
  id: string;
  name: string;
  description: string;
  iconUrl: string;
  /** Stat bonuses applied to the equipped champion */
  stats: ItemStatBonuses;
  /** Optional unique passive effect identifier */
  passiveId?: string;
  /** Gold value (for selling) */
  goldValue: number;
}

// ─── Inventory ──────────────────────────────────────────────────────────────

/** An item owned in inventory, optionally equipped to a champion */
export interface InventoryEntry {
  /** Unique instance ID (differs from Item.id when duplicates exist) */
  instanceId: string;
  /** Reference to the item definition */
  item: Item;
  /** Champion ID this item is equipped to, or null if in bag */
  equippedToChampionId: string | null;
}

// ─── Run Map ────────────────────────────────────────────────────────────────

/** Node type for map nodes (mirrors the enum strings in game/map/types) */
export type NodeType =
  | 'combat'
  | 'elite'
  | 'shop'
  | 'rest'
  | 'event'
  | 'boss'
  | 'recruit'
  | 'treasure';

// ─── Run State ──────────────────────────────────────────────────────────────

/** Serializable team member (stores champion ID + persisted combat state) */
export interface TeamMember {
  championId: string;
  /** Current HP (persisted between combats). If undefined, defaults to max at combat start. */
  currentHp?: number;
  /** Current mana (persisted between combats). If undefined, defaults to max at combat start. */
  currentMp?: number;
  /** Champion level (persisted between combats). Defaults to 1. */
  level?: number;
  /** Current XP toward next level (persisted between combats). Defaults to 0. */
  currentXp?: number;
  /** Stat boosts gained from events during the run (persisted between combats) */
  statBoosts?: Record<string, number>;
  /** Base-stat quality rolled when this champion was recruited. */
  statMultiplier?: number;
  spellRanks?: Partial<Record<'Q' | 'W' | 'E' | 'R', number>>;
}

export interface RunSaveDiagnostic {
  attemptId: string;
  engineVersion: string;
  rejectionCode: string;
}

/** The full state of a single roguelike run */
export interface RunState {
  /** Whether a run is currently active */
  isActive: boolean;
  /** Normal progression or the shared daily challenge. */
  mode: 'normal' | 'daily';
  /** Unique ID for this run instance (used to prevent stale timeouts from affecting new runs) */
  runId: string;
  /** Deterministic seed used to generate this run */
  seed: number | null;
  /** ISO timestamp persisted so a reloaded run can still be saved */
  startedAt: string | null;
  /** Server-owned attempt and append-only command journal for an authenticated run. */
  authorityAttempt: RunAuthorityAttempt | null;
  /** Stable start command retained when the start RPC response is uncertain. */
  pendingAuthorityStart: PendingRunAttemptStart | null;
  /** Prevents duplicate completion/reward processing. */
  isEnding: boolean;
  /** Current persistence state for the completed run. */
  saveStatus: 'idle' | 'saving' | 'saved' | 'failed' | 'retrying';
  saveError: string | null;
  saveFailureKind: 'retryable' | 'terminal' | null;
  saveDiagnostic: RunSaveDiagnostic | null;
  /**
   * Immutable completion payload. It is created before the first save attempt,
   * persisted for retries/reloads, and kept for the Game Over screen until the
   * next run starts.
   */
  completedRunSnapshot: CompletedRunSnapshot | null;
  /** Canonical progression granted by the server for an authenticated run. */
  serverProgression: ServerRunProgression | null;
  /** Prevents rewards from being granted again when retrying a failed save. */
  rewardsApplied: boolean;
  /** Versioned, persistent source of truth for combat and economy statistics. */
  ledger: RunLedger;
  /** Monotonic counter used for deterministic, collision-free item instance IDs. */
  nextItemInstanceId: number;
  /** The team of up to 5 champions */
  team: TeamMember[];
  /** Current run level (acts as difficulty/progression indicator) */
  runLevel: number;
  /** List of biome IDs traversed in this run */
  biomesVisited: Biome[];
  /** Current biome the player is in */
  currentBiome: Biome | null;
  /** Inventory of items (some equipped, some in bag) */
  inventory: InventoryEntry[];
  /** Rune loadout selected before the run. */
  runeIds: string[];
  /** Run-persistent stacks for runes whose catalogue duration is permanent. */
  runeStacks: Record<string, Record<string, number>>;
  /** Augments acquired during the run. */
  augmentIds: string[];
  /** Augment choices awaiting a player decision. */
  pendingAugmentIds: string[];
  lastCombatRewards: {
    xp: number;
    gold: number;
    itemName: string | null;
    itemBlockedByCapacity: boolean;
    levelsGained: number;
  } | null;
  pendingSpellUpgradeChampionIds: string[];
  /** Current gold amount */
  gold: number;
  /** Next global combat wave number; it never resets between biomes. */
  currentWave: number;
  /** Total waves completed across the entire run */
  totalWavesCompleted: number;

  // ── Map state (using NodeMap from game/map/types) ──

  /** All biome maps for this run (one per biome, in order) */
  biomeMaps: import('@/game/map/types').NodeMap[];
  /** Index of the current biome map */
  currentBiomeIndex: number;
  /** ID of the current node within the current biome map */
  currentNodeId: string | null;
  /** Exact nodes that may be selected next from the current position. */
  frontierNodeIds: string[];
  /** Ordered nodes selected by the player; sibling branches never enter this path. */
  chosenPathNodeIds: string[];
  /** IDs of nodes that have been completed (across all biomes) */
  completedNodeIds: string[];
  /** Encounter rewards/actions already consumed, persisted across refreshes. */
  claimedEncounterNodeIds: string[];
  /** Persistent per-shop visit and offer consumption state. */
  shopNodeStates: Record<
    string,
    {
      visited: boolean;
      purchasedItemIds: string[];
      recruitedChampionIds: string[];
    }
  >;

  /** Currently active encounter (null if no encounter pending) */
  pendingEncounter: { nodeId: string; nodeType: NodeType } | null;
  /** The encounter data for the current combat (enemies, rewards, etc.) */
  currentEncounter: import('@/game/map/types').CombatEncounter | null;
  /** Persisted marker proving that this encounter already entered combat. */
  combatCheckpointNodeId: string | null;
  /** Rehydration-only flag forcing deterministic autoplay after an interrupted combat. */
  combatRecoveryRequired: boolean;
}

export type RunLifecycleErrorCode =
  | 'active_run'
  | 'active_run_another_tab'
  | 'start_in_progress'
  | 'auth_not_ready'
  | 'invalid_team_size'
  | 'duplicate_champion'
  | 'unknown_champion'
  | 'unsupported_champion'
  | 'invalid_starter_count'
  | 'secure_command_unavailable'
  | 'start_failed'
  | 'account_changed'
  | 'stale_run'
  | 'finalization_in_progress'
  | 'finalization_failed';

export type RunStartResult =
  | { success: true; runId: string; mode: RunState['mode'] }
  | {
      success: false;
      code: RunLifecycleErrorCode;
      error: string;
      retryable: boolean;
    };

export type RunEndResult =
  | {
      success: true;
      runId: string;
      outcome: 'saved' | 'already_finalized' | 'terminal';
    }
  | {
      success: false;
      runId: string;
      code: RunLifecycleErrorCode;
      error: string;
      retryable: boolean;
    };

export type RunMutationErrorCode =
  | 'invalid_amount'
  | 'invalid_stat_multiplier'
  | 'insufficient_gold'
  | 'inventory_full'
  | 'unknown_item'
  | 'unique_item'
  | 'max_stacks'
  | 'team_full'
  | 'invalid_team_size'
  | 'duplicate_champion'
  | 'unknown_champion'
  | 'unsupported_champion'
  | 'champion_not_in_team'
  | 'item_not_found'
  | 'item_already_equipped'
  | 'equipment_full'
  | 'invalid_encounter'
  | 'invalid_offer'
  | 'offer_consumed'
  | 'command_rejected';

export type RunMutationResult<T> =
  | { success: true; value: T }
  | {
      success: false;
      code: RunMutationErrorCode;
      error: string;
      retryable: boolean;
    };

// ─── Run Store Actions ──────────────────────────────────────────────────────

export interface RunActions {
  /** Start a new run with champion IDs (validated ≤ MAX_TEAM_SIZE) */
  startRun: (
    championIds: string[],
    options?: {
      mode?: RunState['mode'];
      seed?: number;
      runeIds?: string[];
      difficulty?: import('./runAttempt').AuthorityDifficulty;
    },
  ) => Promise<RunStartResult>;
  /** Append one validated semantic command to the authenticated attempt journal. */
  recordRunCommand: (command: RunCommandInput, dedupeKey?: string) => boolean;
  /** Mark combat entry before the first turn so refresh cannot grant a free retry. */
  markCombatStarted: (nodeId: string) => void;
  /** End the current run and reset state, optionally marking it as won.
   *  If expectedRunId is provided, only ends the run if it matches the current runId. */
  endRun: (
    won?: boolean,
    expectedRunId?: string,
    displayedSummary?: RunSummary,
  ) => Promise<RunEndResult>;
  /** Add a champion to the team, with an explicit failure reason. */
  addChampion: (
    championId: string,
    statMultiplier?: number,
  ) => RunMutationResult<{ championId: string }>;
  /** Remove a champion while preserving a non-empty active team. */
  removeChampion: (championId: string) => RunMutationResult<{ championId: string }>;
  /** Replace the entire team only when every team invariant passes. */
  setTeam: (championIds: string[]) => RunMutationResult<{ championIds: string[] }>;
  /** Add an item to inventory (not equipped), with an explicit failure reason. */
  addItem: (item: Item, context?: RunLedgerContext) => RunMutationResult<{ instanceId: string }>;
  /** Remove an item by instance ID */
  removeItem: (instanceId: string) => void;
  /** Consume exact one-use item instances after the combat rule bus used them. */
  consumeItems: (instanceIds: readonly string[], context?: RunLedgerContext) => void;
  /** Persist permanent rune stacks exported by the combat rule bus. */
  setRuneStacks: (stacks: Record<string, Record<string, number>>) => void;
  /** Equip an item only to a current team member and within catalogue/slot constraints. */
  equipItem: (instanceId: string, championId: string) => boolean;
  /** Unequip an item (move to bag), returning false if the command cannot be recorded. */
  unequipItem: (instanceId: string) => boolean;
  /** Sell an item for half its shop value. */
  sellItem: (instanceId: string) => boolean;
  /** Sort inventory by equipment state, rarity, then name. */
  sortInventory: () => void;
  /** Acquire one of the pending augment choices. */
  chooseAugment: (augmentId: string) => boolean;
  setLastCombatRewards: (rewards: RunState['lastCombatRewards']) => void;
  /** Queue every currently legal choice and return the number actually queued. */
  queueSpellUpgrades: (championIds: string[]) => number;
  upgradeSpell: (championId: string, slot: 'Q' | 'W' | 'E' | 'R') => boolean;
  /** Add gold, rejecting non-positive or non-finite amounts. */
  addGold: (amount: number, context?: RunLedgerContext) => RunMutationResult<{ balance: number }>;
  /** Spend gold, rejecting invalid amounts and insufficient balances. */
  spendGold: (amount: number, context?: RunLedgerContext) => RunMutationResult<{ balance: number }>;
  /** Atomically append the effective deltas from one resolved combat. */
  commitCombatEvents: (events: readonly import('@/game/battle/types').BattleEvent[]) => void;
  /** Atomically account for one won combat in wave progression. */
  completeCombatProgression: () => void;
  /** Atomically reserve the current encounter reward/action once. */
  claimCurrentEncounter: () => boolean;

  /** Generate the full run map (all biome maps) and set position to start */
  generateRunMap: (seed?: number) => void;
  /** Move to a specific node on the map (validates accessibility) */
  moveToNode: (nodeId: string) => boolean;
  /** Complete a legacy structural Start node and expose its frontier. */
  completeCurrentNode: () => boolean;
  /** Start an encounter for a given node (sets pendingEncounter and currentEncounter) */
  startEncounter: (nodeId: string, nodeType: NodeType) => boolean;
  /** Resolve the current encounter (clears it and completes the node). */
  resolveEncounter: () => boolean;
  /** Advance to the next biome map */
  advanceToNextBiome: () => boolean;
  /** Validate, journal, debit and add a canonical shop item in one state update. */
  purchaseCurrentShopItem: (offerId: string) => RunMutationResult<{ instanceId: string }>;
  /** Validate, journal, debit and recruit a canonical shop champion in one state update. */
  purchaseCurrentShopChampion: (championId: string) => RunMutationResult<{ championId: string }>;
  /** Get the current biome's NodeMap */
  getCurrentMap: () => import('@/game/map/types').NodeMap | null;
  /** Get the current MapNode */
  getCurrentNode: () => import('@/game/map/types').MapNode | null;
  /** Update team member HP/level/xp after combat ends */
  updateTeamAfterCombat: (
    updates: {
      championId: string;
      currentHp?: number;
      currentMp?: number;
      level: number;
      currentXp: number;
      statBoosts?: Record<string, number>;
    }[],
  ) => void;
}

export type RunStore = RunState & RunActions;

// ─── Per-Champion Run Statistics ──────────────────────────────────────

/** Stats tracked per champion during a run */
export interface ChampionRunStats {
  championId: string;
  /** Total kills attributed to this champion */
  kills: number;
  /** Enemy takedowns contributed to without landing the final hit. */
  assists: number;
  /** Total damage dealt by this champion */
  totalDamage: number;
  /** Damage absorbed by enemy shields. */
  damageToShields: number;
  /** Effective HP damage received. */
  damageReceived: number;
  /** Effective healing applied to allies or self. */
  healingDone: number;
  /** Effective healing received. */
  healingReceived: number;
  /** Healing lost because the target was already near maximum HP. */
  overhealing: number;
  /** Shield points granted. */
  shieldingDone: number;
  /** Granted shield points that actually absorbed damage. */
  shieldingAbsorbed: number;
  /** Number of defeats suffered during the run. */
  deaths: number;
  /** Item IDs equipped by this champion at least once during the run. */
  itemsCollected: string[];
  /** Whether this champion survived the run */
  survived: boolean;
}

export type RunItemLedgerAction =
  | 'found'
  | 'bought'
  | 'sold'
  | 'equipped'
  | 'unequipped'
  | 'consumed';

export type RunLedgerSource =
  | 'combat'
  | 'shop'
  | 'event'
  | 'treasure'
  | 'rest'
  | 'recruit'
  | 'inventory'
  | 'legacy';

export interface RunItemLedgerEvent {
  sequence: number;
  action: RunItemLedgerAction;
  source: RunLedgerSource;
  itemId: string;
  instanceId: string;
  championId: string | null;
  goldAmount: number;
  nodeId: string | null;
  wave: number;
}

export interface RunChampionLedger {
  kills: number;
  assists: number;
  damageDealt: number;
  damageToShields: number;
  damageReceived: number;
  healingDone: number;
  healingReceived: number;
  overhealing: number;
  shieldingDone: number;
  shieldingAbsorbed: number;
  deaths: number;
}

export interface RunLedger {
  version: 1;
  champions: Record<string, RunChampionLedger>;
  gold: {
    earned: number;
    spent: number;
  };
  items: RunItemLedgerEvent[];
  nextItemEventSequence: number;
}

export interface RunLedgerContext {
  source: RunLedgerSource;
  nodeId?: string | null;
  wave?: number;
}

// ─── Run Summary (shown on Game Over screen) ──────────────────────────

/** Complete summary of a finished run */
export interface RunSummary {
  /** Whether the run was won (true) or lost (false) */
  won: boolean;
  /** Total waves completed */
  wavesCompleted: number;
  /** Biomes visited */
  biomesVisited: Biome[];
  /** Per-champion stats */
  championStats: ChampionRunStats[];
  /** Total kills across all champions */
  totalKills: number;
  /** Total damage across all champions */
  totalDamage: number;
  /** Gold earned during the run */
  goldEarned: number;
  /** Gold spent during the run. */
  goldSpent: number;
  /** Final gold balance. */
  goldBalance: number;
  /** Immutable item history used by UI, persistence and analytics. */
  itemEvents: RunItemLedgerEvent[];
  /** Run level reached */
  runLevel: number;
}

/** Serializable team facts sent to the completed-run command. */
export interface RunSaveTeamMember {
  championId: string;
  level: number;
  currentHp: number;
  currentMp: number;
}

/** Resources captured from the live combat before its page can unmount. */
export interface FinalCombatantState {
  championId: string;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
}

/** Immutable local display snapshot captured when a run first ends. */
export interface RunSavePayload {
  runId: string;
  won: boolean;
  runLevel: number;
  wavesCompleted: number;
  biomesVisited: Biome[];
  goldEarned: number;
  goldSpent: number;
  goldBalance: number;
  summary: RunSummary;
  teamMembers: RunSaveTeamMember[];
  startedAt: string | null;
  seed: number | null;
  runeIds: string[];
  augmentIds: string[];
  ledger: RunLedger;
}

/** Daily-specific facts frozen alongside the normal completed-run payload. */
export interface DailyRunCompletionSnapshot {
  dateKey: string;
  dailySeed: number;
  /** True when the player voluntarily ended the attempt outside a terminal fight. */
  abandoned: boolean;
  itemCount: number;
  currentBiome: Biome | null;
  currentWave: number;
  inventory: InventoryEntry[];
  score: number;
}

/** Complete immutable representation of a run at its first completion attempt. */
export interface CompletedRunSnapshot extends RunSavePayload {
  mode: RunState['mode'];
  daily: DailyRunCompletionSnapshot | null;
}

/** Canonical progression outcome returned by the authoritative server command. */
export interface ServerRunProgression {
  runId: string;
  replayed: boolean;
  candiesEarned: number;
  candiesPerChampion: number;
  progressionVersion: number;
  progressionSource: 'verified';
}
