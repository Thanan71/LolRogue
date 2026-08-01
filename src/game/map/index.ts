/**
 * Map Module Index
 *
 * Procedural map generation and navigation system.
 */

// Canonical, stateless event outcome rules
export { resolveAffordableEventOutcome, resolveEventOutcome } from './eventOutcome';

// Encounter pools
export {
  BASE_ENCOUNTERS,
  BOT_LANE_ENCOUNTERS,
  ENCOUNTER_POOLS,
  getBiomeBoss,
  getEligibleEncounters,
  getRandomEncounter,
  JUNGLE_ENCOUNTERS,
  MID_LANE_ENCOUNTERS,
  RIVER_ENCOUNTERS,
  TOP_LANE_ENCOUNTERS,
} from './encounters';

// Generator
export { generateMap, generateRunMap } from './MapGenerator-core';

// Helpers
export {
  buildConfig,
  getNodeMetadata,
  mulberry32,
  selectColumnType,
} from './MapGenerator-helpers';

// Utilities
export {
  completeNode,
  countRemainingEncounters,
  findNode,
  getAccessibleNodes,
  getCombatNodes,
  getEventNodes,
  getNextOptions,
  getNodesInColumn,
  getRecruitNodes,
  getRestNodes,
  getShopNodes,
  isMapComplete,
} from './mapUtils';
// Types
export * from './types';
