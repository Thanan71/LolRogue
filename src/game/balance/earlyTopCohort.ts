import type { AuthorityCombatSummary, AuthorityDifficulty } from '@/game/authority/types';
import type {
  AuthorityCohortResult,
  AuthorityCohortRun,
  AuthorityCohortRuntime,
} from './authorityCohort';
import { createBalanceReproductionCommand, simulateAuthorityCohort } from './authorityCohort';
import type { AuthorityCohortCell } from './authorityCohortMatrix';
import { createAuthorityCohortMatrix } from './authorityCohortMatrix';
import { createAuthorityCohortSeeds } from './authorityCohortProfiles';
import {
  type AuthorityCohortNumericSummary,
  createAuthorityCohortReport,
} from './authorityCohortReport';
import { survivalGreedyPolicy } from './balancePolicy';

export const EARLY_TOP_COHORT_SCHEMA_VERSION = 1 as const;
export const EARLY_TOP_COHORT_SEED_COUNT = 30 as const;
export const EARLY_TOP_COHORT_STARTER_IDS = Object.freeze([
  'Annie',
  'Ashe',
  'Darius',
  'Garen',
  'Jinx',
  'Leona',
  'Lux',
  'Malphite',
  'Soraka',
  'Warwick',
] as const);
export const EARLY_TOP_COHORT_DIFFICULTIES = Object.freeze([
  'easy',
  'normal',
  'hard',
] as const satisfies readonly AuthorityDifficulty[]);
export const EARLY_TOP_COHORT_SEEDS = Object.freeze([
  ...createAuthorityCohortSeeds(EARLY_TOP_COHORT_SEED_COUNT),
]);

export type EarlyTopStarterId = (typeof EARLY_TOP_COHORT_STARTER_IDS)[number];

export interface EarlyTopExtremeSeed {
  readonly seed: number;
  readonly value: number;
  readonly reproductionCommand: string;
}

export interface EarlyTopCohortCellReport {
  readonly scenarioId: string;
  readonly stratumFingerprint: string;
  readonly difficulty: AuthorityDifficulty;
  readonly starterId: EarlyTopStarterId;
  readonly sampleSize: number;
  readonly run: {
    readonly wins: number;
    readonly winRate: number;
  };
  readonly firstCombat: {
    readonly observations: number;
    readonly wins: number;
    readonly winRate: number;
    readonly finalHpMeanRatio: number;
    readonly finalMpMeanRatio: number;
  };
  readonly earlyTop: {
    /** Terminal defeats in Top during combat indexes 0, 1 or 2. */
    readonly terminalDeathsWithinFirstThreeCombats: number;
    readonly terminalDeathRate: number;
    readonly totalTerminalTopDeaths: number;
    readonly byEncounter: ReadonlyArray<{
      readonly encounterId: string;
      readonly count: number;
    }>;
  };
  readonly resources: {
    readonly hpInitialMeanRatio: number;
    readonly hpFinalMeanRatio: number;
    readonly mpInitialMeanRatio: number;
    readonly mpFinalMeanRatio: number;
  };
  readonly economy: {
    readonly goldEarned: AuthorityCohortNumericSummary;
    readonly finalGold: AuthorityCohortNumericSummary;
  };
  readonly affordability: {
    readonly shopVisits: number;
    readonly visitsWithAnyAffordableOfferRate: number;
    readonly allOffersAffordableRate: number;
  };
  readonly extremeSeeds: {
    readonly leastProgress: EarlyTopExtremeSeed;
    readonly mostProgress: EarlyTopExtremeSeed;
    readonly lowestFirstCombatHp: EarlyTopExtremeSeed;
    readonly highestFirstCombatHp: EarlyTopExtremeSeed;
    readonly representativeEarlyTopDeath: EarlyTopExtremeSeed | null;
    readonly representativeRunWin: EarlyTopExtremeSeed | null;
  };
}

export interface EarlyTopCohortDifficultySummary {
  readonly difficulty: AuthorityDifficulty;
  readonly sampleSize: number;
  readonly runWins: number;
  readonly runWinRate: number;
  readonly firstCombatWins: number;
  readonly firstCombatWinRate: number;
  readonly earlyTopDeathsWithinFirstThreeCombats: number;
  readonly earlyTopDeathRate: number;
}

export interface EarlyTopCohortDocument {
  readonly schemaVersion: typeof EARLY_TOP_COHORT_SCHEMA_VERSION;
  readonly authority: {
    readonly engineVersion: string;
    readonly contentHash: string;
  };
  readonly policy: typeof survivalGreedyPolicy.manifest;
  readonly source: {
    readonly kind: 'early-top-authority-cohort';
    readonly seeds: readonly number[];
    readonly starterIds: readonly EarlyTopStarterId[];
    readonly difficulties: readonly AuthorityDifficulty[];
    readonly cellCount: number;
    readonly runsPerCell: number;
  };
  readonly summary: {
    readonly totalRuns: number;
    readonly runWins: number;
    readonly runWinRate: number;
    readonly byDifficulty: readonly EarlyTopCohortDifficultySummary[];
  };
  readonly reports: readonly EarlyTopCohortCellReport[];
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function combatResourceMean(
  combat: AuthorityCombatSummary | undefined,
  resource: 'hp' | 'mp',
  phase: 'initial' | 'final',
): number {
  if (!combat) return 0;
  const ratios = combat.playerTeam[phase].flatMap((member) => {
    const maximum = resource === 'hp' ? member.maxHp : member.maxMp;
    const current = resource === 'hp' ? member.currentHp : member.currentMp;
    return maximum > 0 ? [current / maximum] : [];
  });
  return mean(ratios);
}

function compareProgress(left: AuthorityCohortRun, right: AuthorityCohortRun): number {
  return (
    Number(left.result.snapshot.won) - Number(right.result.snapshot.won) ||
    left.result.snapshot.biomesVisited.length - right.result.snapshot.biomesVisited.length ||
    left.result.snapshot.totalWavesCompleted - right.result.snapshot.totalWavesCompleted ||
    left.result.combatSummaries.length - right.result.combatSummaries.length ||
    left.seed - right.seed
  );
}

function extremeSeed(
  cohort: AuthorityCohortResult,
  run: AuthorityCohortRun,
  value: number,
): EarlyTopExtremeSeed {
  return {
    seed: run.seed,
    value,
    reproductionCommand: createBalanceReproductionCommand(
      {
        id: cohort.scenarioId,
        difficulty: cohort.stratum.difficulty,
        team: cohort.stratum.team.composition,
        masterySnapshot: cohort.stratum.masterySnapshot,
        runeIds: cohort.stratum.runeIds,
        enhancementSnapshot: cohort.stratum.enhancementSnapshot,
      },
      run.seed,
      cohort.authority,
      undefined,
      cohort.policy,
    ),
  };
}

function earlyTopTerminalCombat(run: AuthorityCohortRun): AuthorityCombatSummary | null {
  if (run.result.snapshot.endReason !== 'defeat') return null;
  let combatIndex = -1;
  for (let index = run.result.combatSummaries.length - 1; index >= 0; index--) {
    if (run.result.combatSummaries[index]?.winner === 'enemy') {
      combatIndex = index;
      break;
    }
  }
  const combat = run.result.combatSummaries[combatIndex];
  return combat && combat.biome === 'top_lane' && combatIndex < 3 ? combat : null;
}

function createCellReport(cohort: AuthorityCohortResult): EarlyTopCohortCellReport {
  const report = createAuthorityCohortReport(cohort);
  const starterId = cohort.stratum.team.composition[0]?.championId;
  if (!EARLY_TOP_COHORT_STARTER_IDS.includes(starterId as EarlyTopStarterId)) {
    throw new Error(`Unexpected early Top starter "${starterId ?? 'missing'}".`);
  }
  const firstCombats = cohort.runs.flatMap((run) => run.result.combatSummaries.slice(0, 1));
  const firstCombatWins = firstCombats.filter((combat) => combat.winner === 'player').length;
  const earlyDeaths = cohort.runs.flatMap((run) => {
    const combat = earlyTopTerminalCombat(run);
    return combat ? [{ run, combat }] : [];
  });
  const earlyByEncounter = new Map<string, number>();
  for (const { combat } of earlyDeaths) {
    earlyByEncounter.set(combat.encounterId, (earlyByEncounter.get(combat.encounterId) ?? 0) + 1);
  }
  const leastProgress = [...cohort.runs].sort(compareProgress)[0]!;
  const progressOrdered = [...cohort.runs].sort(compareProgress);
  const mostProgress = progressOrdered[progressOrdered.length - 1]!;
  const firstCombatHp = (run: AuthorityCohortRun) =>
    combatResourceMean(run.result.combatSummaries[0], 'hp', 'final');
  const byFirstCombatHp = [...cohort.runs].sort(
    (left, right) => firstCombatHp(left) - firstCombatHp(right) || left.seed - right.seed,
  );
  const firstRunWin = cohort.runs.find((run) => run.result.snapshot.won);

  return {
    scenarioId: cohort.scenarioId,
    stratumFingerprint: cohort.stratum.fingerprint,
    difficulty: cohort.stratum.difficulty,
    starterId: starterId as EarlyTopStarterId,
    sampleSize: cohort.runs.length,
    run: {
      wins: report.outcome.wins,
      winRate: report.outcome.winRate,
    },
    firstCombat: {
      observations: firstCombats.length,
      wins: firstCombatWins,
      winRate: firstCombats.length === 0 ? 0 : firstCombatWins / firstCombats.length,
      finalHpMeanRatio: mean(
        firstCombats.map((combat) => combatResourceMean(combat, 'hp', 'final')),
      ),
      finalMpMeanRatio: mean(
        firstCombats.map((combat) => combatResourceMean(combat, 'mp', 'final')),
      ),
    },
    earlyTop: {
      terminalDeathsWithinFirstThreeCombats: earlyDeaths.length,
      terminalDeathRate: earlyDeaths.length / cohort.runs.length,
      totalTerminalTopDeaths: report.deaths.byLocation
        .filter((location) => location.biome === 'top_lane')
        .reduce((total, location) => total + location.count, 0),
      byEncounter: [...earlyByEncounter]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([encounterId, count]) => ({ encounterId, count })),
    },
    resources: {
      hpInitialMeanRatio: report.resources.hp.initialMeanRatio,
      hpFinalMeanRatio: report.resources.hp.finalMeanRatio,
      mpInitialMeanRatio: report.resources.mp.initialMeanRatio,
      mpFinalMeanRatio: report.resources.mp.finalMeanRatio,
    },
    economy: {
      goldEarned: report.economy.goldEarned,
      finalGold: report.economy.finalGold,
    },
    affordability: {
      shopVisits: report.shops.visits,
      visitsWithAnyAffordableOfferRate: report.shops.visitsWithAnyAffordableOfferRate,
      allOffersAffordableRate: report.shops.allOffers.affordableRate,
    },
    extremeSeeds: {
      leastProgress: extremeSeed(
        cohort,
        leastProgress,
        leastProgress.result.snapshot.totalWavesCompleted,
      ),
      mostProgress: extremeSeed(
        cohort,
        mostProgress,
        mostProgress.result.snapshot.totalWavesCompleted,
      ),
      lowestFirstCombatHp: extremeSeed(
        cohort,
        byFirstCombatHp[0]!,
        firstCombatHp(byFirstCombatHp[0]!),
      ),
      highestFirstCombatHp: extremeSeed(
        cohort,
        byFirstCombatHp[byFirstCombatHp.length - 1]!,
        firstCombatHp(byFirstCombatHp[byFirstCombatHp.length - 1]!),
      ),
      representativeEarlyTopDeath: earlyDeaths[0]
        ? extremeSeed(cohort, earlyDeaths[0].run, earlyDeaths[0].combat.combatIndex)
        : null,
      representativeRunWin: firstRunWin
        ? extremeSeed(cohort, firstRunWin, firstRunWin.result.snapshot.totalWavesCompleted)
        : null,
    },
  };
}

export function createEarlyTopCohortCells(): readonly AuthorityCohortCell[] {
  return createAuthorityCohortMatrix({
    difficulties: EARLY_TOP_COHORT_DIFFICULTIES,
    teamProfiles: EARLY_TOP_COHORT_STARTER_IDS.map((championId) => ({
      id: `solo-${championId.toLowerCase()}`,
      team: [{ championId }],
    })),
    masteryProfiles: [{ id: 'none', masterySnapshot: {} }],
    runeProfiles: [{ id: 'none', runeIds: [] }],
    enhancementProfiles: [{ id: 'none', enhancementSnapshot: {} }],
    policies: [survivalGreedyPolicy],
  });
}

export function generateEarlyTopCohortDocument(
  authority: AuthorityCohortRuntime,
): EarlyTopCohortDocument {
  const cells = createEarlyTopCohortCells();
  const reports = cells.map((cell) =>
    createCellReport(
      simulateAuthorityCohort({
        authority,
        policy: cell.policy,
        scenario: cell.scenario,
        seeds: EARLY_TOP_COHORT_SEEDS,
      }),
    ),
  );
  const byDifficulty = EARLY_TOP_COHORT_DIFFICULTIES.map((difficulty) => {
    const cellsForDifficulty = reports.filter((report) => report.difficulty === difficulty);
    const sampleSize = cellsForDifficulty.reduce((total, report) => total + report.sampleSize, 0);
    const runWins = cellsForDifficulty.reduce((total, report) => total + report.run.wins, 0);
    const firstCombatObservations = cellsForDifficulty.reduce(
      (total, report) => total + report.firstCombat.observations,
      0,
    );
    const firstCombatWins = cellsForDifficulty.reduce(
      (total, report) => total + report.firstCombat.wins,
      0,
    );
    const earlyTopDeathsWithinFirstThreeCombats = cellsForDifficulty.reduce(
      (total, report) => total + report.earlyTop.terminalDeathsWithinFirstThreeCombats,
      0,
    );
    return {
      difficulty,
      sampleSize,
      runWins,
      runWinRate: sampleSize === 0 ? 0 : runWins / sampleSize,
      firstCombatWins,
      firstCombatWinRate:
        firstCombatObservations === 0 ? 0 : firstCombatWins / firstCombatObservations,
      earlyTopDeathsWithinFirstThreeCombats,
      earlyTopDeathRate: sampleSize === 0 ? 0 : earlyTopDeathsWithinFirstThreeCombats / sampleSize,
    };
  });
  const totalRuns = reports.reduce((total, report) => total + report.sampleSize, 0);
  const runWins = reports.reduce((total, report) => total + report.run.wins, 0);

  return {
    schemaVersion: EARLY_TOP_COHORT_SCHEMA_VERSION,
    authority: {
      engineVersion: authority.engineVersion,
      contentHash: authority.contentHash,
    },
    policy: { ...survivalGreedyPolicy.manifest },
    source: {
      kind: 'early-top-authority-cohort',
      seeds: [...EARLY_TOP_COHORT_SEEDS],
      starterIds: [...EARLY_TOP_COHORT_STARTER_IDS],
      difficulties: [...EARLY_TOP_COHORT_DIFFICULTIES],
      cellCount: reports.length,
      runsPerCell: EARLY_TOP_COHORT_SEED_COUNT,
    },
    summary: {
      totalRuns,
      runWins,
      runWinRate: totalRuns === 0 ? 0 : runWins / totalRuns,
      byDifficulty,
    },
    reports,
  };
}
