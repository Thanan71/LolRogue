import { championDB } from '@/data/championDatabase';
import { ITEM_DATABASE } from '@/data/items';
import { ChampionInstance } from '@/game/ChampionInstance';
import { validateItemAddition } from '@/game/inventory/inventoryRules';
import { getBiomeBoss, getRandomEncounter } from '@/game/map/encounters';
import type { CombatEncounter, EnemyDefinition } from '@/game/map/types';
import { NodeType } from '@/game/map/types';
import type { ItemDefinition } from '@/types/inventory';
import {
  BIOME_INFO,
  type Biome,
  type InventoryEntry,
  type Item,
  type ItemStatBonuses,
  MAX_INVENTORY_ITEMS,
} from '@/types/run';
import type { AuthorityDifficulty } from '@/types/runAttempt';
import { createScopedRunRng } from '@/utils/runRandom';
import { calculateXpGain } from '@/utils/xpSystem';
import { DIFFICULTY_RULES } from './difficultyRules';
import { drawItemDefinitionForBiome } from './itemDropRules';
import { getStarterBudgetProfile } from './starterBudget';

export { DIFFICULTY_RULES } from './difficultyRules';

export const COMBAT_ENCOUNTER_RULESET_VERSION = 7;
export const BIOME_DIFFICULTY_STAT_BUDGET_WEIGHT = 0.25;
const COMBAT_REWARD_RNG_VERSION = 6;

const NODE_RULES: Record<
  NodeType.Combat | NodeType.Elite | NodeType.Boss,
  {
    enemyStatMultiplier: number;
    enemyLevelBonus: number;
    mechanic: 'standard' | 'elite_pressure' | 'boss_phase';
  }
> = {
  [NodeType.Combat]: {
    enemyStatMultiplier: 1,
    enemyLevelBonus: 0,
    mechanic: 'standard',
  },
  [NodeType.Elite]: {
    enemyStatMultiplier: 1.05,
    enemyLevelBonus: 1,
    mechanic: 'elite_pressure',
  },
  [NodeType.Boss]: {
    enemyStatMultiplier: 1.1,
    enemyLevelBonus: 1,
    mechanic: 'boss_phase',
  },
};

export const TOP_LANE_NODE_PRESSURE: Readonly<
  Record<NodeType.Combat | NodeType.Elite | NodeType.Boss, number>
> = {
  [NodeType.Combat]: 0.84,
  [NodeType.Elite]: 0.52,
  [NodeType.Boss]: 0.65,
};

const BIOME_REINFORCEMENTS: Record<Biome, EnemyDefinition> = {
  top_lane: { championId: 'Malphite', statMultiplier: 0.34 },
  jungle: { championId: 'Warwick', statMultiplier: 0.65 },
  mid_lane: { championId: 'Annie', statMultiplier: 0.65 },
  bot_lane: { championId: 'Leona', statMultiplier: 0.65 },
  river: { championId: 'Soraka', statMultiplier: 0.65 },
  base: { championId: 'Darius', statMultiplier: 0.75 },
};

export interface ResolvedCombatEnemy {
  championId: string;
  level: number;
  statMultiplier: number;
  healthMultiplier: number;
  damageMultiplier: number;
}

export interface ResolvedCombatReward {
  gold: number;
  xpPerChampion: number;
  xpPolicy: 'all_team_members_including_ko';
  itemDropChance: number;
  droppedItem: Item | null;
  dropBlockedByCapacity: boolean;
}

export interface ResolvedCombatEncounter {
  rulesetVersion: number;
  starterBudget: ReturnType<typeof getStarterBudgetProfile>;
  encounterId: string;
  biome: Biome;
  nodeType: NodeType.Combat | NodeType.Elite | NodeType.Boss;
  mechanic: 'standard' | 'elite_pressure' | 'boss_phase';
  enemies: ResolvedCombatEnemy[];
  reward: ResolvedCombatReward;
}

export interface ResolveCombatEncounterInput {
  seed: number | null;
  nodeId: string;
  biome: Biome;
  nodeType: NodeType.Combat | NodeType.Elite | NodeType.Boss;
  wave: number;
  runLevel: number;
  difficulty: AuthorityDifficulty;
  encounter: CombatEncounter;
  inventory: readonly InventoryEntry[];
  bonusGold?: number;
  /** Immutable size of the team at run start; later recruits do not change this budget. */
  starterTeamSize?: number;
}

function roundMultiplier(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function itemDefinitionToRunItem(definition: ItemDefinition): Item {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    iconUrl: definition.iconUrl,
    stats: definition.stats.reduce<ItemStatBonuses>((stats, bonus) => {
      const key = bonus.stat as keyof ItemStatBonuses;
      stats[key] = (stats[key] ?? 0) + bonus.value;
      return stats;
    }, {}),
    passiveId: definition.passive?.id,
    goldValue: definition.goldValue,
  };
}

function resolveDrop(
  input: ResolveCombatEncounterInput,
  itemDropChance: number,
): Pick<ResolvedCombatReward, 'droppedItem' | 'dropBlockedByCapacity'> {
  const rng = createScopedRunRng(
    input.seed,
    `combat-reward:v${COMBAT_REWARD_RNG_VERSION}:${input.nodeId}:${input.wave}:${input.runLevel}`,
  );
  if (rng.next() >= itemDropChance) {
    return { droppedItem: null, dropBlockedByCapacity: false };
  }
  if (input.inventory.length >= MAX_INVENTORY_ITEMS) {
    return { droppedItem: null, dropBlockedByCapacity: true };
  }

  const eligible = Object.values(ITEM_DATABASE)
    .filter((definition) => validateItemAddition(input.inventory, definition).valid)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (eligible.length === 0) {
    return { droppedItem: null, dropBlockedByCapacity: true };
  }
  const definition = drawItemDefinitionForBiome(eligible, input.biome, input.nodeType, () =>
    rng.next(),
  );
  return {
    droppedItem: definition ? itemDefinitionToRunItem(definition) : null,
    dropBlockedByCapacity: definition === undefined,
  };
}

/**
 * Versioned source of truth used by the UI and the authority replay.
 * Every enemy stat is scaled through ChampionInstance's stat multiplier.
 */
export function resolveCombatEncounter(
  input: ResolveCombatEncounterInput,
): ResolvedCombatEncounter {
  const difficulty = DIFFICULTY_RULES[input.difficulty];
  const starterBudget = getStarterBudgetProfile(input.starterTeamSize ?? 1);
  const node = NODE_RULES[input.nodeType];
  const lanePressure = input.biome === 'top_lane' ? TOP_LANE_NODE_PRESSURE[input.nodeType] : 1;
  const biomeMultiplier =
    1 + (BIOME_INFO[input.biome].difficultyMultiplier - 1) * BIOME_DIFFICULTY_STAT_BUDGET_WEIGHT;
  const wave = Math.max(1, Math.trunc(input.wave));
  const runLevel = clamp(Math.trunc(input.runLevel), 1, 18);
  const progressionMultiplier = 1 + (runLevel - 1) * 0.01 + (wave - 1) * 0.0025;
  const defaultEnemyLevel = clamp(
    runLevel + Math.floor((wave - 1) / 10) + node.enemyLevelBonus,
    1,
    18,
  );
  const enemies = input.encounter.enemies.map((enemy) => ({
    championId: enemy.championId,
    level: clamp(Math.trunc(enemy.level ?? defaultEnemyLevel), 1, 18),
    statMultiplier: roundMultiplier(
      Math.max(0.1, enemy.statMultiplier) *
        starterBudget.enemyFormationMultiplier *
        biomeMultiplier *
        node.enemyStatMultiplier *
        lanePressure *
        progressionMultiplier,
    ),
    healthMultiplier: difficulty.enemyHealthMultiplier,
    damageMultiplier: difficulty.enemyDamageMultiplier,
  }));
  const itemDropChance =
    input.biome === 'base' && input.nodeType === NodeType.Boss
      ? 1
      : clamp(input.encounter.itemDropChance * difficulty.dropMultiplier, 0, 1);
  const drop = resolveDrop(input, itemDropChance);

  return {
    rulesetVersion: COMBAT_ENCOUNTER_RULESET_VERSION,
    starterBudget,
    encounterId: input.encounter.id,
    biome: input.biome,
    nodeType: input.nodeType,
    mechanic: node.mechanic,
    enemies,
    reward: {
      gold: Math.max(
        0,
        Math.round(input.encounter.goldReward * difficulty.goldMultiplier) +
          Math.max(0, Math.round(input.bonusGold ?? 0)),
      ),
      xpPerChampion: calculateXpGain(
        runLevel,
        input.nodeType === NodeType.Elite,
        input.nodeType === NodeType.Boss,
      ),
      xpPolicy: 'all_team_members_including_ko',
      itemDropChance,
      ...drop,
    },
  };
}

export function buildResolvedEnemyTeam(encounter: ResolvedCombatEncounter): ChampionInstance[] {
  const instances: ChampionInstance[] = [];
  for (const enemy of encounter.enemies) {
    const champion = championDB.getById(enemy.championId);
    if (champion) {
      instances.push(
        new ChampionInstance(champion, enemy.level, enemy.statMultiplier, {
          healthMultiplier: enemy.healthMultiplier,
          damageMultiplier: enemy.damageMultiplier,
        }),
      );
    }
  }
  return instances;
}

/**
 * Generates the node's immutable combat content. Runtime scaling and rewards
 * remain in resolveCombatEncounter because wave and inventory are path state.
 */
export function createCombatEncounterForNode(
  biome: Biome,
  runLevel: number,
  nodeType: NodeType.Combat | NodeType.Elite | NodeType.Boss,
  rand: () => number,
): CombatEncounter {
  if (nodeType === NodeType.Boss) {
    const boss = getBiomeBoss(biome, runLevel);
    const enemies =
      boss.enemies.length > 1
        ? boss.enemies
        : [...boss.enemies, { ...BIOME_REINFORCEMENTS[biome] }];
    return {
      ...boss,
      id: `${boss.id}_boss`,
      name: `${boss.name} — Boss`,
      description: `${boss.description} A reinforced formation protects this phase.`,
      enemies,
      goldReward: Math.max(boss.goldReward, Math.round(boss.goldReward * 1.25)),
      itemDropChance: Math.min(1, boss.itemDropChance * 1.25),
    };
  }

  const base = getRandomEncounter(biome, runLevel, rand);
  if (nodeType === NodeType.Combat) return { ...base };

  const enemies =
    base.enemies.length > 1
      ? base.enemies.map((enemy) => ({
          ...enemy,
          statMultiplier: enemy.statMultiplier * 1.08,
        }))
      : [...base.enemies, { ...BIOME_REINFORCEMENTS[biome] }];
  return {
    ...base,
    id: `${base.id}_elite`,
    name: `${base.name} — Elite`,
    description: `${base.description} An elite reinforcement joins the encounter.`,
    enemies,
    goldReward: Math.round(base.goldReward * 1.5),
    itemDropChance: Math.min(1, base.itemDropChance * 1.5),
  };
}
