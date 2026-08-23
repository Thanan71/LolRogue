import { describe, expect, it } from 'vitest';
import baselineJson from '../config/authority-cohort-baselines-v15.json';
import type { AuthorityCohortResult } from '@/game/balance/authorityCohort';
import {
  AuthorityCohortBaselineMismatchError,
  AuthorityCohortBaselineValidationError,
  compareAuthorityCohortBaseline,
  createAuthorityCohortBaselineKey,
  createAuthorityCohortTraceArtifacts,
  loadAuthorityCohortBaseline,
} from '@/game/balance/authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V15 } from '@/game/balance/authorityCohortBaselineV15';
import {
  AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
  createAuthorityCohortBaselineV15Fixture,
  generateAuthorityCohortBaselineV15,
} from '@/game/balance/authorityCohortBaselineV15Fixture';
import type { AuthorityCohortReport } from '@/game/balance/authorityCohortReport';
import { BIOMES } from '@/types/run';

const BASELINE_KEY =
  'engine=run-engine-v15|content=60cf9f5c2343ecd507549a9027e9001d32e9d8ad3c58091d5c93b35946992bb9|model=1|policy=survival-greedy@1';
const fixture = createAuthorityCohortBaselineV15Fixture();
const baselineEntry = AUTHORITY_COHORT_BASELINE_V15.entries[BASELINE_KEY];
if (!baselineEntry) throw new Error('The v15 cohort baseline entry is unavailable.');

function firstRawEntry(value: unknown): Record<string, unknown> {
  const document = value as { entries: Record<string, Record<string, unknown>> };
  const entry = Object.values(document.entries)[0];
  if (!entry) throw new Error('Raw fixture entry is unavailable.');
  return entry;
}

function firstRawReport(value: unknown): Record<string, unknown> {
  const reports = firstRawEntry(value).reports as Array<Record<string, unknown>>;
  const report = reports[0];
  if (!report) throw new Error('Raw fixture report is unavailable.');
  return report;
}

function syntheticExtremeCohort(): AuthorityCohortResult {
  const base = fixture.matrix.cohorts.find((cohort) => cohort.stratum.difficulty === 'normal');
  const combat = base?.runs[0]?.result.combatSummaries[0];
  if (!base || !combat) throw new Error('Synthetic artifact fixture requires a combat.');
  return {
    ...base,
    runs: base.runs.map((run, index) => {
      const defeated = index === 1 || index === 2;
      return {
        ...run,
        seed: index,
        attempt: { ...run.attempt, seed: index },
        result: {
          ...run.result,
          snapshot: {
            ...run.result.snapshot,
            seed: index,
            won: !defeated,
            endReason: defeated ? 'defeat' : 'victory',
            totalWavesCompleted: index,
            biomesVisited: BIOMES.slice(0, index + 1),
            gold: index * 5,
            ledger: {
              ...run.result.snapshot.ledger,
              gold: { earned: index * 10, spent: index * 2 },
            },
          },
          combatSummaries: [
            {
              ...structuredClone(combat),
              encounterId: defeated ? 'jungle-cluster' : `ordinary-${index}`,
              biome: defeated ? 'jungle' : 'top_lane',
              biomeIndex: defeated ? 1 : 0,
              winner: defeated ? 'enemy' : 'player',
              rounds: index + 1,
              metrics: { ...combat.metrics, rounds: index + 1 },
            },
          ],
        },
      };
    }),
  };
}

describe('authority cohort baseline', () => {
  it('builds a canonical key from engine, hash, model and policy versions', () => {
    expect(createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V15_IDENTITY)).toBe(
      BASELINE_KEY,
    );
  });

  it('strictly loads the committed v15 smoke matrix and reproduces it from real runs', () => {
    const loaded = loadAuthorityCohortBaseline(
      baselineJson,
      AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
    );

    expect(loaded).toEqual(AUTHORITY_COHORT_BASELINE_V15);
    expect(loaded.entries[BASELINE_KEY]).toMatchObject({
      identity: AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
      source: {
        kind: 'authority-cohort-matrix',
        seeds: [0, 1, 2, 3, 4],
        cellCount: 3,
      },
    });
    expect(generateAuthorityCohortBaselineV15()).toEqual(loaded);
    expect(JSON.stringify(loaded)).not.toContain('"trace"');
  });

  it('rejects unknown fields, missing metrics and incoherent index identities', () => {
    const unknownRoot = Object.assign(structuredClone(baselineJson), { unexpected: true });
    expect(() => loadAuthorityCohortBaseline(unknownRoot)).toThrowError(
      AuthorityCohortBaselineValidationError,
    );

    const missingMetric = structuredClone(baselineJson);
    const metrics = firstRawReport(missingMetric).metrics as Record<string, unknown>;
    delete metrics['outcome.winRate'];
    expect(() => loadAuthorityCohortBaseline(missingMetric)).toThrow('expected exactly keys');

    const incoherentIdentity = structuredClone(baselineJson);
    const identity = firstRawEntry(incoherentIdentity).identity as Record<string, unknown>;
    identity.contentHash = 'a'.repeat(64);
    expect(() => loadAuthorityCohortBaseline(incoherentIdentity)).toThrow('identity requires key');
  });

  it('rejects a current identity mismatch and missing report strata', () => {
    expect(() =>
      loadAuthorityCohortBaseline(baselineJson, {
        ...AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
        contentHash: 'a'.repeat(64),
      }),
    ).toThrowError(AuthorityCohortBaselineMismatchError);
    expect(() => compareAuthorityCohortBaseline(baselineEntry, fixture.reports.slice(1))).toThrow(
      'Baseline/report strata mismatch',
    );
  });

  it('compares paired reports as deterministic leaf deltas', () => {
    const unchanged = compareAuthorityCohortBaseline(baselineEntry, fixture.reports);
    expect(
      unchanged.reports
        .flatMap((report) => report.metrics)
        .every((metric) => {
          return metric.absoluteDelta === 0 && metric.relativeDelta !== Number.POSITIVE_INFINITY;
        }),
    ).toBe(true);

    const original = fixture.reports[0]!;
    const changed: AuthorityCohortReport = {
      ...original,
      economy: {
        ...original.economy,
        goldEarned: {
          ...original.economy.goldEarned,
          mean: original.economy.goldEarned.mean + 5,
        },
      },
    };
    const comparison = compareAuthorityCohortBaseline(
      baselineEntry,
      fixture.reports.map((report) =>
        report.stratum.fingerprint === changed.stratum.fingerprint ? changed : report,
      ),
    );
    const delta = comparison.reports
      .find((report) => report.stratumFingerprint === changed.stratum.fingerprint)
      ?.metrics.find((metric) => metric.metric === 'economy.goldEarned.mean');

    expect(delta).toMatchObject({
      baseline: original.economy.goldEarned.mean,
      current: original.economy.goldEarned.mean + 5,
      absoluteDelta: 5,
    });
  });

  it('keeps only deduplicated p10/p90 and concentrated-defeat trace representatives', () => {
    const artifacts = createAuthorityCohortTraceArtifacts({
      identity: AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
      cohorts: [syntheticExtremeCohort()],
    });

    expect(artifacts.traces.map((artifact) => artifact.seed)).toEqual([0, 1, 4]);
    expect(artifacts.traces.find((artifact) => artifact.seed === 0)?.reasons).toEqual([
      'economy.finalGold:p10',
      'economy.goldEarned:p10',
      'economy.goldSpent:p10',
      'progression.biomes:p10',
      'progression.rounds:p10',
      'progression.waves:p10',
    ]);
    expect(artifacts.traces.find((artifact) => artifact.seed === 1)?.reasons).toEqual([
      'defeat-concentration:jungle/jungle-cluster',
    ]);
    expect(artifacts.traces.find((artifact) => artifact.seed === 4)?.reasons).toHaveLength(6);
    expect(new Set(artifacts.traces.map((artifact) => artifact.seed)).size).toBe(
      artifacts.traces.length,
    );
    expect(JSON.stringify(artifacts)).not.toContain('"result"');
    expect(JSON.stringify(artifacts)).not.toContain('"snapshot"');
    expect(JSON.stringify(artifacts)).not.toContain('"combatSummaries"');
  });
});
