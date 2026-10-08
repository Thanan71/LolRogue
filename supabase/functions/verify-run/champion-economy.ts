/** Facts from the trusted terminal replay, never from the request body. */
export interface VerifiedEconomyResult {
  version: 1;
  waves_completed: number;
  biomes_completed: number;
}

export function buildVerifiedEconomyResult(
  snapshot: Record<string, unknown>,
): VerifiedEconomyResult | null {
  const waves = snapshot.totalWavesCompleted;
  const biomeIndex = snapshot.currentBiomeIndex;
  if (
    snapshot.terminal !== true ||
    typeof snapshot.won !== 'boolean' ||
    typeof waves !== 'number' ||
    !Number.isSafeInteger(waves) ||
    waves < 0 ||
    waves > 10000 ||
    typeof biomeIndex !== 'number' ||
    !Number.isSafeInteger(biomeIndex) ||
    biomeIndex < 0 ||
    biomeIndex > 5 ||
    (snapshot.won && (biomeIndex !== 5 || waves === 0))
  )
    return null;
  // Entering the next biome validates the previous Exit/Boss. The final Base
  // biome is completed only by terminal victory, not by merely visiting it.
  return {
    version: 1,
    waves_completed: waves,
    biomes_completed: biomeIndex + (snapshot.won ? 1 : 0),
  };
}
