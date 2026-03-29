// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of champions in a team */
export const MAX_TEAM_SIZE = 5;

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
    difficultyMultiplier: 1.1,
    nodeCount: { min: 6, max: 8 },
  },
  river: {
    id: 'river',
    name: 'River',
    description: 'Treacherous waters home to elemental drakes and scuttle crabs.',
    icon: '🌊',
    difficultyMultiplier: 1.3,
    nodeCount: { min: 4, max: 6 },
  },
  base: {
    id: 'base',
    name: 'Enemy Base',
    description: 'The final stronghold. Defeat the enemy Nexus to win!',
    icon: '🏰',
    difficultyMultiplier: 1.5,
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

// ─── Run State ──────────────────────────────────────────────────────────────

/** Serializable team member (stores only the champion ID) */
export interface TeamMember {
  championId: string;
}

/** The full state of a single roguelike run */
export interface RunState {
  /** Whether a run is currently active */
  isActive: boolean;
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
  /** Current gold amount */
  gold: number;
  /** Current wave number within the current biome */
  currentWave: number;
  /** Total waves completed across the entire run */
  totalWavesCompleted: number;
}

// ─── Run Store Actions ──────────────────────────────────────────────────────

export interface RunActions {
  /** Start a new run with champion IDs (validated ≤ MAX_TEAM_SIZE) */
  startRun: (championIds: string[]) => void;
  /** End the current run and reset state */
  endRun: () => void;
  /** Add a champion to the team (if not full). Returns true if added. */
  addChampion: (championId: string) => boolean;
  /** Remove a champion from the team by champion ID */
  removeChampion: (championId: string) => void;
  /** Replace the entire team (capped at MAX_TEAM_SIZE) */
  setTeam: (championIds: string[]) => void;
  /** Advance to the next biome */
  advanceBiome: (nextBiome: Biome) => void;
  /** Add an item to inventory (not equipped). Returns the instance ID. */
  addItem: (item: Item) => string;
  /** Remove an item by instance ID */
  removeItem: (instanceId: string) => void;
  /** Equip an item to a champion */
  equipItem: (instanceId: string, championId: string) => void;
  /** Unequip an item (move to bag) */
  unequipItem: (instanceId: string) => void;
  /** Add gold */
  addGold: (amount: number) => void;
  /** Spend gold (returns false if insufficient) */
  spendGold: (amount: number) => boolean;
  /** Advance to the next wave */
  nextWave: () => void;
  /** Increment the run level */
  incrementRunLevel: () => void;
}

export type RunStore = RunState & RunActions;
