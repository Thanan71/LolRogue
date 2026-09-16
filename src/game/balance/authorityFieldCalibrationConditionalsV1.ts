import type { ChampionRunStats } from '@/types/run';
import type { AuthorityCohortResult } from './authorityCohort';
import { createAuthorityCohortBaselineKey } from './authorityCohortBaseline';
import {
  type AuthorityCohortWilsonInterval,
  calculateWilsonInterval95,
} from './authorityCohortReport';
import {
  type AuthorityFieldCalibrationBaselineFixtureV1,
  FIELD_CALIBRATION_BASELINE_V1_IDENTITIES,
  FIELD_CALIBRATION_BASELINE_VERSION,
} from './authorityFieldCalibrationBaselineV1';

export const FIELD_CALIBRATION_CONDITIONALS_SCHEMA_VERSION = 1 as const;

export interface AuthorityFieldChampionConditional {
  readonly championId: string;
  readonly cohortSampleSize: number;
  readonly sampleSize: number;
  readonly wins: number;
  readonly participationRate: number;
  readonly winRate: number;
  readonly winRateWilson95: AuthorityCohortWilsonInterval;
  readonly averageFinalLevel: number;
  readonly averageKills: number;
  readonly averageDeaths: number;
  readonly averageDamageDealt: number;
  readonly averageHealingDone: number;
  readonly averageShieldingDone: number;
}

export interface AuthorityFieldAugmentConditional {
  readonly augmentId: string;
  readonly cohortSampleSize: number;
  readonly sampleSize: number;
  readonly wins: number;
  readonly selectionRate: number;
  readonly winRate: number;
  readonly winRateWilson95: AuthorityCohortWilsonInterval;
  readonly averageWavesCompleted: number;
  readonly averageBiomesCompleted: number;
  readonly averageGoldBalance: number;
}

export interface AuthorityFieldConditionalReport {
  readonly scenarioId: string;
  readonly championCohorts: readonly AuthorityFieldChampionConditional[];
  readonly augmentCohorts: readonly AuthorityFieldAugmentConditional[];
}

export interface AuthorityFieldConditionalEntry {
  readonly reports: readonly AuthorityFieldConditionalReport[];
}

export interface AuthorityFieldCalibrationConditionalsV1 {
  readonly schemaVersion: typeof FIELD_CALIBRATION_CONDITIONALS_SCHEMA_VERSION;
  readonly baselineVersion: typeof FIELD_CALIBRATION_BASELINE_VERSION;
  readonly entries: Readonly<Record<string, AuthorityFieldConditionalEntry>>;
}

function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function championStats(
  run: AuthorityCohortResult['runs'][number],
  championId: string,
): ChampionRunStats {
  return (
    run.result.snapshot.championStats.find((stats) => stats.championId === championId) ?? {
      championId,
      kills: 0,
      assists: 0,
      totalDamage: 0,
      damageToShields: 0,
      damageReceived: 0,
      healingDone: 0,
      healingReceived: 0,
      overhealing: 0,
      shieldingDone: 0,
      shieldingAbsorbed: 0,
      deaths: 0,
      itemsCollected: [],
      survived: false,
    }
  );
}

function createChampionConditionals(
  cohort: AuthorityCohortResult,
): readonly AuthorityFieldChampionConditional[] {
  const championIds = new Set(
    cohort.runs.flatMap((run) => run.attempt.team.map((member) => member.championId)),
  );
  return [...championIds].sort().map((championId) => {
    const runs = cohort.runs.filter((run) =>
      run.attempt.team.some((member) => member.championId === championId),
    );
    const wins = runs.filter((run) => run.result.snapshot.won).length;
    const stats = runs.map((run) => championStats(run, championId));
    return {
      championId,
      cohortSampleSize: cohort.runs.length,
      sampleSize: runs.length,
      wins,
      participationRate: runs.length / cohort.runs.length,
      winRate: wins / runs.length,
      winRateWilson95: calculateWilsonInterval95(wins, runs.length),
      averageFinalLevel: mean(
        runs.map(
          (run) =>
            run.result.snapshot.team.find((member) => member.championId === championId)?.level ?? 1,
        ),
      ),
      averageKills: mean(stats.map((entry) => entry.kills)),
      averageDeaths: mean(stats.map((entry) => entry.deaths)),
      averageDamageDealt: mean(stats.map((entry) => entry.totalDamage)),
      averageHealingDone: mean(stats.map((entry) => entry.healingDone)),
      averageShieldingDone: mean(stats.map((entry) => entry.shieldingDone)),
    };
  });
}

function createAugmentConditionals(
  cohort: AuthorityCohortResult,
): readonly AuthorityFieldAugmentConditional[] {
  const augmentIds = new Set(cohort.runs.flatMap((run) => run.result.snapshot.augmentIds));
  return [...augmentIds].sort().map((augmentId) => {
    const runs = cohort.runs.filter((run) => run.result.snapshot.augmentIds.includes(augmentId));
    const wins = runs.filter((run) => run.result.snapshot.won).length;
    return {
      augmentId,
      cohortSampleSize: cohort.runs.length,
      sampleSize: runs.length,
      wins,
      selectionRate: runs.length / cohort.runs.length,
      winRate: wins / runs.length,
      winRateWilson95: calculateWilsonInterval95(wins, runs.length),
      averageWavesCompleted: mean(runs.map((run) => run.result.snapshot.totalWavesCompleted)),
      averageBiomesCompleted: mean(runs.map((run) => run.result.snapshot.biomesVisited.length)),
      averageGoldBalance: mean(runs.map((run) => run.result.snapshot.gold)),
    };
  });
}

function createConditionalReport(cohort: AuthorityCohortResult): AuthorityFieldConditionalReport {
  return {
    scenarioId: cohort.scenarioId,
    championCohorts: createChampionConditionals(cohort),
    augmentCohorts: createAugmentConditionals(cohort),
  };
}

/** Builds the privacy-safe conditional sidecar from the same paired authority runs as baseline V1. */
export function createAuthorityFieldCalibrationConditionalsV1(
  fixture: AuthorityFieldCalibrationBaselineFixtureV1,
): AuthorityFieldCalibrationConditionalsV1 {
  const entries = Object.fromEntries(
    fixture.policies.map((policyFixture, index) => {
      const identity = FIELD_CALIBRATION_BASELINE_V1_IDENTITIES[index];
      if (!identity) throw new Error(`Missing field-calibration identity at index ${index}.`);
      return [
        createAuthorityCohortBaselineKey(identity),
        {
          reports: policyFixture.matrix.cohorts
            .map(createConditionalReport)
            .sort((left, right) => left.scenarioId.localeCompare(right.scenarioId)),
        },
      ];
    }),
  );
  return {
    schemaVersion: FIELD_CALIBRATION_CONDITIONALS_SCHEMA_VERSION,
    baselineVersion: FIELD_CALIBRATION_BASELINE_VERSION,
    entries,
  };
}

function assertFinite(value: number, path: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${path} must be finite.`);
}

/** Validates the generated sidecar before browser or test code consumes it. */
export function loadAuthorityFieldCalibrationConditionalsV1(
  value: unknown,
): AuthorityFieldCalibrationConditionalsV1 {
  const document = structuredClone(value) as AuthorityFieldCalibrationConditionalsV1;
  if (
    !document ||
    typeof document !== 'object' ||
    document.schemaVersion !== FIELD_CALIBRATION_CONDITIONALS_SCHEMA_VERSION ||
    document.baselineVersion !== FIELD_CALIBRATION_BASELINE_VERSION ||
    !document.entries ||
    typeof document.entries !== 'object' ||
    Array.isArray(document.entries)
  ) {
    throw new TypeError('Invalid authority field-calibration conditional document.');
  }
  for (const [baselineKey, entry] of Object.entries(document.entries)) {
    if (!entry || !Array.isArray(entry.reports)) {
      throw new TypeError(`${baselineKey}.reports must be an array.`);
    }
    for (const report of entry.reports) {
      if (
        !report.scenarioId ||
        !Array.isArray(report.championCohorts) ||
        !Array.isArray(report.augmentCohorts)
      ) {
        throw new TypeError(`${baselineKey} contains an invalid conditional report.`);
      }
      for (const [kind, rows] of [
        ['championCohorts', report.championCohorts],
        ['augmentCohorts', report.augmentCohorts],
      ] as const) {
        for (const [rowIndex, row] of rows.entries()) {
          for (const [field, fieldValue] of Object.entries(row)) {
            if (field === 'championId' || field === 'augmentId' || field === 'winRateWilson95') {
              continue;
            }
            assertFinite(
              fieldValue as number,
              `${baselineKey}.${report.scenarioId}.${kind}[${rowIndex}].${field}`,
            );
          }
          assertFinite(
            row.winRateWilson95.lower,
            `${baselineKey}.${report.scenarioId}.${kind}[${rowIndex}].wilson.lower`,
          );
          assertFinite(
            row.winRateWilson95.upper,
            `${baselineKey}.${report.scenarioId}.${kind}[${rowIndex}].wilson.upper`,
          );
        }
      }
    }
  }
  return document;
}
