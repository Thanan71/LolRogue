/**
 * Map Module Index
 *
 * Procedural map generation and navigation system.
 */

// Types
export * from './types';

// Encounter pools
export {
  ENCOUNTER_POOLS,
  getEligibleEncounters,
  getBiomeBoss,
  getRandomEncounter,
  TOP_LANE_ENCOUNTERS,
  JUNGLE_ENCOUNTERS,
  MID_LANE_ENCOUNTERS,
  BOT_LANE_ENCOUNTERS,
  RIVER_ENCOUNTERS,
  BASE_ENCOUNTERS,
} from './encounters';

// Generator
export { generateMap, generateRunMap } from './MapGenerator-core';

// Helpers
export {
  mulberry32,
  getNodeMetadata,
  selectColumnType,
  buildConfig,
} from './MapGenerator-helpers';

// Utilities
export {
  findNode,
  getAccessibleNodes,
  completeNode,
  isMapComplete,
  getNodesInColumn,
  getNextOptions,
  getCombatNodes,
  getShopNodes,
  getRestNodes,
  getEventNodes,
  getRecruitNodes,
  countRemainingEncounters,
} from './mapUtils';

// Encounter Manager
export {
  EncounterManager,
  resolveEventOutcome,
} from './EncounterManager';
