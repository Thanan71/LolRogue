import {
  CURRENT_AUTHORITY_VERSION,
  isKnownAuthorityEngine,
} from '@/game/authority/versionRegistry';

export const TECHNICAL_METRIC_POLICY = {
  windowMinutes: 15,
  maxSeries: 1024,
  minimumRequests: 20,
  successTarget: 0.99,
  errorAlertRate: 0.05,
  retryAlertRate: 0.1,
  assetErrorAlertRate: 0.01,
} as const;

// Only route names are retained. Query strings, headers and bodies never enter a metric.
export const TECHNICAL_ENDPOINTS = [
  'other',
  'token',
  'signup',
  'logout',
  'user',
  'recover',
  'verify',
  'resend',
  'players',
  'runs',
  'run_team_members',
  'run_attempts',
  'champion_enhancements',
  'champion_mastery',
  'daily_runs',
  'daily_leaderboard',
  'leaderboard',
  'player_unlocks',
  'authority_attempt_aggregates',
  'authority_recent_rejections',
  'admin_stats',
  'admin_player_stats',
  'start_run_attempt',
  'start_daily_run_attempt',
  'append_run_attempt_commands',
  'seal_run_attempt',
  'get_run_attempt_status',
  'get_daily_challenge',
  'get_my_leaderboard_rank',
  'save_completed_run',
  'set_leaderboard_privacy',
  'report_daily_score',
  'invalidate_daily_score',
  'unlock_champion_enhancement',
  'touch_player_last_login',
  'daily_score_reports',
  'admin_verified_field_augment_cohorts',
  'admin_verified_field_champion_cohorts',
  'admin_verified_field_cohorts',
] as const;
const metrics = [
  'run_start',
  'run_seal',
  'run_finalization',
  'auth',
  'profile',
  'postgrest',
  'asset',
  'rehydration',
] as const;
const outcomes = ['ok', 'error', 'initial', 'retry'] as const;
const codes = [
  'ok',
  'request_failed',
  'invalid_response',
  'network_error',
  'http_4xx',
  'http_5xx',
  'placeholder',
  'invalid_state',
  'storage_unavailable',
  'initial',
  'retry',
] as const;

export interface TechnicalAttemptContext {
  engineVersion?: string;
  gameplayRulesetVersion?: number;
}

export interface TechnicalMetric extends TechnicalAttemptContext {
  metric: (typeof metrics)[number];
  outcome: (typeof outcomes)[number];
  code?: (typeof codes)[number];
  endpoint?: string;
}

export interface TechnicalMetricBucket {
  minute: number;
  metric: TechnicalMetric['metric'];
  outcome: TechnicalMetric['outcome'];
  code: (typeof codes)[number];
  endpoint: (typeof TECHNICAL_ENDPOINTS)[number];
  engineVersion: string;
  gameplayRulesetVersion: number | null;
  clientEngineVersion: string;
  clientGameplayRulesetVersion: number;
  count: number;
}

const buckets = new Map<string, TechnicalMetricBucket>();
const droppedByMinute = new Map<number, number>();

export function technicalEndpoint(value: string): (typeof TECHNICAL_ENDPOINTS)[number] {
  return TECHNICAL_ENDPOINTS.find((endpoint) => endpoint === value) ?? 'other';
}

function prune(now: number): void {
  const firstMinute = Math.floor(now / 60_000) - TECHNICAL_METRIC_POLICY.windowMinutes + 1;
  for (const [key, bucket] of buckets) {
    if (bucket.minute < firstMinute || bucket.minute > Math.floor(now / 60_000))
      buckets.delete(key);
  }
  for (const minute of droppedByMinute.keys()) {
    if (minute < firstMinute || minute > Math.floor(now / 60_000)) droppedByMinute.delete(minute);
  }
}

/** Local counters have no transport, identity, free text or gameplay payload. */
export function recordTechnicalMetric(input: TechnicalMetric, now = Date.now()): void {
  if (!Number.isFinite(now) || !metrics.includes(input.metric) || !outcomes.includes(input.outcome))
    return;
  prune(now);
  const bucket: TechnicalMetricBucket = {
    minute: Math.floor(now / 60_000),
    metric: input.metric,
    outcome: input.outcome,
    code:
      codes.find((code) => code === input.code) ??
      (input.outcome === 'error' ? 'request_failed' : input.outcome),
    endpoint: technicalEndpoint(input.endpoint ?? 'other'),
    engineVersion:
      typeof input.engineVersion === 'string' && isKnownAuthorityEngine(input.engineVersion)
        ? input.engineVersion
        : 'unknown',
    gameplayRulesetVersion:
      Number.isSafeInteger(input.gameplayRulesetVersion) &&
      input.gameplayRulesetVersion! > 0 &&
      input.gameplayRulesetVersion! <= CURRENT_AUTHORITY_VERSION.gameplay
        ? input.gameplayRulesetVersion!
        : null,
    clientEngineVersion: CURRENT_AUTHORITY_VERSION.engine,
    clientGameplayRulesetVersion: CURRENT_AUTHORITY_VERSION.gameplay,
    count: 1,
  };
  const key = JSON.stringify([
    bucket.minute,
    bucket.metric,
    bucket.outcome,
    bucket.code,
    bucket.endpoint,
    bucket.engineVersion,
    bucket.gameplayRulesetVersion,
  ]);
  const existing = buckets.get(key);
  if (existing) existing.count += 1;
  else if (buckets.size < TECHNICAL_METRIC_POLICY.maxSeries) buckets.set(key, bucket);
  else droppedByMinute.set(bucket.minute, (droppedByMinute.get(bucket.minute) ?? 0) + 1);
}

export function getTechnicalMetricSnapshot(now = Date.now()): {
  windowMinutes: number;
  droppedSamples: number;
  buckets: TechnicalMetricBucket[];
} {
  prune(now);
  return {
    windowMinutes: TECHNICAL_METRIC_POLICY.windowMinutes,
    droppedSamples: [...droppedByMinute.values()].reduce((sum, count) => sum + count, 0),
    buckets: [...buckets.values()].map((bucket) => ({ ...bucket })),
  };
}

/** Diagnostic ratios only: a local tab cannot establish a fleet-wide SLO. */
export function evaluateTechnicalMetrics(now = Date.now()) {
  const snapshot = getTechnicalMetricSnapshot(now);
  const grouped = new Map<
    string,
    {
      metric: TechnicalMetric['metric'];
      endpoint: string;
      clientEngineVersion: string;
      clientGameplayRulesetVersion: number;
      count: number;
      failures: number;
    }
  >();
  for (const bucket of snapshot.buckets) {
    // Failed starts may never receive an attempt version. Their failures must share
    // the successful request denominator from the same client, including resumes.
    const key = `${bucket.metric}:${bucket.endpoint}:${bucket.clientEngineVersion}:${bucket.clientGameplayRulesetVersion}`;
    const group = grouped.get(key) ?? {
      metric: bucket.metric,
      endpoint: bucket.endpoint,
      clientEngineVersion: bucket.clientEngineVersion,
      clientGameplayRulesetVersion: bucket.clientGameplayRulesetVersion,
      count: 0,
      failures: 0,
    };
    group.count += bucket.count;
    if (bucket.outcome === 'error' || bucket.outcome === 'retry') group.failures += bucket.count;
    grouped.set(key, group);
  }
  return [...grouped.values()].map((group) => {
    const failureRate = group.failures / group.count;
    const threshold =
      group.metric === 'run_finalization'
        ? TECHNICAL_METRIC_POLICY.retryAlertRate
        : group.metric === 'asset'
          ? TECHNICAL_METRIC_POLICY.assetErrorAlertRate
          : TECHNICAL_METRIC_POLICY.errorAlertRate;
    return {
      ...group,
      failureRate,
      alert:
        snapshot.droppedSamples > 0
          ? null
          : group.metric === 'rehydration'
            ? group.failures > 0
            : group.count < TECHNICAL_METRIC_POLICY.minimumRequests
              ? null
              : failureRate >= threshold,
    };
  });
}

export function resetTechnicalMetrics(): void {
  buckets.clear();
  droppedByMinute.clear();
}

if (import.meta.env.VITE_ENABLE_DB_LOGGING === 'true' && typeof window !== 'undefined') {
  // Opt-in support console export. No network, mutable counters or game state are exposed.
  Object.defineProperty(window, 'lolrogueTechnicalMetrics', {
    configurable: true,
    value: () => ({ ...getTechnicalMetricSnapshot(), evaluation: evaluateTechnicalMetrics() }),
  });
}
