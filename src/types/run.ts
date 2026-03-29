// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of champions in a team */
export const MAX_TEAM_SIZE = 5;

// ─── Biome ──────────────────────────────────────────────────────────────────

export const BIOMES = [
  'forest',
  'desert',
  'tundra',
  'volcano',
  'swamp',
  'ruins',
  'abyss',
] as const;

export type Biome = (typeof BIOMES)[number];

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
