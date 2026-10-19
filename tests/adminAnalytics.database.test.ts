import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseAdminAnalyticsFunnel,
  parseAdminAnalyticsRetention,
  parseAdminAnalyticsSeries,
} from '@/pages/admin/analytics/adminAnalyticsClient';
import {
  analyticsAttempt,
  analyticsCombat,
  analyticsFinish,
  analyticsRpc,
  analyticsScenario,
} from './helpers/adminAnalyticsFixtures';
import {
  cleanupExplorer,
  type ExplorerAccount,
  explorerAccount,
  explorerClient,
  explorerSql,
  hasAdminExplorerCredentials,
  rpcData,
} from './helpers/adminExplorerFixtures';

const describeDatabase = hasAdminExplorerCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials) {
  throw new Error(
    'Admin analytics tests require disposable loopback Supabase API and SQL credentials.',
  );
}
const filters = { from: '2024-02-01', to: '2024-02-01' };

describeDatabase('admin temporal aggregates on retained server events', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let admin: ExplorerAccount;
  let a: ExplorerAccount;
  let b: ExplorerAccount;
  let templateId: string;
  beforeAll(async () => {
    service = explorerClient('service');
    admin = await explorerAccount(service, users, { admin: true });
    a = await explorerAccount(service, users);
    b = await explorerAccount(service, users);
    const start = await rpcData(a.client, 'start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    templateId = start.attempt_id;
    explorerSql(
      `UPDATE public.run_attempts SET status='expired',expired_at=NOW() WHERE id='${templateId}'`,
    );
  });
  afterAll(async () => {
    await cleanupExplorer(service, users);
  });

  it('parses all three real RPC DTOs including an empty observed segment grid', async () => {
    for (const [resource, parser] of [
      ['series', parseAdminAnalyticsSeries],
      ['retention', parseAdminAnalyticsRetention],
      ['funnel', parseAdminAnalyticsFunnel],
    ] as const) {
      const value = await rpcData(admin.client, `admin_analytics_${resource}`, {
        p_filters: filters,
      });
      expect(() => parser(value, filters)).not.toThrow();
      expect(value.segments).toEqual([]);
      expect(JSON.stringify(value)).not.toMatch(
        /user_id|email|lease_token|payload_hash|raw_user_meta_data/,
      );
    }
  });

  it('counts >1000 starts exactly after statuses change and deduplicates active players', () => {
    const attempt = analyticsAttempt(templateId, a, '2024-02-01T12:00:00Z');
    const setup =
      attempt.sql +
      `INSERT INTO public.run_attempts SELECT (jsonb_populate_record(NULL::public.run_attempts,to_jsonb(t)||jsonb_build_object('id',gen_random_uuid(),'run_uuid','attempt_'||gen_random_uuid(),'start_command_id',gen_random_uuid()))).* FROM public.run_attempts t CROSS JOIN generate_series(1,1004)n WHERE t.id='${attempt.id}';`;
    const value = analyticsScenario(admin, [a], setup, analyticsRpc('series', filters));
    expect(value.buckets).toHaveLength(1);
    expect(value.buckets[0]).toMatchObject({ starts: 1005, activePlayers: 1, verifiedFinishes: 0 });
    expect(() => parseAdminAnalyticsSeries(value, filters)).not.toThrow();
  });

  it('uses verified_at for finishes whose start lies before the selected window', () => {
    const attempt = analyticsAttempt(templateId, a, '2024-01-31T23:59:59Z');
    const value = analyticsScenario(
      admin,
      [a],
      attempt.sql + analyticsFinish(attempt.id, a, '2024-02-01T00:00:00Z'),
      analyticsRpc('series', filters),
      { signup: '2024-01-01T00:00:00Z' },
    );
    expect(value.buckets).toHaveLength(1);
    expect(value.buckets[0]).toMatchObject({
      starts: 0,
      activePlayers: 0,
      verifiedFinishes: 1,
      wins: 1,
    });
    expect(() => parseAdminAnalyticsSeries(value, filters)).not.toThrow();
  });

  it('keeps Daily starts, verification date and challenge date distinct', () => {
    const attempt = analyticsAttempt(templateId, a, '2024-01-31T23:59:59Z', {
      mode: 'daily',
      daily_date: '2024-01-31',
      daily_ruleset_version: 2,
      daily_score_version: 1,
      daily_official: false,
    });
    const f = { from: '2024-01-31', to: '2024-02-01' };
    const value = analyticsScenario(
      admin,
      [a],
      attempt.sql + analyticsFinish(attempt.id, a, '2024-02-01T00:00:01Z'),
      analyticsRpc('series', f),
      { signup: '2024-01-01T00:00:00Z' },
    );
    expect(
      value.buckets.map((row: { dailyStarts: number; dailyVerifiedFinishes: number }) => [
        row.dailyStarts,
        row.dailyVerifiedFinishes,
      ]),
    ).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(() => parseAdminAnalyticsSeries(value, f)).not.toThrow();
  });

  it('anchors weeks on Monday, clips leap-day bounds and labels the current partial bucket', () => {
    const f = { from: '2024-02-28', to: '2024-03-05', granularity: 'week' } as const;
    const value = analyticsScenario(
      admin,
      [a],
      '',
      analyticsRpc('series', f, '2024-03-05T12:00:00Z'),
    );
    expect(
      value.acquisitions.map(
        (row: { bucketStartAt: string; bucketEndAt: string; isPartial: boolean }) => [
          row.bucketStartAt.slice(0, 10),
          row.bucketEndAt.slice(0, 10),
          row.isPartial,
        ],
      ),
    ).toEqual([
      ['2024-02-28', '2024-03-04', true],
      ['2024-03-04', '2024-03-06', true],
    ]);
    expect(value.acquisitions[1].observedEndAt).toBe('2024-03-05T12:00:00.000000Z');
    expect(() => parseAdminAnalyticsSeries(value, f)).not.toThrow();
  });

  it('distinguishes unknown, mixed and covered event buckets independently of period completeness', () => {
    for (const [marker, expected] of [
      ['2024-02-02T00:00:00Z', 'unknown'],
      ['2024-02-01T12:00:00Z', 'mixed'],
      ['2024-02-01T00:00:00Z', 'covered'],
    ]) {
      const value = analyticsScenario(admin, [a], '', analyticsRpc('series', filters), { marker });
      expect(value.acquisitions[0]).toMatchObject({ sourceCoverage: expected, isPartial: false });
      expect(() => parseAdminAnalyticsSeries(value, filters)).not.toThrow();
    }
  });

  it('assigns activity age at each event clock and leaves acquisitions global under filters', () => {
    const attempt = analyticsAttempt(templateId, a, '2024-02-01T23:00:00Z');
    const setup = attempt.sql + analyticsFinish(attempt.id, a, '2024-02-02T00:00:00Z');
    const f = { from: '2024-02-01', to: '2024-02-02', accountAge: 'new' } as const;
    const value = analyticsScenario(admin, [a], setup, analyticsRpc('series', f));
    expect(
      value.buckets.map((row: { starts: number; verifiedFinishes: number }) => [
        row.starts,
        row.verifiedFinishes,
      ]),
    ).toEqual([
      [1, 0],
      [0, 0],
    ]);
    const narrowed = analyticsScenario(
      admin,
      [a],
      setup,
      analyticsRpc('series', { ...f, engineVersion: 'unknown-engine' }),
    );
    expect(narrowed.segments).toEqual([]);
    expect(narrowed.acquisitions[0].accounts).toBe(1);
  });

  it('retains zero-attempt signups and chooses the global first observed attempt before filters', () => {
    const first = analyticsAttempt(templateId, a, '2024-02-01T01:00:00Z', {
      engine_version: 'first-engine',
    });
    const second = analyticsAttempt(templateId, a, '2024-02-01T02:00:00Z', {
      engine_version: 'later-engine',
    });
    const setup = first.sql + second.sql;
    const value = analyticsScenario(admin, [a, b], setup, analyticsRpc('retention', filters));
    expect(value.cohorts).toHaveLength(2);
    expect(value.segments.some((s: { id: string }) => s.id === 'unassigned')).toBe(true);
    expect(value.cohorts.every((cohort: { cohortSize: number }) => cohort.cohortSize === 1)).toBe(
      true,
    );
    expect(() => parseAdminAnalyticsRetention(value, filters)).not.toThrow();
    const narrowed = analyticsScenario(
      admin,
      [a, b],
      setup,
      analyticsRpc('retention', { ...filters, engineVersion: 'later-engine' }),
    );
    expect(narrowed.cohorts).toEqual([]);
  });

  it('measures exact UTC D1/D7/D30 without cumulative returns or account-age identity leakage', () => {
    const first = analyticsAttempt(templateId, a, '2024-02-01T23:59:59Z');
    const d1 = analyticsAttempt(templateId, a, '2024-02-02T00:00:00Z');
    const d2 = analyticsAttempt(templateId, a, '2024-02-03T00:00:00Z');
    const d7 = analyticsAttempt(templateId, a, '2024-02-08T00:00:00Z', { difficulty: 'hard' });
    const d30 = analyticsAttempt(templateId, a, '2024-03-02T00:00:00Z');
    const value = analyticsScenario(
      admin,
      [a],
      first.sql + d1.sql + d2.sql + d7.sql + d30.sql,
      analyticsRpc('retention', { ...filters, accountAge: 'new' }),
    );
    expect(value.cohorts[0]).toMatchObject({
      cohortSize: 1,
      covered: true,
      horizons: [
        { day: 1, eligibleN: 1, returnedAny: 1, returnedSame: 1 },
        { day: 7, eligibleN: 1, returnedAny: 1, returnedSame: 0 },
        { day: 30, eligibleN: 1, returnedAny: 1, returnedSame: 1 },
      ],
    });
    expect(() =>
      parseAdminAnalyticsRetention(value, { ...filters, accountAge: 'new' }),
    ).not.toThrow();
  });

  it('keeps observed returns while excluding historical, marker-day and immature denominators', () => {
    const first = analyticsAttempt(templateId, a, '2024-02-01T01:00:00Z');
    const returned = analyticsAttempt(templateId, a, '2024-02-02T01:00:00Z');
    const setup = first.sql + returned.sql;
    for (const marker of ['2024-02-01T00:00:00.000001Z', '2024-02-03T00:00:00Z']) {
      const value = analyticsScenario(admin, [a], setup, analyticsRpc('retention', filters), {
        marker,
      });
      expect(value.cohorts[0]).toMatchObject({
        covered: false,
        horizons: [{ eligibleN: 0, returnedAny: 1 }, { eligibleN: 0 }, { eligibleN: 0 }],
      });
      expect(() => parseAdminAnalyticsRetention(value, filters)).not.toThrow();
    }
    const young = analyticsScenario(
      admin,
      [a],
      setup,
      analyticsRpc('retention', filters, '2024-02-02T12:00:00Z'),
      { marker: '2024-02-01T00:00:00Z' },
    );
    expect(young.cohorts[0]).toMatchObject({
      covered: true,
      horizons: [
        { mature: false, eligibleN: 0, returnedAny: 1 },
        { mature: false },
        { mature: false },
      ],
    });
  });

  it('keeps the ordered funnel in the first attempt and restricts return to a later UTC day', () => {
    const first = analyticsAttempt(templateId, a, '2024-02-01T01:00:00Z');
    const sameDay = analyticsAttempt(templateId, a, '2024-02-01T04:00:00Z');
    const nextDay = analyticsAttempt(templateId, a, '2024-02-02T00:00:00Z', { difficulty: 'hard' });
    const afterHorizon = analyticsAttempt(templateId, a, '2024-02-09T00:00:00Z');
    const setup =
      first.sql +
      analyticsCombat(first.id, '2024-02-01T02:00:00Z') +
      analyticsFinish(first.id, a, '2024-02-01T03:00:00Z') +
      sameDay.sql +
      nextDay.sql +
      afterHorizon.sql;
    const value = analyticsScenario(admin, [a, b], setup, analyticsRpc('funnel', filters));
    const row = value.rows.find((r: { segmentId: string }) => r.segmentId !== 'unassigned');
    expect(row).toMatchObject({
      observed: {
        signups: 1,
        starts: 1,
        combatRequests: 1,
        verifiedFinishes: 1,
        returnedAny: 1,
        returnedSame: 0,
      },
      eligible: { signups: 1, returnedAny: 1, returnedSame: 0 },
    });
    expect(
      value.rows.find((r: { segmentId: string }) => r.segmentId === 'unassigned').observed,
    ).toMatchObject({ signups: 1, starts: 0 });
    expect(() => parseAdminAnalyticsFunnel(value, filters)).not.toThrow();
  });

  it('never replaces an abandoned first attempt by a later completed one or unordered commands', () => {
    const first = analyticsAttempt(templateId, a, '2024-02-01T01:00:00Z');
    const later = analyticsAttempt(templateId, a, '2024-02-01T04:00:00Z');
    const invalid = analyticsAttempt(templateId, b, '2024-02-01T05:00:00Z');
    const setup =
      first.sql +
      later.sql +
      analyticsCombat(later.id, '2024-02-01T05:00:00Z') +
      analyticsFinish(later.id, a, '2024-02-01T06:00:00Z') +
      invalid.sql +
      analyticsCombat(invalid.id, '2024-02-01T04:59:59Z') +
      analyticsFinish(invalid.id, b, '2024-02-01T06:00:00Z');
    const value = analyticsScenario(admin, [a, b], setup, analyticsRpc('funnel', filters));
    expect(value.rows[0].observed).toEqual({
      signups: 2,
      starts: 2,
      combatRequests: 0,
      verifiedFinishes: 0,
      returnedAny: 0,
      returnedSame: 0,
    });
  });

  it('requires the full seven-day follow-up and keeps unknown coverage separate from immaturity', () => {
    const first = analyticsAttempt(templateId, a, '2024-02-01T01:00:00Z');
    const young = analyticsScenario(
      admin,
      [a],
      first.sql,
      analyticsRpc('funnel', filters, '2024-02-08T23:59:59Z'),
    );
    expect(young.rows[0]).toMatchObject({
      observed: { signups: 1 },
      eligible: { signups: 0 },
      excludedImmatureN: 1,
      excludedUnknownCoverageN: 0,
    });
    const old = analyticsScenario(admin, [a], first.sql, analyticsRpc('funnel', filters), {
      marker: '2024-02-02T00:00:00Z',
    });
    expect(old.rows[0]).toMatchObject({
      eligible: { signups: 0 },
      excludedImmatureN: 0,
      excludedUnknownCoverageN: 1,
    });
    expect(() => parseAdminAnalyticsFunnel(young, filters)).not.toThrow();
    expect(() => parseAdminAnalyticsFunnel(old, filters)).not.toThrow();
  });

  it('excludes anonymous, pre-signup and future starts without treating logins as historical activity', () => {
    const before = analyticsAttempt(templateId, a, '2024-01-31T23:59:59Z');
    const future = analyticsAttempt(templateId, a, '2024-04-11T00:00:00Z');
    const anon = analyticsAttempt(templateId, b, '2024-02-01T12:00:00Z');
    const setup =
      before.sql +
      future.sql +
      anon.sql +
      `UPDATE auth.users SET is_anonymous=TRUE WHERE id='${b.userId}'; UPDATE public.players SET last_login_at='2024-02-01T12:00:00Z' WHERE id='${a.playerId}';`;
    const value = analyticsScenario(
      admin,
      [a, b],
      setup,
      analyticsRpc('series', { from: '2024-01-31', to: '2024-04-10' }),
    );
    expect(value.segments).toEqual([]);
    expect(
      value.acquisitions.reduce((n: number, row: { accounts: number }) => n + row.accounts, 0),
    ).toBe(1);
  });

  it('has session-timezone-independent prepared results and preserves the real marker after fixtures', () => {
    const before = explorerSql('SELECT started_at::text FROM private.admin_analytics_coverage');
    const first = analyticsAttempt(templateId, a, '2024-02-01T01:00:00Z');
    const utc = analyticsScenario(admin, [a], first.sql, analyticsRpc('series', filters));
    const shifted = analyticsScenario(admin, [a], first.sql, analyticsRpc('series', filters), {
      timezone: 'Pacific/Kiritimati',
    });
    expect(shifted).toEqual(utc);
    const prepared = explorerSql(`BEGIN;
      SELECT set_config('request.jwt.claims','{"sub":"${admin.userId}","role":"authenticated"}',TRUE);
      SET LOCAL ROLE authenticated;
      SET LOCAL TIME ZONE 'UTC';
      PREPARE analytics_temporal_plan AS SELECT ${analyticsRpc('series', filters)};
      EXECUTE analytics_temporal_plan;
      SET LOCAL TIME ZONE 'Pacific/Kiritimati';
      EXECUTE analytics_temporal_plan;
      DEALLOCATE analytics_temporal_plan;
      ROLLBACK;`)
      .split('\n')
      .filter((line) => line.includes('"snapshotAt"'))
      .map((line) => JSON.parse(line));
    expect(prepared).toHaveLength(2);
    expect(prepared[1]).toEqual(prepared[0]);
    expect(explorerSql('SELECT started_at::text FROM private.admin_analytics_coverage')).toBe(
      before,
    );
    explorerSql(
      'INSERT INTO private.admin_analytics_coverage(singleton)VALUES(TRUE)ON CONFLICT DO NOTHING',
    );
    expect(explorerSql('SELECT started_at::text FROM private.admin_analytics_coverage')).toBe(
      before,
    );
    expect(() =>
      explorerSql('UPDATE private.admin_analytics_coverage SET started_at=NOW()'),
    ).toThrow(/admin_analytics_coverage_immutable/);
  });

  it.each([
    {},
    { from: '2024-02-01' },
    { ...filters, from: '2024-02-30' },
    { ...filters, to: '2024-01-31' },
    { from: '2023-01-01', to: '2024-02-01' },
    { from: '2999-01-01', to: '2999-01-02' },
    { ...filters, injected: true },
    { ...filters, gameplayVersion: 1.5 },
    { ...filters, mode: 'guest' },
  ])('rejects invalid/missing/future/unbounded filters: %j', async (invalid) => {
    const response = await admin.client.rpc('admin_analytics_series', { p_filters: invalid });
    expect(response.data).toBeNull();
    expect(response.error?.code).toBe('22023');
  });

  it('rejects future/nonfinite snapshots and excessive segment output instead of truncating', async () => {
    for (const snapshot of ['2999-01-01T00:00:00Z', 'infinity']) {
      const response = await admin.client.rpc('admin_analytics_series', {
        p_filters: filters,
        p_snapshot: snapshot,
      });
      expect(response.error?.code).toBe('22023');
    }
    const setup = Array.from(
      { length: 33 },
      (_, i) =>
        analyticsAttempt(templateId, a, '2024-02-01T12:00:00Z', {
          engine_version: `test-engine-${i}`,
        }).sql,
    ).join('');
    expect(() => analyticsScenario(admin, [a], setup, analyticsRpc('series', filters))).toThrow(
      /admin_analytics_too_many_segments/,
    );
    expect(() => explorerSql('SELECT private.admin_analytics_count(9007199254740992)')).toThrow(
      /admin_analytics_count_out_of_range/,
    );
  });
});
