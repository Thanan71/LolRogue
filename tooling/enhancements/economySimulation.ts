import { canUnlockNode, ENHANCEMENT_TREES_BY_ROLE } from '../../src/data/enhancementTrees';
import { getEnhancementNodeUnavailableReasons } from '../../src/game/rules/catalogSupport';
import {
  calculateRunCandyAllocation,
  calculateRunCandyBudget,
} from '../../src/game/run/runRewardPolicy';
import { MASTERY_THRESHOLDS, MAX_MASTERY_LEVEL } from '../../src/types/mastery';
import { SeededRNG } from '../../src/utils/seededRandom';
import { auditEnhancementGraphs } from './graphAudit';

/** Stylized saving cohorts: assumptions, never measured player retention or balance approval. */
export const ENHANCEMENT_ECONOMY_ASSUMPTIONS = {
  seed: 20261022,
  cohortSize: 128,
  horizonWeeks: 52,
  teamSize: 6,
  victory: { wavesCompleted: 22, biomesVisited: 6 },
  defeat: { minimumWaves: 1, maximumWaves: 20, wavesPerBiome: 4 },
  immediateAbandonProbability: 0.05,
  profiles: [
    {
      id: 'casual',
      runsPerWeek: 3,
      assumedMinutesPerRun: 35,
      victoryProbability: { easy: 0.45, normal: 0.25, hard: 0.12 },
    },
    {
      id: 'regular',
      runsPerWeek: 10,
      assumedMinutesPerRun: 35,
      victoryProbability: { easy: 0.75, normal: 0.5, hard: 0.3 },
    },
  ],
} as const;

type Difficulty = 'easy' | 'normal' | 'hard';
export interface EconomyGoal {
  id: string;
  candyCost: number;
  requiredMasteryLevel: number;
  available: boolean;
}
export interface EconomyCohortOptions {
  seed: number;
  cohortSize: number;
  horizonWeeks: number;
  teamSize: number;
  runsPerWeek: number;
  assumedMinutesPerRun: number;
  victoryProbability: number;
  immediateAbandonProbability: number;
}

function safeCount(value: number, name: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new Error(`Invalid economy assumption: ${name}`);
}

function quantiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) =>
    sorted.length ? sorted[Math.ceil(fraction * sorted.length) - 1] : null;
  return {
    minimum: sorted[0] ?? null,
    p10: at(0.1),
    median: at(0.5),
    p90: at(0.9),
    maximum: sorted[sorted.length - 1] ?? null,
  };
}

/** Each goal is an independent saving scenario; costs are not claimed to fund all goals together. */
export function simulateEnhancementSavings(
  goals: readonly EconomyGoal[],
  options: EconomyCohortOptions,
) {
  safeCount(options.cohortSize, 'cohortSize', 4096);
  safeCount(options.horizonWeeks, 'horizonWeeks', 104);
  safeCount(options.teamSize, 'teamSize', 6);
  safeCount(options.runsPerWeek, 'runsPerWeek', 35);
  safeCount(options.assumedMinutesPerRun, 'assumedMinutesPerRun', 240);
  if (!Number.isSafeInteger(options.seed)) throw new Error('Invalid economy assumption: seed');
  for (const probability of [options.victoryProbability, options.immediateAbandonProbability])
    if (!Number.isFinite(probability) || probability < 0 || probability > 1)
      throw new Error('Invalid economy probability');
  if (new Set(goals.map((goal) => goal.id)).size !== goals.length)
    throw new Error('Duplicate economy goal');
  for (const goal of goals)
    if (
      !Number.isSafeInteger(goal.candyCost) ||
      goal.candyCost < 0 ||
      !Number.isInteger(goal.requiredMasteryLevel) ||
      goal.requiredMasteryLevel < 0 ||
      goal.requiredMasteryLevel > MAX_MASTERY_LEVEL
    )
      throw new Error(`Invalid economy goal: ${goal.id}`);
  const reached = goals.map(() => [] as number[]);
  const balances: number[] = [];
  const masteries: number[] = [];
  const perRun: number[] = [];
  const totalRuns = options.horizonWeeks * options.runsPerWeek;
  for (let player = 0; player < options.cohortSize; player++) {
    const rng = new SeededRNG(options.seed + player * 104729);
    let wallet = 0;
    let masteryCandies = 0;
    const hit = new Set<number>();
    const participants = Array.from({ length: options.teamSize }, (_, index) => ({
      championId: index === 0 ? 'focus' : `teammate-${index}`,
    }));
    for (let run = 1; run <= totalRuns; run++) {
      const abandoned = rng.next() < options.immediateAbandonProbability;
      const won = !abandoned && rng.next() < options.victoryProbability;
      const wavesCompleted = abandoned
        ? 0
        : won
          ? ENHANCEMENT_ECONOMY_ASSUMPTIONS.victory.wavesCompleted
          : rng.nextInt(1, ENHANCEMENT_ECONOMY_ASSUMPTIONS.defeat.maximumWaves);
      const biomesVisited = abandoned ? 0 : won ? 6 : Math.min(5, Math.ceil(wavesCompleted / 4));
      const input = {
        wavesCompleted,
        biomesVisited,
        outcome: abandoned
          ? ('immediate_abandon' as const)
          : won
            ? ('victory' as const)
            : ('defeat' as const),
      };
      const reward = calculateRunCandyBudget(input);
      const allocation = calculateRunCandyAllocation({ ...input, participants });
      const allocated = Object.values(allocation).reduce((sum, value) => sum + value, 0);
      if (allocated !== reward) throw new Error('Candy allocation does not reconcile');
      wallet += reward;
      masteryCandies += allocation.focus ?? 0;
      if (player === 0) perRun.push(reward);
      goals.forEach((goal, index) => {
        if (
          !hit.has(index) &&
          goal.available &&
          wallet >= goal.candyCost &&
          masteryCandies >= MASTERY_THRESHOLDS[goal.requiredMasteryLevel]
        ) {
          reached[index].push(run);
          hit.add(index);
        }
      });
    }
    balances.push(wallet);
    masteries.push(masteryCandies);
  }
  return {
    assumptions: options,
    evidence: 'synthetic-reward-policy' as const,
    savingScenariosAreIndependent: true,
    minutesAreAssumed: true,
    accountWallet: quantiles(balances),
    focusMasteryCandies: quantiles(masteries),
    sampleRunRewards: quantiles(perRun),
    goals: goals.map((goal, index) => ({
      ...goal,
      observations: reached[index].length,
      censoredPlayers: options.cohortSize - reached[index].length,
      runs: quantiles(reached[index]),
      assumedWeeks: quantiles(reached[index].map((run) => run / options.runsPerWeek)),
      assumedHours: quantiles(
        reached[index].map((run) => (run * options.assumedMinutesPerRun) / 60),
      ),
    })),
  };
}

/** Analytical comparison only: the shipped policy remains free until a paid policy is justified. */
export function compareEnhancementResetFees(
  actualSpend: number,
  resetCount: number,
  repairExempt = false,
) {
  if (
    !Number.isSafeInteger(actualSpend) ||
    actualSpend < 0 ||
    !Number.isSafeInteger(resetCount) ||
    resetCount < 0
  )
    throw new Error('Invalid reset accounting input');
  const fee = resetCount === 0 || repairExempt ? 0 : Math.floor(actualSpend / 10);
  return {
    actualSpend,
    resetCount,
    repairExempt,
    free: { fee: 0, refund: actualSpend },
    proposedTenPercent: { fee, refund: actualSpend - fee },
  };
}

export function createEnhancementEconomyReport(
  cohortSize = ENHANCEMENT_ECONOMY_ASSUMPTIONS.cohortSize,
) {
  const graph = auditEnhancementGraphs(Object.values(ENHANCEMENT_TREES_BY_ROLE), {
    maxMasteryLevel: MAX_MASTERY_LEVEL,
    candyBudget: null,
    getUnavailableReasons: getEnhancementNodeUnavailableReasons,
    canUnlockNode,
  });
  const inventory = graph.trees.map((tree) => ({
    role: tree.role,
    catalogueMaximumCandies: tree.catalogueMaximumCandies,
    reachableMaximumCandies: tree.reachableMaximumCandies,
    supportedRanksMaximumCandies: tree.nodes
      .filter((node) => node.maximumRank.reachable)
      .reduce((total, node) => total + node.candyCost * node.maxRanks, 0),
    nodeCosts: tree.nodes.map((node) => ({
      id: node.id,
      costPerRank: node.candyCost,
      maximumRanks: node.maxRanks,
      minimumPathCandies: node.firstRank.requiredCandies,
      maximumTargetRankPathCandies: node.maximumRank.requiredCandies,
      available: node.firstRank.reachable,
    })),
  }));
  const goals: EconomyGoal[] = graph.trees.flatMap((tree) =>
    tree.nodes.map((node) => ({
      id: node.id,
      candyCost: node.maximumRank.requiredCandies ?? 0,
      requiredMasteryLevel: node.minimumMasteryLevel ?? MAX_MASTERY_LEVEL,
      available: node.maximumRank.reachable,
    })),
  );
  const cohorts = ENHANCEMENT_ECONOMY_ASSUMPTIONS.profiles.flatMap((profile) =>
    (['easy', 'normal', 'hard'] as const).map((difficulty: Difficulty) => ({
      profile: profile.id,
      difficulty,
      ...simulateEnhancementSavings(goals, {
        seed: ENHANCEMENT_ECONOMY_ASSUMPTIONS.seed,
        cohortSize,
        horizonWeeks: ENHANCEMENT_ECONOMY_ASSUMPTIONS.horizonWeeks,
        teamSize: ENHANCEMENT_ECONOMY_ASSUMPTIONS.teamSize,
        runsPerWeek: profile.runsPerWeek,
        assumedMinutesPerRun: profile.assumedMinutesPerRun,
        victoryProbability: profile.victoryProbability[difficulty],
        immediateAbandonProbability: ENHANCEMENT_ECONOMY_ASSUMPTIONS.immediateAbandonProbability,
      }),
    })),
  );
  return {
    schemaVersion: 1,
    assumptions: ENHANCEMENT_ECONOMY_ASSUMPTIONS,
    policy: {
      currency: 'Candies',
      championPermanentPurchaseShards: 400,
      officialDailyUsesCommonRoster: true,
      guestHasServerWallet: false,
      shippedRepeatResetFeeBasisPoints: 0,
      pricesChanged: false,
    },
    limitations: [
      'Synthetic saving scenarios, not observed player behavior or human playtests.',
      'Session cadence, duration and failure probabilities are explicit assumptions; elapsed time is not measured.',
      'Difficulty affects modeled completion probabilities only; the actual reward policy has no direct difficulty multiplier.',
      'Each goal uses a separate saving scenario; one wallet cannot fund all reported goals simultaneously.',
      'Unavailable paths are censored; a missing result is never converted to zero time.',
      'A paid reset or changed node price requires cohort review and human playtests; neither is shipped here.',
    ],
    inventory,
    cohorts,
    resetAlternatives: inventory.map((tree) => ({
      role: tree.role,
      ...compareEnhancementResetFees(tree.supportedRanksMaximumCandies, 1),
    })),
  };
}
