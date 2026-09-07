import type { AuthorityDifficulty } from '@/game/authority/types';
import type { Biome } from '@/types/run';
import type {
  AuthorityCohortBaselineComparison,
  AuthorityCohortBaselineMetricName,
} from './authorityCohortBaseline';
import type {
  AuthorityCohortExecutionReportDocument,
  AuthorityCohortExecutionReportGroup,
} from './authorityCohortExecution';
import {
  type AuthorityCohortReport,
  type AuthorityCohortWilsonInterval,
  calculateWilsonInterval95,
} from './authorityCohortReport';

export const AUTHORITY_COHORT_DEATH_CONCENTRATION_WARNING = 0.35;
export const AUTHORITY_COHORT_DEATH_CONCENTRATION_LIMIT = 0.4;
export const AUTHORITY_COHORT_WIN_RATE_REGRESSION_LIMIT = 0.05;
export const AUTHORITY_COHORT_MEDIAN_BIOME_REGRESSION_LIMIT = 0.5;
export const AUTHORITY_COHORT_ECONOMY_REGRESSION_LIMIT = 0.1;
export const AUTHORITY_COHORT_ACCEPTANCE_SCHEMA_VERSION = 1 as const;

const DIFFICULTIES = ['easy', 'normal', 'hard'] as const satisfies readonly AuthorityDifficulty[];
const DIFFICULTY_PREFIX = /^difficulty=(easy|normal|hard)\|/;

type HierarchyComparison = 'easy>=normal' | 'normal>=hard' | 'easy>=hard';

export interface AuthorityCohortHierarchyMeasurement {
  readonly baselineKey: string;
  readonly family: string;
  readonly sampleSize: Readonly<Record<AuthorityDifficulty, number>>;
  readonly winRates: Readonly<Record<AuthorityDifficulty, number>>;
  readonly wilson95: Readonly<Record<AuthorityDifficulty, AuthorityCohortWilsonInterval>>;
  readonly passed: boolean;
}

export interface AuthorityCohortDeathConcentrationMeasurement {
  readonly baselineKey: string;
  readonly difficulty: AuthorityDifficulty;
  readonly biome: Exclude<Biome, 'base'>;
  readonly deaths: number;
  readonly totalDeaths: number;
  readonly share: number;
  readonly wilson95: AuthorityCohortWilsonInterval;
  readonly warning: boolean;
  readonly passed: boolean;
}

export interface AuthorityCohortRegressionViolation {
  readonly baselineKey: string;
  readonly scenarioId: string;
  readonly stratumFingerprint: string;
  readonly metric: AuthorityCohortBaselineMetricName;
  readonly baseline: number;
  readonly current: number;
  readonly absoluteDelta: number;
  readonly relativeDelta: number | null;
  readonly limit: number;
}

export interface AuthorityCohortAcceptance {
  readonly schemaVersion: typeof AUTHORITY_COHORT_ACCEPTANCE_SCHEMA_VERSION;
  readonly passed: boolean;
  readonly hierarchy: {
    readonly passed: boolean;
    readonly measurements: readonly AuthorityCohortHierarchyMeasurement[];
    readonly violations: readonly string[];
  };
  readonly deathConcentration: {
    readonly warningThreshold: typeof AUTHORITY_COHORT_DEATH_CONCENTRATION_WARNING;
    readonly failureThreshold: typeof AUTHORITY_COHORT_DEATH_CONCENTRATION_LIMIT;
    readonly passed: boolean;
    readonly measurements: readonly AuthorityCohortDeathConcentrationMeasurement[];
    readonly warnings: readonly string[];
    readonly violations: readonly string[];
  };
  readonly regressions: {
    readonly passed: boolean;
    readonly evaluatedMetrics: number;
    readonly violations: readonly AuthorityCohortRegressionViolation[];
    readonly integrityViolations: readonly string[];
  };
}

interface HierarchyFamily {
  readonly baselineKey: string;
  readonly family: string;
  readonly semanticKey: string;
  readonly reports: Partial<Record<AuthorityDifficulty, AuthorityCohortReport>>;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function createHierarchyFamily(report: AuthorityCohortReport): {
  readonly label: string;
  readonly semanticKey: string;
} | null {
  const match = DIFFICULTY_PREFIX.exec(report.scenarioId);
  if (!match || match[1] !== report.stratum.difficulty) return null;
  const {
    cellId: _cellId,
    difficulty: _difficulty,
    fingerprint: _fingerprint,
    ...dimensions
  } = report.stratum;
  return {
    label: report.scenarioId.replace(DIFFICULTY_PREFIX, ''),
    semanticKey: stableSerialize(dimensions),
  };
}

function compareHierarchy(
  family: HierarchyFamily,
  easier: AuthorityDifficulty,
  harder: AuthorityDifficulty,
  comparison: HierarchyComparison,
  violations: string[],
): boolean {
  const easierReport = family.reports[easier];
  const harderReport = family.reports[harder];
  if (!easierReport || !harderReport) return false;
  const easierWilson = calculateWilsonInterval95(
    easierReport.outcome.wins,
    easierReport.sampleSize,
  );
  const harderWilson = calculateWilsonInterval95(
    harderReport.outcome.wins,
    harderReport.sampleSize,
  );
  if (harderWilson.lower <= easierWilson.upper) return true;
  violations.push(
    `${family.baselineKey}/${family.family}: ${comparison} has a statistically significant inversion (${round(easierReport.outcome.winRate)} vs ${round(harderReport.outcome.winRate)})`,
  );
  return false;
}

function evaluateHierarchy(
  groups: readonly AuthorityCohortExecutionReportGroup[],
): AuthorityCohortAcceptance['hierarchy'] {
  const violations: string[] = [];
  const families = new Map<string, HierarchyFamily>();
  for (const group of groups) {
    for (const report of group.reports) {
      const family = createHierarchyFamily(report);
      if (!family) {
        violations.push(
          `${group.baselineKey}/${report.scenarioId}: scenario difficulty prefix does not match its stratum`,
        );
        continue;
      }
      const key = `${group.baselineKey}\u0000${family.semanticKey}`;
      const existing = families.get(key) ?? {
        baselineKey: group.baselineKey,
        family: family.label,
        semanticKey: family.semanticKey,
        reports: {},
      };
      if (existing.family !== family.label) {
        violations.push(
          `${group.baselineKey}/${family.label}: semantic family is also labelled ${existing.family}`,
        );
      }
      const difficulty = report.stratum.difficulty;
      if (existing.reports[difficulty]) {
        violations.push(`${group.baselineKey}/${family.label}: duplicate ${difficulty} stratum`);
      } else {
        existing.reports[difficulty] = report;
      }
      families.set(key, existing);
    }
  }

  const measurements: AuthorityCohortHierarchyMeasurement[] = [];
  for (const family of [...families.values()].sort(
    (left, right) =>
      left.baselineKey.localeCompare(right.baselineKey) || left.family.localeCompare(right.family),
  )) {
    const missing = DIFFICULTIES.filter((difficulty) => !family.reports[difficulty]);
    if (missing.length > 0) {
      violations.push(
        `${family.baselineKey}/${family.family}: missing ${missing.join(', ')} stratum`,
      );
      continue;
    }
    const easy = family.reports.easy!;
    const normal = family.reports.normal!;
    const hard = family.reports.hard!;
    const reports = [easy, normal, hard] as const;
    for (const report of reports) {
      if (
        report.outcome.wins + report.outcome.defeats + report.outcome.draws !==
        report.sampleSize
      ) {
        violations.push(
          `${family.baselineKey}/${family.family}/${report.stratum.difficulty}: outcome totals do not match sample size`,
        );
      }
    }
    if (new Set(reports.map((report) => report.sampleSize)).size !== 1) {
      violations.push(`${family.baselineKey}/${family.family}: difficulty sample sizes differ`);
    }
    const wilson95 = {
      easy: calculateWilsonInterval95(easy.outcome.wins, easy.sampleSize),
      normal: calculateWilsonInterval95(normal.outcome.wins, normal.sampleSize),
      hard: calculateWilsonInterval95(hard.outcome.wins, hard.sampleSize),
    };
    const winRates = {
      easy: round(easy.outcome.wins / easy.sampleSize),
      normal: round(normal.outcome.wins / normal.sampleSize),
      hard: round(hard.outcome.wins / hard.sampleSize),
    };
    const passed = [
      compareHierarchy(family, 'easy', 'normal', 'easy>=normal', violations),
      compareHierarchy(family, 'normal', 'hard', 'normal>=hard', violations),
      compareHierarchy(family, 'easy', 'hard', 'easy>=hard', violations),
    ].every(Boolean);
    measurements.push({
      baselineKey: family.baselineKey,
      family: family.family,
      sampleSize: {
        easy: easy.sampleSize,
        normal: normal.sampleSize,
        hard: hard.sampleSize,
      },
      winRates,
      wilson95,
      passed,
    });
  }

  if (families.size === 0) violations.push('No authority cohort hierarchy families were reported.');
  return { passed: violations.length === 0, measurements, violations };
}

function evaluateDeathConcentration(
  groups: readonly AuthorityCohortExecutionReportGroup[],
): AuthorityCohortAcceptance['deathConcentration'] {
  const warnings: string[] = [];
  const violations: string[] = [];
  const measurements: AuthorityCohortDeathConcentrationMeasurement[] = [];

  for (const group of groups) {
    for (const difficulty of DIFFICULTIES) {
      const reports = group.reports.filter((report) => report.stratum.difficulty === difficulty);
      if (reports.length === 0) continue;
      const totalDeaths = reports.reduce((total, report) => total + report.deaths.total, 0);
      const attributedDeaths = reports.reduce(
        (total, report) =>
          total +
          report.deaths.byLocation.reduce((subtotal, location) => subtotal + location.count, 0),
        0,
      );
      const unattributedDeaths = reports.reduce(
        (total, report) => total + report.deaths.unattributed,
        0,
      );
      if (attributedDeaths + unattributedDeaths !== totalDeaths) {
        violations.push(
          `${group.baselineKey}/${difficulty}: death totals are incoherent (${attributedDeaths} attributed + ${unattributedDeaths} unattributed != ${totalDeaths})`,
        );
        continue;
      }

      const byBiome = new Map<Exclude<Biome, 'base'>, number>();
      for (const report of reports) {
        for (const location of report.deaths.byLocation) {
          if (location.biome === 'base') continue;
          byBiome.set(location.biome, (byBiome.get(location.biome) ?? 0) + location.count);
        }
      }
      for (const [biome, deaths] of [...byBiome.entries()].sort(([left], [right]) =>
        left.localeCompare(right),
      )) {
        const share = totalDeaths === 0 ? 0 : deaths / totalDeaths;
        const wilson95 = calculateWilsonInterval95(deaths, totalDeaths);
        const warning = share > AUTHORITY_COHORT_DEATH_CONCENTRATION_WARNING;
        const passed = wilson95.lower <= AUTHORITY_COHORT_DEATH_CONCENTRATION_LIMIT;
        const measurement = {
          baselineKey: group.baselineKey,
          difficulty,
          biome,
          deaths,
          totalDeaths,
          share: round(share),
          wilson95,
          warning,
          passed,
        } satisfies AuthorityCohortDeathConcentrationMeasurement;
        measurements.push(measurement);
        if (warning) {
          warnings.push(
            `${group.baselineKey}/${difficulty}/${biome}: ${round(share)} of deaths (Wilson95 lower ${round(wilson95.lower)})`,
          );
        }
        if (!passed) {
          violations.push(
            `${group.baselineKey}/${difficulty}/${biome}: Wilson95 lower ${round(wilson95.lower)} exceeds 0.4`,
          );
        }
      }
    }
  }

  return {
    warningThreshold: AUTHORITY_COHORT_DEATH_CONCENTRATION_WARNING,
    failureThreshold: AUTHORITY_COHORT_DEATH_CONCENTRATION_LIMIT,
    passed: violations.length === 0,
    measurements,
    warnings,
    violations,
  };
}

function isEconomyMetric(metric: AuthorityCohortBaselineMetricName): boolean {
  return (
    metric.startsWith('economy.') ||
    metric.startsWith('shops.') ||
    metric.startsWith('purchases.') ||
    metric.startsWith('recruitments.')
  );
}

function evaluateRegressions(
  groups: readonly AuthorityCohortExecutionReportGroup[],
  comparisons: readonly AuthorityCohortBaselineComparison[],
  reportedIntegrityViolations: readonly string[],
): AuthorityCohortAcceptance['regressions'] {
  const violations: AuthorityCohortRegressionViolation[] = [];
  const integrityViolations = [...reportedIntegrityViolations];
  let evaluatedMetrics = 0;
  const groupKeys = new Set(groups.map((group) => group.baselineKey));
  const comparisonsByKey = new Map<string, AuthorityCohortBaselineComparison>();
  for (const comparison of comparisons) {
    if (comparisonsByKey.has(comparison.baselineKey)) {
      integrityViolations.push(`${comparison.baselineKey}: duplicate baseline comparison`);
    }
    comparisonsByKey.set(comparison.baselineKey, comparison);
  }
  for (const baselineKey of groupKeys) {
    if (!comparisonsByKey.has(baselineKey)) {
      integrityViolations.push(`${baselineKey}: missing baseline comparison`);
    }
  }
  for (const baselineKey of comparisonsByKey.keys()) {
    if (!groupKeys.has(baselineKey)) {
      integrityViolations.push(`${baselineKey}: comparison has no execution report group`);
    }
  }

  for (const comparison of comparisons) {
    for (const report of comparison.reports) {
      for (const metric of report.metrics) {
        let limit: number | null = null;
        let breached = false;
        if (metric.metric === 'outcome.winRate') {
          limit = AUTHORITY_COHORT_WIN_RATE_REGRESSION_LIMIT;
          breached = round(metric.absoluteDelta) < -limit;
        } else if (metric.metric === 'progression.biomes.p50') {
          limit = AUTHORITY_COHORT_MEDIAN_BIOME_REGRESSION_LIMIT;
          breached = round(metric.absoluteDelta) < -limit;
        } else if (isEconomyMetric(metric.metric)) {
          limit = AUTHORITY_COHORT_ECONOMY_REGRESSION_LIMIT;
          breached =
            metric.relativeDelta === null
              ? metric.current !== metric.baseline
              : Math.abs(round(metric.relativeDelta)) > limit;
        }
        if (limit === null) continue;
        evaluatedMetrics += 1;
        if (!breached) continue;
        violations.push({
          baselineKey: comparison.baselineKey,
          scenarioId: report.scenarioId,
          stratumFingerprint: report.stratumFingerprint,
          metric: metric.metric,
          baseline: metric.baseline,
          current: metric.current,
          absoluteDelta: metric.absoluteDelta,
          relativeDelta: metric.relativeDelta,
          limit,
        });
      }
    }
  }

  if (comparisons.length === 0)
    integrityViolations.push('No authority cohort baseline comparisons.');
  return {
    passed: violations.length === 0 && integrityViolations.length === 0,
    evaluatedMetrics,
    violations,
    integrityViolations,
  };
}

export function evaluateAuthorityCohortAcceptance(input: {
  readonly report: Pick<AuthorityCohortExecutionReportDocument, 'groups'>;
  readonly comparisons: readonly AuthorityCohortBaselineComparison[];
  readonly regressionIntegrityViolations?: readonly string[];
}): AuthorityCohortAcceptance {
  const hierarchy = evaluateHierarchy(input.report.groups);
  const deathConcentration = evaluateDeathConcentration(input.report.groups);
  const regressions = evaluateRegressions(
    input.report.groups,
    input.comparisons,
    input.regressionIntegrityViolations ?? [],
  );
  return {
    schemaVersion: AUTHORITY_COHORT_ACCEPTANCE_SCHEMA_VERSION,
    passed: hierarchy.passed && deathConcentration.passed && regressions.passed,
    hierarchy,
    deathConcentration,
    regressions,
  };
}
