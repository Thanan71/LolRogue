import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionRegistry';
import { createObservedFetch } from '@/observability/observedFetch';
import {
  evaluateTechnicalMetrics,
  getTechnicalMetricSnapshot,
  recordTechnicalMetric,
  resetTechnicalMetrics,
  TECHNICAL_ENDPOINTS,
  TECHNICAL_METRIC_POLICY,
  type TechnicalMetric,
} from '@/observability/technicalMetrics';

describe('minimized technical metrics', () => {
  beforeEach(resetTechnicalMetrics);

  it('counts bursts without the diagnostic event sampling bias and expires the window', () => {
    for (let index = 0; index < 100; index += 1) {
      recordTechnicalMetric({ metric: 'run_start', outcome: index < 5 ? 'error' : 'ok' }, 60_000);
    }
    expect(evaluateTechnicalMetrics(60_000)).toMatchObject([
      { count: 100, failures: 5, failureRate: 0.05, alert: true },
    ]);
    expect(getTechnicalMetricSnapshot(16 * 60_000).buckets).toEqual([]);
    expect(evaluateTechnicalMetrics(16 * 60_000)).toEqual([]);
  });

  it('reconstructs an allowlisted envelope and never retains arbitrary input', () => {
    recordTechnicalMetric(
      {
        metric: 'auth',
        outcome: 'error',
        code: 'email@secret.test',
        endpoint: '/token?password=secret',
        userId: 'private-user',
        commands: ['gameplay'],
        engineVersion: 'private-engine',
        progressionRulesetVersion: 'private-rule',
      } as unknown as TechnicalMetric,
      60_000,
    );
    const snapshot = getTechnicalMetricSnapshot(60_000);
    expect(snapshot.buckets).toMatchObject([
      {
        metric: 'auth',
        endpoint: 'other',
        code: 'request_failed',
        engineVersion: 'unknown',
        gameplayRulesetVersion: null,
        progressionRulesetVersion: null,
        clientEngineVersion: CURRENT_AUTHORITY_VERSION.engine,
        clientGameplayRulesetVersion: CURRENT_AUTHORITY_VERSION.gameplay,
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/secret|private|gameplay\"|commands|userId/);
    snapshot.buckets[0]!.count = 999;
    expect(getTechnicalMetricSnapshot(60_000).buckets[0]!.count).toBe(1);
  });

  it('treats insufficient samples and overflow as unknown instead of healthy', () => {
    recordTechnicalMetric({ metric: 'auth', outcome: 'ok' }, 60_000);
    expect(evaluateTechnicalMetrics(60_000)[0]!.alert).toBeNull();
    for (let minute = 1; minute <= 15; minute += 1) {
      for (const endpoint of TECHNICAL_ENDPOINTS) {
        for (const outcome of ['ok', 'error'] as const) {
          recordTechnicalMetric({ metric: 'postgrest', endpoint, outcome }, minute * 60_000);
        }
      }
    }
    const snapshot = getTechnicalMetricSnapshot(15 * 60_000);
    expect(snapshot.buckets).toHaveLength(TECHNICAL_METRIC_POLICY.maxSeries);
    expect(snapshot.droppedSamples).toBeGreaterThan(0);
    expect(evaluateTechnicalMetrics(15 * 60_000).every((group) => group.alert === null)).toBe(true);
    expect(getTechnicalMetricSnapshot(30 * 60_000)).toMatchObject({
      buckets: [],
      droppedSamples: 0,
    });
    for (let index = 0; index < 20; index += 1) {
      recordTechnicalMetric({ metric: 'auth', outcome: 'ok' }, 30 * 60_000);
    }
    expect(evaluateTechnicalMetrics(30 * 60_000)).toMatchObject([{ count: 20, alert: false }]);
  });

  it('keeps resumed attempt versions separate from the client and unknown failures', () => {
    recordTechnicalMetric({
      metric: 'run_seal',
      outcome: 'ok',
      engineVersion: 'run-engine-v19',
      gameplayRulesetVersion: 19,
    });
    recordTechnicalMetric({
      metric: 'run_seal',
      outcome: 'error',
      engineVersion: 'run-engine-v20',
      gameplayRulesetVersion: 20,
    });
    recordTechnicalMetric({ metric: 'run_start', outcome: 'error' });
    expect(getTechnicalMetricSnapshot().buckets).toMatchObject([
      { engineVersion: 'run-engine-v19', gameplayRulesetVersion: 19, outcome: 'ok' },
      { engineVersion: 'run-engine-v20', gameplayRulesetVersion: 20, outcome: 'error' },
      { engineVersion: 'unknown', gameplayRulesetVersion: null, outcome: 'error' },
    ]);
  });

  it('includes unknown failed starts in the client denominator alongside versioned successes', () => {
    for (let index = 0; index < 100; index += 1) {
      recordTechnicalMetric({
        metric: 'run_start',
        outcome: index < 5 ? 'error' : 'ok',
        ...(index < 5 ? {} : { engineVersion: 'run-engine-v20', gameplayRulesetVersion: 20 }),
      });
    }
    expect(evaluateTechnicalMetrics()).toMatchObject([
      {
        metric: 'run_start',
        clientEngineVersion: CURRENT_AUTHORITY_VERSION.engine,
        clientGameplayRulesetVersion: CURRENT_AUTHORITY_VERSION.gameplay,
        count: 100,
        failures: 5,
        failureRate: 0.05,
        alert: true,
      },
    ]);
    expect(evaluateTechnicalMetrics()).toHaveLength(1);
  });

  it('keeps independent progression rulesets in distinct buckets for the same gameplay version', () => {
    for (const progressionRulesetVersion of [2, 3]) {
      recordTechnicalMetric({
        metric: 'run_seal',
        outcome: 'ok',
        engineVersion: 'run-engine-v21',
        gameplayRulesetVersion: 21,
        progressionRulesetVersion,
      });
    }
    expect(getTechnicalMetricSnapshot().buckets).toMatchObject([
      { gameplayRulesetVersion: 21, progressionRulesetVersion: 2, count: 1 },
      { gameplayRulesetVersion: 21, progressionRulesetVersion: 3, count: 1 },
    ]);
    expect(getTechnicalMetricSnapshot().buckets).toHaveLength(2);
    expect(evaluateTechnicalMetrics()).toMatchObject([{ count: 2 }]);
  });

  it('counts finalization retries against all attempts and flags every hydration error', () => {
    for (let index = 0; index < 20; index += 1) {
      recordTechnicalMetric({
        metric: 'run_finalization',
        outcome: index < 2 ? 'retry' : 'initial',
      });
    }
    recordTechnicalMetric({ metric: 'rehydration', outcome: 'error', code: 'invalid_state' });
    expect(evaluateTechnicalMetrics()).toMatchObject([
      { metric: 'run_finalization', count: 20, failures: 2, failureRate: 0.1, alert: true },
      { metric: 'rehydration', count: 1, alert: true },
    ]);
  });

  it('applies the stricter one-percent threshold to broken assets', () => {
    for (let index = 0; index < 100; index += 1) {
      recordTechnicalMetric({ metric: 'asset', outcome: index === 0 ? 'error' : 'ok' });
    }
    expect(evaluateTechnicalMetrics()).toMatchObject([
      { metric: 'asset', count: 100, failures: 1, failureRate: 0.01, alert: true },
    ]);
  });
});

describe('observed Supabase fetch', () => {
  beforeEach(resetTechnicalMetrics);
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('preserves the response and original rejection even if instrumentation fails', async () => {
    const response = new Response(null, { status: 204 });
    const error = new DOMException('Aborted', 'AbortError');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response)
      .mockRejectedValueOnce(error);
    const observed = createObservedFetch('https://db.test', fetcher);
    vi.spyOn(Date, 'now').mockImplementation(() => {
      throw new Error('Instrumentation failed');
    });
    expect(await observed('https://db.test/rest/v1/players')).toBe(response);
    await expect(observed('https://db.test/auth/v1/token')).rejects.toBe(error);
  });

  it('uses the current global fetch and forwards a Request and abort signal unchanged', async () => {
    const previousFetch = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', previousFetch);
    const observed = createObservedFetch('https://db.test');
    const response = new Response(null, { status: 204 });
    const currentFetch = vi.fn<typeof fetch>().mockResolvedValue(response);
    vi.stubGlobal('fetch', currentFetch);
    const request = new Request('https://db.test/rest/v1/runs');
    const init = { signal: AbortSignal.abort(), redirect: 'manual' as const };
    expect(await observed(request, init)).toBe(response);
    expect(previousFetch).not.toHaveBeenCalled();
    expect(currentFetch).toHaveBeenCalledWith(request, init);
    expect(getTechnicalMetricSnapshot().buckets).toMatchObject([
      { metric: 'postgrest', endpoint: 'runs', outcome: 'ok', count: 1 },
    ]);
  });

  it('preserves responses and only records endpoint/status, including profile errors', async () => {
    const response = new Response('{"private":"body"}', { status: 503 });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    const observed = createObservedFetch('https://db.test', fetcher);
    const init = {
      headers: { Authorization: 'Bearer secret' },
      body: 'password=private',
      method: 'POST',
    };
    expect(await observed('https://db.test/rest/v1/players?user_id=eq.private-user', init)).toBe(
      response,
    );
    expect(fetcher).toHaveBeenCalledWith(
      'https://db.test/rest/v1/players?user_id=eq.private-user',
      init,
    );
    expect(response.bodyUsed).toBe(false);
    expect(getTechnicalMetricSnapshot().buckets).toMatchObject([
      { metric: 'postgrest', endpoint: 'players', outcome: 'error', code: 'http_5xx' },
      { metric: 'profile', endpoint: 'players', outcome: 'error', code: 'http_5xx' },
    ]);
    expect(JSON.stringify(getTechnicalMetricSnapshot())).not.toMatch(
      /private|secret|Bearer|password/,
    );
  });

  it('counts auth and network failures, preserves throws and ignores logs/foreign requests', async () => {
    const error = new Error('secret network details');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    const observed = createObservedFetch('https://db.test', fetcher);
    await observed(new URL('https://db.test/auth/v1/token?grant_type=password'));
    fetcher.mockRejectedValueOnce(error);
    await expect(observed('https://db.test/rest/v1/rpc/seal_run_attempt')).rejects.toBe(error);
    await observed('https://db.test/rest/v1/rpc/submit_client_logs');
    await observed('https://db.test/rest/v1/logs');
    await observed('https://unrelated.test/rest/v1/players');
    expect(getTechnicalMetricSnapshot().buckets).toMatchObject([
      { metric: 'auth', endpoint: 'token', outcome: 'error', code: 'http_4xx' },
      {
        metric: 'postgrest',
        endpoint: 'seal_run_attempt',
        outcome: 'error',
        code: 'network_error',
      },
    ]);
    expect(getTechnicalMetricSnapshot().buckets).toHaveLength(2);
  });
});
