/**
 * A boss victory ends the run only when there is no following biome.
 */
export function isFinalRunVictory(isBossNode: boolean, advancedToNextBiome: boolean): boolean {
  return isBossNode && !advancedToNextBiome;
}
