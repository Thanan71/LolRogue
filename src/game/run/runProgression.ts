import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { AugmentTier, DEFAULT_MAX_AUGMENTS } from '@/types/inventory';
import { createScopedRunRng } from '@/utils/runRandom';

export const RUN_START_LEVEL = 1;
export const RUN_START_WAVE = 1;
export const AUGMENT_CHOICES_PER_BIOME = 3;

export const AUGMENT_TIER_WEIGHTS: Record<AugmentTier, number> = {
  [AugmentTier.Silver]: 60,
  [AugmentTier.Gold]: 30,
  [AugmentTier.Prismatic]: 10,
};

export interface RunProgressionCounters {
  runLevel: number;
  currentWave: number;
  totalWavesCompleted: number;
}

export interface BiomeProgressionTransition extends RunProgressionCounters {
  currentBiomeIndex: number;
  pendingAugmentIds: string[];
}

export function completeCombatProgression(
  counters: RunProgressionCounters,
): RunProgressionCounters {
  const totalWavesCompleted = counters.totalWavesCompleted + 1;
  return {
    runLevel: counters.runLevel,
    currentWave: totalWavesCompleted + 1,
    totalWavesCompleted,
  };
}

function isAugmentEligible(augmentId: string, ownedAugmentIds: readonly string[]): boolean {
  const definition = AUGMENT_DATABASE[augmentId];
  if (!definition) return false;

  const stacks = ownedAugmentIds.filter((ownedId) => ownedId === augmentId).length;
  const distinctOwned = new Set(ownedAugmentIds).size;
  if (stacks === 0 && distinctOwned >= DEFAULT_MAX_AUGMENTS) return false;
  if (
    (definition.prerequisites ?? []).some((requiredId) => !ownedAugmentIds.includes(requiredId))
  ) {
    return false;
  }
  return definition.stackable ? stacks < definition.maxStacks : stacks === 0;
}

export function generateAugmentChoices(input: {
  seed: number;
  completedBiomeIndex: number;
  runLevel: number;
  ownedAugmentIds: readonly string[];
  count?: number;
}): string[] {
  const count = Math.max(0, Math.trunc(input.count ?? AUGMENT_CHOICES_PER_BIOME));
  const rng = createScopedRunRng(
    input.seed,
    `augment:${input.completedBiomeIndex}:level:${input.runLevel}`,
  );
  const candidates = Object.keys(AUGMENT_DATABASE)
    .filter((id) => isAugmentEligible(id, input.ownedAugmentIds))
    .sort()
    .map((id) => ({
      id,
      weight: AUGMENT_TIER_WEIGHTS[AUGMENT_DATABASE[id].tier],
    }));
  const choices: string[] = [];

  while (choices.length < count && candidates.length > 0) {
    const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = rng.next() * totalWeight;
    let selectedIndex = candidates.length - 1;
    for (let index = 0; index < candidates.length; index++) {
      roll -= candidates[index].weight;
      if (roll < 0) {
        selectedIndex = index;
        break;
      }
    }
    const [selected] = candidates.splice(selectedIndex, 1);
    if (selected) choices.push(selected.id);
  }

  return choices;
}

export function transitionToNextBiome(input: {
  seed: number;
  currentBiomeIndex: number;
  biomeCount: number;
  counters: RunProgressionCounters;
  ownedAugmentIds: readonly string[];
}): BiomeProgressionTransition | null {
  const nextBiomeIndex = input.currentBiomeIndex + 1;
  if (nextBiomeIndex >= input.biomeCount) return null;

  const runLevel = nextBiomeIndex + RUN_START_LEVEL;
  return {
    ...input.counters,
    currentBiomeIndex: nextBiomeIndex,
    runLevel,
    pendingAugmentIds: generateAugmentChoices({
      seed: input.seed,
      completedBiomeIndex: input.currentBiomeIndex,
      runLevel,
      ownedAugmentIds: input.ownedAugmentIds,
    }),
  };
}
