import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUTHORITY_CONTENT_HASH, AUTHORITY_ENGINE_VERSION } from '@/game/authority';
import type { AuthorityCohortResult, AuthorityCohortRuntime } from '@/game/balance/authorityCohort';
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
import { AUTHORITY_COHORT_BASELINE_V16 } from '@/game/balance/authorityCohortBaselineV16';
import {
  AUTHORITY_COHORT_BASELINE_V16_IDENTITY,
  createAuthorityCohortBaselineV16Fixture,
  generateAuthorityCohortBaselineV16,
} from '@/game/balance/authorityCohortBaselineV16Fixture';
import { AUTHORITY_COHORT_BASELINE_V17 } from '@/game/balance/authorityCohortBaselineV17';
import {
  AUTHORITY_COHORT_BASELINE_V17_IDENTITY,
  createAuthorityCohortBaselineV17Fixture,
  generateAuthorityCohortBaselineV17,
} from '@/game/balance/authorityCohortBaselineV17Fixture';
import { AUTHORITY_COHORT_BASELINE_V18 } from '@/game/balance/authorityCohortBaselineV18';
import {
  AUTHORITY_COHORT_BASELINE_V18_IDENTITY,
  createAuthorityCohortBaselineV18Fixture,
  generateAuthorityCohortBaselineV18,
} from '@/game/balance/authorityCohortBaselineV18Fixture';
import { AUTHORITY_COHORT_BASELINE_V19 } from '@/game/balance/authorityCohortBaselineV19';
import {
  AUTHORITY_COHORT_BASELINE_V19_IDENTITY,
  createAuthorityCohortBaselineV19Fixture,
  generateAuthorityCohortBaselineV19,
} from '@/game/balance/authorityCohortBaselineV19Fixture';
import { AUTHORITY_COHORT_BASELINE_V20 } from '@/game/balance/authorityCohortBaselineV20';
import {
  AUTHORITY_COHORT_BASELINE_V20_CHAMPION_IDS,
  AUTHORITY_COHORT_BASELINE_V20_IDENTITY,
  createAuthorityCohortBaselineV20Fixture,
  generateAuthorityCohortBaselineV20,
} from '@/game/balance/authorityCohortBaselineV20Fixture';
import { AUTHORITY_COHORT_BASELINE_V21 } from '@/game/balance/authorityCohortBaselineV21';
import { AUTHORITY_COHORT_BASELINE_V21_IDENTITY } from '@/game/balance/authorityCohortBaselineV21Fixture';
import type { AuthorityCohortReport } from '@/game/balance/authorityCohortReport';
import { BIOMES } from '@/types/run';
import baselineV15Json from '../config/authority-cohort-baselines-v15.json';
import baselineV16Json from '../config/authority-cohort-baselines-v16.json';
import baselineV17Json from '../config/authority-cohort-baselines-v17.json';
import baselineV18Json from '../config/authority-cohort-baselines-v18.json';
import baselineV19Json from '../config/authority-cohort-baselines-v19.json';
import baselineV20Json from '../config/authority-cohort-baselines-v20.json';
import baselineV21Json from '../config/authority-cohort-baselines-v21.json';

const V15_BASELINE_KEY =
  'engine=run-engine-v15|content=60cf9f5c2343ecd507549a9027e9001d32e9d8ad3c58091d5c93b35946992bb9|model=1|policy=survival-greedy@1';
const V16_BASELINE_KEY =
  'engine=run-engine-v16|content=557f57f06c3410209a4f822d22a97b7699da3cb0278bcba553281a5c2a41dee9|model=1|policy=survival-greedy@1';
const V17_BASELINE_KEY =
  'engine=run-engine-v17|content=83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19|model=1|policy=survival-greedy@1';
const V18_BASELINE_KEY =
  'engine=run-engine-v18|content=9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17|model=1|policy=survival-greedy@1';
const V19_BASELINE_KEY =
  'engine=run-engine-v19|content=45a1dbb93be5a25281ba6fce56517be382ddff6210dce9a55ef3d1ac7c971099|model=2|policy=survival-greedy@1';
const V20_BASELINE_KEY =
  'engine=run-engine-v20|content=8308ebe66c3ee45850b68560b0449b6660b24c2a0e81a5070f6d1794620cac91|model=2|policy=survival-greedy@1';
const V21_BASELINE_KEY =
  'engine=run-engine-v21|content=c0b776b628006a779a618fb2abfa00a3ff99fd27d27980dfdec54378fc4d81a3|model=2|policy=survival-greedy@1';
const baselineEntry = AUTHORITY_COHORT_BASELINE_V20.entries[V20_BASELINE_KEY];
if (!baselineEntry) throw new Error('The v20 cohort baseline entry is unavailable.');

async function resolveArchivedAuthority(identity: {
  engineVersion: string;
  contentHash: string;
}): Promise<AuthorityCohortRuntime> {
  const resolverUrl = pathToFileURL(
    resolve(process.cwd(), 'supabase/functions/verify-run/authority-version-resolver.generated.ts'),
  ).href;
  const edgeResolver = (await import(/* @vite-ignore */ resolverUrl)) as {
    resolveAuthorityVerifier: (
      engine: string,
      hash: string,
    ) => Promise<AuthorityCohortRuntime | undefined>;
  };
  const authority = await edgeResolver.resolveAuthorityVerifier(
    identity.engineVersion,
    identity.contentHash,
  );
  if (!authority)
    throw new Error(`The archived ${identity.engineVersion} verifier is unavailable.`);
  return authority;
}

const v20Authority = await resolveArchivedAuthority(AUTHORITY_COHORT_BASELINE_V20_IDENTITY);
const fixture = createAuthorityCohortBaselineV20Fixture(v20Authority);

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
  it('builds canonical keys from engine, hash, model and policy versions', () => {
    expect(createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V15_IDENTITY)).toBe(
      V15_BASELINE_KEY,
    );
    expect(createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V16_IDENTITY)).toBe(
      V16_BASELINE_KEY,
    );
    expect(createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V17_IDENTITY)).toBe(
      V17_BASELINE_KEY,
    );
    expect(createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V18_IDENTITY)).toBe(
      V18_BASELINE_KEY,
    );
    expect(createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V19_IDENTITY)).toBe(
      V19_BASELINE_KEY,
    );
    expect(createAuthorityCohortBaselineKey(AUTHORITY_COHORT_BASELINE_V20_IDENTITY)).toBe(
      V20_BASELINE_KEY,
    );
  });

  it('keeps the v15 identity immutable and reproduces its baseline with the archive', async () => {
    const loaded = loadAuthorityCohortBaseline(
      baselineV15Json,
      AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
    );
    const authority = await resolveArchivedAuthority(AUTHORITY_COHORT_BASELINE_V15_IDENTITY);
    const archivedFixture = createAuthorityCohortBaselineV15Fixture(authority);

    expect(loaded).toEqual(AUTHORITY_COHORT_BASELINE_V15);
    expect(AUTHORITY_COHORT_BASELINE_V15_IDENTITY).toEqual({
      engineVersion: 'run-engine-v15',
      contentHash: '60cf9f5c2343ecd507549a9027e9001d32e9d8ad3c58091d5c93b35946992bb9',
      balanceModelVersion: 1,
      policy: { id: 'survival-greedy', version: 1 },
    });
    expect(loaded.entries[V15_BASELINE_KEY]).toMatchObject({
      identity: AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
      source: {
        kind: 'authority-cohort-matrix',
        seeds: [0, 1, 2, 3, 4],
        cellCount: 3,
      },
    });
    expect(archivedFixture.document).toEqual(loaded);
    expect(generateAuthorityCohortBaselineV15(authority)).toEqual(loaded);
    expect(JSON.stringify(loaded)).not.toContain('"trace"');
  });

  it('keeps the v16 identity immutable and reproduces its baseline with the archive', async () => {
    const loaded = loadAuthorityCohortBaseline(
      baselineV16Json,
      AUTHORITY_COHORT_BASELINE_V16_IDENTITY,
    );
    const authority = await resolveArchivedAuthority(AUTHORITY_COHORT_BASELINE_V16_IDENTITY);
    const archivedFixture = createAuthorityCohortBaselineV16Fixture(authority);

    expect(loaded).toEqual(AUTHORITY_COHORT_BASELINE_V16);
    expect(AUTHORITY_COHORT_BASELINE_V16_IDENTITY).toEqual({
      engineVersion: 'run-engine-v16',
      contentHash: '557f57f06c3410209a4f822d22a97b7699da3cb0278bcba553281a5c2a41dee9',
      balanceModelVersion: 1,
      policy: { id: 'survival-greedy', version: 1 },
    });
    expect(loaded.entries[V16_BASELINE_KEY]).toMatchObject({
      identity: AUTHORITY_COHORT_BASELINE_V16_IDENTITY,
      source: {
        kind: 'authority-cohort-matrix',
        seeds: [0, 1, 2, 3, 4],
        cellCount: 3,
      },
    });
    expect(archivedFixture.document).toEqual(loaded);
    expect(generateAuthorityCohortBaselineV16(authority)).toEqual(loaded);
    expect(JSON.stringify(loaded)).not.toContain('"trace"');
  });

  it('keeps the v17 identity immutable and reproduces its baseline with the archive', async () => {
    const loaded = loadAuthorityCohortBaseline(
      baselineV17Json,
      AUTHORITY_COHORT_BASELINE_V17_IDENTITY,
    );
    const authority = await resolveArchivedAuthority(AUTHORITY_COHORT_BASELINE_V17_IDENTITY);
    const archivedFixture = createAuthorityCohortBaselineV17Fixture(authority);

    expect(loaded).toEqual(AUTHORITY_COHORT_BASELINE_V17);
    expect(AUTHORITY_COHORT_BASELINE_V17_IDENTITY).toEqual({
      engineVersion: 'run-engine-v17',
      contentHash: '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
      balanceModelVersion: 1,
      policy: { id: 'survival-greedy', version: 1 },
    });
    expect(loaded.entries[V17_BASELINE_KEY]).toMatchObject({
      identity: AUTHORITY_COHORT_BASELINE_V17_IDENTITY,
      source: {
        kind: 'authority-cohort-matrix',
        seeds: [0, 1, 2, 3, 4],
        cellCount: 3,
      },
    });
    expect(archivedFixture.document).toEqual(loaded);
    expect(generateAuthorityCohortBaselineV17(authority)).toEqual(loaded);
    expect(JSON.stringify(loaded)).not.toContain('"trace"');
  });

  it('keeps the v18 identity immutable and reproduces its baseline with the archive', async () => {
    const loaded = loadAuthorityCohortBaseline(
      baselineV18Json,
      AUTHORITY_COHORT_BASELINE_V18_IDENTITY,
    );
    const authority = await resolveArchivedAuthority(AUTHORITY_COHORT_BASELINE_V18_IDENTITY);
    const archivedFixture = createAuthorityCohortBaselineV18Fixture(authority);

    expect(loaded).toEqual(AUTHORITY_COHORT_BASELINE_V18);
    expect(AUTHORITY_COHORT_BASELINE_V18_IDENTITY).toEqual({
      engineVersion: 'run-engine-v18',
      contentHash: '9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17',
      balanceModelVersion: 1,
      policy: { id: 'survival-greedy', version: 1 },
    });
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.entries[V18_BASELINE_KEY]).toMatchObject({
      identity: AUTHORITY_COHORT_BASELINE_V18_IDENTITY,
      source: {
        kind: 'authority-cohort-matrix',
        seeds: [0, 1, 2, 3, 4],
        cellCount: 3,
      },
    });
    expect(archivedFixture.document).toEqual(loaded);
    expect(generateAuthorityCohortBaselineV18(authority)).toEqual(loaded);
    expect(JSON.stringify(loaded)).not.toContain('"trace"');
  });

  it('keeps the v19 identity immutable and reproduces its baseline with the archive', async () => {
    const loaded = loadAuthorityCohortBaseline(
      baselineV19Json,
      AUTHORITY_COHORT_BASELINE_V19_IDENTITY,
    );
    const authority = await resolveArchivedAuthority(AUTHORITY_COHORT_BASELINE_V19_IDENTITY);
    const archivedFixture = createAuthorityCohortBaselineV19Fixture(authority);

    expect(loaded).toEqual(AUTHORITY_COHORT_BASELINE_V19);
    expect(AUTHORITY_COHORT_BASELINE_V19_IDENTITY).toEqual({
      engineVersion: 'run-engine-v19',
      contentHash: '45a1dbb93be5a25281ba6fce56517be382ddff6210dce9a55ef3d1ac7c971099',
      balanceModelVersion: 2,
      policy: { id: 'survival-greedy', version: 1 },
    });
    expect(archivedFixture.document).toEqual(loaded);
    expect(generateAuthorityCohortBaselineV19(authority)).toEqual(loaded);
    expect(JSON.stringify(loaded)).not.toContain('"trace"');
  }, 30_000);

  it('keeps the archived v20 ten-champion matrix reproducible', () => {
    const loaded = loadAuthorityCohortBaseline(
      baselineV20Json,
      AUTHORITY_COHORT_BASELINE_V20_IDENTITY,
    );

    expect(loaded).toEqual(AUTHORITY_COHORT_BASELINE_V20);
    expect(AUTHORITY_COHORT_BASELINE_V20_IDENTITY).toMatchObject({
      engineVersion: 'run-engine-v20',
      contentHash: '8308ebe66c3ee45850b68560b0449b6660b24c2a0e81a5070f6d1794620cac91',
      balanceModelVersion: 2,
    });
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.entries[V20_BASELINE_KEY]).toMatchObject({
      identity: AUTHORITY_COHORT_BASELINE_V20_IDENTITY,
      source: {
        kind: 'authority-cohort-matrix',
        seeds: [0, 1, 2, 3, 4],
        cellCount: 30,
      },
    });
    const entry = loaded.entries[V20_BASELINE_KEY]!;
    expect(
      AUTHORITY_COHORT_BASELINE_V20_CHAMPION_IDS.every((championId) =>
        entry.reports.some((report) =>
          report.scenarioId.includes(`solo-${championId.toLowerCase()}`),
        ),
      ),
    ).toBe(true);
    expect(entry.reports[0]?.metrics).toEqual(
      expect.objectContaining({
        'combat.player.shieldingAbsorbedPerRound': expect.any(Number),
        'combat.player.manaSpentPerRound': expect.any(Number),
        'combat.enemy.shieldingAbsorbedPerRound': expect.any(Number),
        'combat.enemy.manaSpentPerRound': expect.any(Number),
      }),
    );
    expect(generateAuthorityCohortBaselineV20(v20Authority)).toEqual(loaded);
    expect(JSON.stringify(loaded)).not.toContain('"trace"');
  }, 30_000);

  it('strictly loads the current v21 PR baseline across 45 cells and 30 paired seeds', () => {
    const loaded = loadAuthorityCohortBaseline(
      baselineV21Json,
      AUTHORITY_COHORT_BASELINE_V21_IDENTITY,
    );

    expect(loaded).toEqual(AUTHORITY_COHORT_BASELINE_V21);
    expect(AUTHORITY_COHORT_BASELINE_V21_IDENTITY).toMatchObject({
      engineVersion: AUTHORITY_ENGINE_VERSION,
      contentHash: AUTHORITY_CONTENT_HASH,
      balanceModelVersion: 2,
    });
    expect(loaded.entries[V21_BASELINE_KEY]).toMatchObject({
      source: {
        kind: 'authority-cohort-matrix',
        cellCount: 45,
        seeds: expect.arrayContaining([expect.any(Number)]),
      },
    });
    expect(loaded.entries[V21_BASELINE_KEY]?.source.seeds).toHaveLength(30);
    expect(loaded.entries[V21_BASELINE_KEY]?.reports).toHaveLength(45);
  });

  it('rejects unknown fields, missing metrics and incoherent index identities', () => {
    const unknownRoot = Object.assign(structuredClone(baselineV20Json), { unexpected: true });
    expect(() => loadAuthorityCohortBaseline(unknownRoot)).toThrowError(
      AuthorityCohortBaselineValidationError,
    );

    const missingMetric = structuredClone(baselineV20Json);
    const metrics = firstRawReport(missingMetric).metrics as Record<string, unknown>;
    delete metrics['outcome.winRate'];
    expect(() => loadAuthorityCohortBaseline(missingMetric)).toThrow('expected exactly keys');

    const incoherentIdentity = structuredClone(baselineV20Json);
    const identity = firstRawEntry(incoherentIdentity).identity as Record<string, unknown>;
    identity.contentHash = 'a'.repeat(64);
    expect(() => loadAuthorityCohortBaseline(incoherentIdentity)).toThrow('identity requires key');
  });

  it('rejects a current identity mismatch and missing report strata', () => {
    expect(() =>
      loadAuthorityCohortBaseline(baselineV20Json, {
        ...AUTHORITY_COHORT_BASELINE_V20_IDENTITY,
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
      identity: AUTHORITY_COHORT_BASELINE_V20_IDENTITY,
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
