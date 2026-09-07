import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuthorityCohortRuntime } from '@/game/balance/authorityCohort';
import {
  AUTHORITY_COHORT_DEATH_CONCENTRATION_LIMIT,
  evaluateAuthorityCohortAcceptance,
} from '@/game/balance/authorityCohortAcceptance';
import {
  type AuthorityCohortBaselineComparison,
  compareAuthorityCohortBaseline,
} from '@/game/balance/authorityCohortBaseline';
import { createAuthorityCohortBaselineV20Fixture } from '@/game/balance/authorityCohortBaselineV20Fixture';
import type { AuthorityCohortExecutionReportGroup } from '@/game/balance/authorityCohortExecution';
import type { AuthorityCohortReport } from '@/game/balance/authorityCohortReport';

const v20Identity = {
  engineVersion: 'run-engine-v20',
  contentHash: '8308ebe66c3ee45850b68560b0449b6660b24c2a0e81a5070f6d1794620cac91',
} as const;
const resolverUrl = pathToFileURL(
  resolve(process.cwd(), 'supabase/functions/verify-run/authority-version-resolver.generated.ts'),
).href;
const edgeResolver = (await import(/* @vite-ignore */ resolverUrl)) as {
  resolveAuthorityVerifier: (
    engine: string,
    hash: string,
  ) => Promise<AuthorityCohortRuntime | undefined>;
};
const v20Authority = await edgeResolver.resolveAuthorityVerifier(
  v20Identity.engineVersion,
  v20Identity.contentHash,
);
if (!v20Authority) throw new Error('The archived v20 cohort authority is unavailable.');
const fixture = createAuthorityCohortBaselineV20Fixture(v20Authority);
const baselineEntry = Object.values(fixture.document.entries)[0]!;
const baselineKey = Object.keys(fixture.document.entries)[0]!;
const unchangedComparison = compareAuthorityCohortBaseline(baselineEntry, fixture.reports);
const fullGroup: AuthorityCohortExecutionReportGroup = {
  baselineKey,
  identity: baselineEntry.identity,
  reports: fixture.reports,
};

function familyReports(): readonly [
  AuthorityCohortReport,
  AuthorityCohortReport,
  AuthorityCohortReport,
] {
  const easy = fixture.reports.find((report) => report.scenarioId.startsWith('difficulty=easy|'))!;
  const family = easy.scenarioId.replace(/^difficulty=easy\|/, '');
  const normal = fixture.reports.find(
    (report) => report.scenarioId === `difficulty=normal|${family}`,
  )!;
  const hard = fixture.reports.find((report) => report.scenarioId === `difficulty=hard|${family}`)!;
  return [easy, normal, hard];
}

function groupWithReports(
  reports: readonly AuthorityCohortReport[],
): AuthorityCohortExecutionReportGroup {
  return { ...fullGroup, reports };
}

function withOutcome(
  report: AuthorityCohortReport,
  wins: number,
  sampleSize = 100,
): AuthorityCohortReport {
  return {
    ...report,
    sampleSize,
    outcome: {
      ...report.outcome,
      wins,
      defeats: sampleSize - wins,
      draws: 0,
      winRate: wins / sampleSize,
    },
  };
}

function acceptance(
  group: AuthorityCohortExecutionReportGroup,
  comparisons: readonly AuthorityCohortBaselineComparison[] = [unchangedComparison],
) {
  return evaluateAuthorityCohortAcceptance({ report: { groups: [group] }, comparisons });
}

function comparisonWithMetric(input: {
  readonly metric: 'outcome.winRate' | 'progression.biomes.p50' | 'economy.goldEarned.p50';
  readonly baseline: number;
  readonly current: number;
  readonly relativeDelta: number | null;
}): AuthorityCohortBaselineComparison {
  const first = unchangedComparison.reports[0]!;
  return {
    ...unchangedComparison,
    reports: [
      {
        ...first,
        metrics: [
          {
            metric: input.metric,
            baseline: input.baseline,
            current: input.current,
            absoluteDelta: input.current - input.baseline,
            relativeDelta: input.relativeDelta,
          },
        ],
      },
    ],
  };
}

describe('authority cohort acceptance', () => {
  it('accepts complete stratified hierarchy with overlapping Wilson intervals', () => {
    const result = acceptance(fullGroup);

    expect(result.schemaVersion).toBe(1);
    expect(result.hierarchy).toMatchObject({ passed: true, violations: [] });
    expect(result.hierarchy.measurements).toHaveLength(10);
  });

  it('rejects significant adjacent or direct inversions and incomplete families', () => {
    const [easy, normal, hard] = familyReports();
    const significant = acceptance(
      groupWithReports([withOutcome(easy, 5), withOutcome(normal, 50), withOutcome(hard, 95)]),
    );
    expect(significant.hierarchy.passed).toBe(false);
    expect(significant.hierarchy.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('easy>=normal'),
        expect.stringContaining('normal>=hard'),
        expect.stringContaining('easy>=hard'),
      ]),
    );

    const directOnly = acceptance(
      groupWithReports([withOutcome(easy, 35), withOutcome(normal, 50), withOutcome(hard, 65)]),
    );
    expect(directOnly.hierarchy.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('easy>=hard')]),
    );
    expect(directOnly.hierarchy.violations).not.toEqual(
      expect.arrayContaining([expect.stringContaining('easy>=normal')]),
    );
    expect(directOnly.hierarchy.violations).not.toEqual(
      expect.arrayContaining([expect.stringContaining('normal>=hard')]),
    );

    const incomplete = acceptance(groupWithReports([easy, normal]));
    expect(incomplete.hierarchy.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('missing hard')]),
    );

    const duplicate = acceptance(groupWithReports([easy, easy, normal, hard]));
    expect(duplicate.hierarchy.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('duplicate easy')]),
    );
    expect(duplicate.hierarchy.violations.join('\n')).not.toContain('[object Object]');
  });

  it('warns above 35% deaths and fails only above the statistical 40% limit', () => {
    const [easy, normal, hard] = familyReports();
    const withDeaths = (report: AuthorityCohortReport, deaths: number): AuthorityCohortReport => ({
      ...report,
      deaths: {
        total: 100,
        unattributed: 0,
        byLocation: [
          { biome: 'jungle', encounterId: 'jungle_wolves', count: deaths, share: deaths / 100 },
          {
            biome: 'base',
            encounterId: 'boss_nexus',
            count: 100 - deaths,
            share: 1 - deaths / 100,
          },
        ],
      },
    });

    const warning = acceptance(
      groupWithReports([withDeaths(easy, 40), withDeaths(normal, 40), withDeaths(hard, 40)]),
    );
    expect(warning.deathConcentration).toMatchObject({ passed: true });
    expect(warning.deathConcentration.warnings).toHaveLength(3);

    const observedHardJungle = {
      ...hard,
      deaths: {
        total: 445,
        unattributed: 0,
        byLocation: [
          { biome: 'jungle', encounterId: 'jungle_wolves', count: 183, share: 183 / 445 },
          { biome: 'base', encounterId: 'boss_nexus', count: 262, share: 262 / 445 },
        ],
      },
    } satisfies AuthorityCohortReport;
    const observed = acceptance(groupWithReports([easy, normal, observedHardJungle]));
    const hardJungle = observed.deathConcentration.measurements.find(
      (measurement) => measurement.difficulty === 'hard' && measurement.biome === 'jungle',
    )!;
    expect(hardJungle).toMatchObject({ warning: true, passed: true });
    expect(hardJungle.share).toBeCloseTo(0.411_236, 6);

    const failing = acceptance(
      groupWithReports([withDeaths(easy, 80), withDeaths(normal, 40), withDeaths(hard, 40)]),
    );
    const failure = failing.deathConcentration.measurements.find(
      (measurement) => measurement.difficulty === 'easy' && measurement.biome === 'jungle',
    )!;
    expect(failure.wilson95.lower).toBeGreaterThan(AUTHORITY_COHORT_DEATH_CONCENTRATION_LIMIT);
    expect(failing.deathConcentration.passed).toBe(false);
  });

  it('enforces strict regression thresholds and explicit zero-baseline review', () => {
    const exactWinRate = acceptance(fullGroup, [
      comparisonWithMetric({
        metric: 'outcome.winRate',
        baseline: 0.5,
        current: 0.45,
        relativeDelta: -0.1,
      }),
    ]);
    expect(exactWinRate.regressions.passed).toBe(true);
    const floatingExactWinRate = acceptance(fullGroup, [
      comparisonWithMetric({
        metric: 'outcome.winRate',
        baseline: 0.8,
        current: 0.75,
        relativeDelta: -0.0625,
      }),
    ]);
    expect(floatingExactWinRate.regressions.passed).toBe(true);
    const beyondWinRate = acceptance(fullGroup, [
      comparisonWithMetric({
        metric: 'outcome.winRate',
        baseline: 0.5,
        current: 0.449,
        relativeDelta: -0.102,
      }),
    ]);
    expect(beyondWinRate.regressions.passed).toBe(false);

    const exactBiome = acceptance(fullGroup, [
      comparisonWithMetric({
        metric: 'progression.biomes.p50',
        baseline: 4,
        current: 3.5,
        relativeDelta: -0.125,
      }),
    ]);
    expect(exactBiome.regressions.passed).toBe(true);
    const beyondBiome = acceptance(fullGroup, [
      comparisonWithMetric({
        metric: 'progression.biomes.p50',
        baseline: 4,
        current: 3.49,
        relativeDelta: -0.1275,
      }),
    ]);
    expect(beyondBiome.regressions.passed).toBe(false);

    const exactEconomy = acceptance(fullGroup, [
      comparisonWithMetric({
        metric: 'economy.goldEarned.p50',
        baseline: 100,
        current: 110,
        relativeDelta: 0.1,
      }),
    ]);
    expect(exactEconomy.regressions.passed).toBe(true);
    const floatingExactEconomy = acceptance(fullGroup, [
      comparisonWithMetric({
        metric: 'economy.goldEarned.p50',
        baseline: 0.3,
        current: 0.33,
        relativeDelta: (0.33 - 0.3) / 0.3,
      }),
    ]);
    expect(floatingExactEconomy.regressions.passed).toBe(true);
    const beyondEconomy = acceptance(fullGroup, [
      comparisonWithMetric({
        metric: 'economy.goldEarned.p50',
        baseline: 100,
        current: 111,
        relativeDelta: 0.11,
      }),
    ]);
    expect(beyondEconomy.regressions.passed).toBe(false);
    const zeroBaseline = acceptance(fullGroup, [
      comparisonWithMetric({
        metric: 'economy.goldEarned.p50',
        baseline: 0,
        current: 1,
        relativeDelta: null,
      }),
    ]);
    expect(zeroBaseline.regressions.passed).toBe(false);
  });

  it('rejects missing comparisons and incoherent death totals', () => {
    const noBaseline = acceptance(fullGroup, []);
    expect(noBaseline.regressions).toMatchObject({ passed: false });
    expect(noBaseline.regressions.integrityViolations).toEqual(
      expect.arrayContaining([expect.stringContaining('missing baseline comparison')]),
    );

    const [easy, normal, hard] = familyReports();
    const incoherent = {
      ...easy,
      deaths: { total: 2, unattributed: 0, byLocation: [] },
    } satisfies AuthorityCohortReport;
    const result = acceptance(groupWithReports([incoherent, normal, hard]));
    expect(result.deathConcentration).toMatchObject({ passed: false });
    expect(result.deathConcentration.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('death totals are incoherent')]),
    );
  });
});
