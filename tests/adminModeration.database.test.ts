import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  parseModerationQueue,
  parseModerationHistory,
  parseModerationReceipt,
} from '@/pages/admin/moderation/moderationValidation';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cleanupExplorer,
  type ExplorerAccount,
  explorerAccount,
  explorerClient,
  explorerSql,
  hasAdminExplorerCredentials,
  rpcData,
} from './helpers/adminExplorerFixtures';
import {
  clearModerationCounters,
  clearModerationEvents,
  decide,
  moderationDecision,
  moderationFixture,
  moderationReason,
  sqlText,
  seedModerationQuota,
} from './helpers/adminModerationDatabaseFixtures';

const describeDatabase = hasAdminExplorerCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials)
  throw new Error('Moderation tests require disposable loopback Supabase API and SQL credentials.');

describeDatabase('audited moderation commands and complete queue', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let admin: ExplorerAccount;
  let otherAdmin: ExplorerAccount;
  let player: ExplorerAccount;
  beforeAll(async () => {
    service = explorerClient('service');
    admin = await explorerAccount(service, users, { admin: true });
    otherAdmin = await explorerAccount(service, users, { admin: true });
    player = await explorerAccount(service, users);
  });
  beforeEach(() => {
    clearModerationCounters([admin, otherAdmin, player]);
    clearModerationEvents(users);
  });
  afterAll(async () => {
    clearModerationEvents(users);
    await cleanupExplorer(service, users);
  });

  it('paginates beyond the 101st old report, with stable equal-time UUID ordering and complete server counts', async () => {
    explorerSql(`INSERT INTO public.daily_runs(id,player_id,daily_date,daily_seed,completed_at)
      SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${player.playerId}','1900-01-01',n,NOW()
      FROM generate_series(1,103)n;
      INSERT INTO public.daily_score_reports(id,daily_run_id,reporter_user_id,reason,created_at,status,reviewed_at)
      SELECT ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${player.userId}',${sqlText(moderationReason)},
      '1900-01-01T12:00:00Z',CASE WHEN n=102 THEN 'actioned' WHEN n=103 THEN 'dismissed' ELSE 'open' END,
      CASE WHEN n>101 THEN NOW() END FROM generate_series(1,103)n;`);
    const query = { p_from: '1900-01-01', p_to: '1900-01-01', p_limit: 50 };
    try {
      const first = await rpcData(admin.client, 'admin_moderation_queue', query);
      expect(first).toMatchObject({ total: 101, counts: { open: 101, resolved: 1, dismissed: 1 } });
      expect(first.rows).toHaveLength(50);
      const second = await rpcData(admin.client, 'admin_moderation_queue', {
        ...query,
        p_cursor: first.nextCursor,
        p_snapshot: first.snapshotAt,
      });
      const third = await rpcData(admin.client, 'admin_moderation_queue', {
        ...query,
        p_cursor: second.nextCursor,
        p_snapshot: first.snapshotAt,
      });
      expect(third.rows).toHaveLength(1);
      expect(third.rows[0].reportId).toBe('20000000-0000-4000-8000-000000000101');
      expect(third.nextCursor).toBeNull();
      expect(
        new Set(
          [...first.rows, ...second.rows, ...third.rows].map(
            (r: { reportId: string }) => r.reportId,
          ),
        ).size,
      ).toBe(101);
      const resolved = await rpcData(admin.client, 'admin_moderation_queue', {
        ...query,
        p_status: 'resolved',
      });
      expect(resolved.rows[0].status).toBe('resolved');
      expect(resolved.total).toBe(1);
    } finally {
      explorerSql(
        `DELETE FROM public.daily_runs WHERE player_id='${player.playerId}' AND daily_date='1900-01-01'`,
      );
    }
  });

  it('returns explicit empty queues and filters exact target IDs and UTC calendar edges', async () => {
    const fixture = moderationFixture(player, player, { createdAt: '2024-02-29T23:59:59.999999Z' });
    const data = await rpcData(admin.client, 'admin_moderation_queue', {
      p_from: '2024-02-29',
      p_to: '2024-02-29',
      p_daily_run_id: fixture.dailyRunId,
    });
    expect(data.rows).toHaveLength(1);
    const empty = await rpcData(admin.client, 'admin_moderation_queue', {
      p_from: '2024-03-01',
      p_to: '2024-03-01',
      p_daily_run_id: fixture.dailyRunId,
    });
    expect(empty).toMatchObject({
      total: 0,
      rows: [],
      nextCursor: null,
      counts: { open: 0, resolved: 0, dismissed: 0 },
    });
  });

  it('keeps legacy reopened review timestamps visible instead of inventing a new history', async () => {
    const fixture = moderationFixture(player, player, { createdAt: '2024-02-29T00:00:00Z' });
    explorerSql(
      `UPDATE public.daily_score_reports SET reviewed_at='2024-01-01T00:00:00Z' WHERE id='${fixture.reportId}';`,
    );
    const queue = parseModerationQueue(
      await rpcData(admin.client, 'admin_moderation_queue', { p_daily_run_id: fixture.dailyRunId }),
    );
    expect(queue.rows[0]).toMatchObject({
      status: 'open',
      reviewedAt: '2024-01-01T00:00:00+00:00',
    });
    expect(queue.rows[0].createdAt).toBe('2024-02-29T00:00:00+00:00');
  });

  it.each([
    { p_status: 'actioned' },
    { p_limit: 0 },
    { p_limit: 51 },
    { p_from: '2024-02-02', p_to: '2024-02-01' },
    { p_snapshot: 'infinity' },
    { p_snapshot: '2999-01-01T00:00:00Z' },
    { p_cursor: { id: randomUUID() } },
  ])('rejects an invalid bounded queue query %j', async (args) => {
    expect((await admin.client.rpc('admin_moderation_queue', args)).error?.code).toBe('22023');
  });

  it('atomically invalidates eligibility and all open reports, preserving the original authoritative run/result', async () => {
    const fixture = moderationFixture(player, player);
    const otherReport = randomUUID();
    explorerSql(`INSERT INTO public.daily_score_reports(id,daily_run_id,reporter_user_id,reason)
      VALUES('${otherReport}','${fixture.dailyRunId}','${admin.userId}',${sqlText(moderationReason)});`);
    const snapshot = () =>
      explorerSql(`SELECT md5(jsonb_build_object('runs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.runs r),
      'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.run_attempts a),
      'daily',(SELECT to_jsonb(d)-ARRAY['invalidated_at','invalidated_by','invalidation_reason'] FROM public.daily_runs d WHERE id='${fixture.dailyRunId}'))::text)`);
    const before = snapshot();
    const args = moderationDecision(fixture);
    const actualQueue = await rpcData(admin.client, 'admin_moderation_queue', {
      p_daily_run_id: fixture.dailyRunId,
    });
    expect(parseModerationQueue(actualQueue).rows).toHaveLength(2);
    const applied = await decide(admin.client, args);
    expect(parseModerationReceipt(applied)).toMatchObject({ outcome: 'applied' });
    expect(applied).toMatchObject({
      outcome: 'applied',
      code: 'score_invalidated',
      reportId: fixture.reportId,
      dailyRunId: fixture.dailyRunId,
    });
    expect(snapshot()).toBe(before);
    const reports = JSON.parse(
      explorerSql(
        `SELECT jsonb_agg(status) FROM public.daily_score_reports WHERE daily_run_id='${fixture.dailyRunId}'`,
      ),
    );
    expect(reports).toEqual(['actioned', 'actioned']);
    const replay = await decide(admin.client, args);
    expect(replay).toEqual({ ...applied, outcome: 'replayed' });
    expect(
      explorerSql(
        `SELECT attempts FROM private.moderation_rate_windows WHERE actor_user_id='${admin.userId}' AND kind='decision_minute'`,
      ),
    ).toBe('1');
    const history = await rpcData(admin.client, 'admin_moderation_history', {
      p_daily_run_id: fixture.dailyRunId,
    });
    expect(parseModerationHistory(history).total).toBe(1);
    expect(history.rows[0]).toMatchObject({
      id: applied.auditId,
      actorId: admin.userId,
      reason: moderationReason,
      code: 'score_invalidated',
    });
  });

  it('replays an admitted receipt after reporter erasure while keeping history anonymized', async () => {
    const reporter = await explorerAccount(service, users);
    const fixture = moderationFixture(player, reporter);
    const args = moderationDecision(fixture, { p_action: 'dismiss_report' });
    const first = await decide(admin.client, args);
    expect((await service.auth.admin.deleteUser(reporter.userId)).error).toBeNull();
    users.splice(users.indexOf(reporter.userId), 1);
    const replay = parseModerationReceipt(await decide(admin.client, args));
    expect(replay).toEqual({ ...first, outcome: 'replayed' });
    const history = parseModerationHistory(
      await rpcData(admin.client, 'admin_moderation_history', {
        p_daily_run_id: fixture.dailyRunId,
      }),
    );
    expect(history.rows[0].reportId).toBeNull();
  });

  it('backfills historical invalidations without inventing request keys or rewriting original evidence', async () => {
    const fixture = moderationFixture(player, player, { invalidated: true, status: 'actioned' });
    const id = randomUUID();
    explorerSql(`INSERT INTO public.daily_score_invalidation_audit(id,daily_run_id,actor_user_id,reason,invalidated_at)
      VALUES('${id}','${fixture.dailyRunId}',NULL,'Evidence from person@example.test token=historical-secret',NOW()-INTERVAL '2 days');`);
    const migration = readFileSync(
      new URL(
        '../supabase/migrations/20261018082740_admin_audited_moderation.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const backfill = migration.match(
      /INSERT INTO private\.moderation_events[\s\S]*?FROM\s+public\.daily_score_invalidation_audit a;/,
    )?.[0];
    expect(backfill).toBeDefined();
    explorerSql(backfill!.replace(/a;$/, `a WHERE a.id='${id}';`));
    const history = parseModerationHistory(
      await rpcData(admin.client, 'admin_moderation_history', {
        p_daily_run_id: fixture.dailyRunId,
      }),
    );
    expect(history.rows[0]).toMatchObject({
      id,
      actorId: null,
      action: 'invalidate_score',
      code: 'score_invalidated',
      outcome: 'applied',
    });
    expect(JSON.stringify(history)).not.toMatch(/person@example\.test|historical-secret/);
    expect(
      explorerSql(
        `SELECT request_id IS NULL AND payload_hash IS NULL FROM private.moderation_events WHERE id='${id}'`,
      ),
    ).toBe('t');
    expect(
      explorerSql(`SELECT reason FROM public.daily_score_invalidation_audit WHERE id='${id}'`),
    ).toContain('historical-secret');
  });

  it('serializes double clicks and competing moderators without duplicate audit or invalidation', async () => {
    const fixture = moderationFixture(player, player);
    const same = moderationDecision(fixture);
    const clicks = await Promise.all([decide(admin.client, same), decide(admin.client, same)]);
    expect(clicks.map((r) => r.outcome).sort()).toEqual(['applied', 'replayed']);
    expect(new Set(clicks.map((r) => r.auditId)).size).toBe(1);
    const competing = moderationFixture(player, player);
    const results = await Promise.all([
      decide(admin.client, moderationDecision(competing)),
      decide(otherAdmin.client, moderationDecision(competing)),
    ]);
    expect(results.filter((r) => r.outcome === 'applied')).toHaveLength(1);
    expect(results.filter((r) => r.code === 'report_not_open')).toHaveLength(1);
  });

  it('binds retry keys to actor and the complete immutable command payload', async () => {
    const fixture = moderationFixture(player, player);
    const args = moderationDecision(fixture, { p_action: 'dismiss_report' });
    const first = await decide(admin.client, args);
    const changed = await decide(admin.client, {
      ...args,
      p_reason: 'A different explanation for the same request key.',
    });
    expect(changed).toMatchObject({
      outcome: 'rejected',
      code: 'request_conflict',
      reportId: null,
      dailyRunId: null,
      action: null,
    });
    expect((await decide(admin.client, args)).auditId).toBe(first.auditId);
    expect((await decide(otherAdmin.client, args)).code).toBe('report_not_open');
  });

  it.each([
    [{ p_reason: 'short' }, 'invalid_reason'],
    [{ p_scope: 'all_runs' }, 'invalid_request'],
    [{ p_action: 'delete_player' }, 'invalid_request'],
    [{ p_confirmed_daily_run_id: randomUUID() }, 'target_mismatch'],
    [{ p_confirmed_daily_date: '2020-03-01' }, 'period_mismatch'],
    [{ p_confirmed_daily_date: null }, 'invalid_confirmation'],
    [{ p_report_id: randomUUID() }, 'report_not_found'],
  ] as const)('commits a safe rejection receipt and audit for %j', async (patch, code) => {
    const fixture = moderationFixture(player, player);
    const args = moderationDecision(fixture, patch);
    const receipt = await decide(admin.client, args);
    expect(receipt).toMatchObject({
      outcome: 'rejected',
      code,
      reportId: null,
      dailyRunId: null,
      action: null,
    });
    expect(
      explorerSql(`SELECT code FROM private.moderation_events WHERE id='${receipt.auditId}'`),
    ).toBe(code);
    expect(
      explorerSql(
        `SELECT invalidated_at IS NULL FROM public.daily_runs WHERE id='${fixture.dailyRunId}'`,
      ),
    ).toBe('t');
    expect(await decide(admin.client, args)).toEqual(receipt);
  });

  it('rejects incomplete/closed scores and permits dismissal of a legacy report on an already invalidated score', async () => {
    const incomplete = moderationFixture(player, player, { completed: false });
    expect((await decide(admin.client, moderationDecision(incomplete))).code).toBe(
      'score_not_completed',
    );
    const invalidated = moderationFixture(player, player, { invalidated: true });
    expect((await decide(admin.client, moderationDecision(invalidated))).code).toBe(
      'score_already_invalidated',
    );
    expect(
      (await decide(admin.client, moderationDecision(invalidated, { p_action: 'dismiss_report' })))
        .code,
    ).toBe('report_dismissed');
    const closed = moderationFixture(player, player, { status: 'dismissed' });
    expect((await decide(admin.client, moderationDecision(closed))).code).toBe('report_not_open');
  });

  it('rolls back target state, review and audit together on a database fault', () => {
    const fixture = moderationFixture(player, player);
    const request = randomUUID();
    expect(() =>
      explorerSql(`BEGIN;
      CREATE FUNCTION pg_temp.reject_moderation_event() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'test_audit_failure';END$$;
      CREATE TRIGGER test_moderation_failure BEFORE INSERT ON private.moderation_events FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_moderation_event();
      SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub','${admin.userId}',true);
      SELECT public.admin_moderation_decide('${request}','${fixture.reportId}','${fixture.dailyRunId}','2020-02-29','invalidate_score',${sqlText(moderationReason)},'daily_score');
      COMMIT;`),
    ).toThrow(/test_audit_failure/);
    expect(
      explorerSql(
        `SELECT invalidated_at IS NULL FROM public.daily_runs WHERE id='${fixture.dailyRunId}'`,
      ),
    ).toBe('t');
    expect(
      explorerSql(`SELECT status FROM public.daily_score_reports WHERE id='${fixture.reportId}'`),
    ).toBe('open');
    expect(
      explorerSql(`SELECT count(*) FROM private.moderation_events WHERE request_id='${request}'`),
    ).toBe('0');
  });

  it('enforces 10 commands/minute and 100/day, keeps retries free, and aggregates repeated limit rejections', async () => {
    const fixture = moderationFixture(player, player);
    seedModerationQuota(admin, 'decision_minute', 10);
    const first = await decide(admin.client, moderationDecision(fixture));
    const second = await decide(admin.client, moderationDecision(fixture));
    expect(first).toMatchObject({ outcome: 'rejected', code: 'rate_limited' });
    if (String(first.occurredAt).slice(0, 16) === String(second.occurredAt).slice(0, 16))
      expect(second.auditId).toBe(first.auditId);
    const perWindow = JSON.parse(
      explorerSql(`SELECT jsonb_agg(n) FROM (SELECT count(*) n
      FROM private.moderation_events WHERE actor_user_id='${admin.userId}' AND code='rate_limited'
      GROUP BY date_trunc('minute',occurred_at))t`),
    );
    expect(perWindow.every((n: number) => n === 1)).toBe(true);
    expect(
      explorerSql(`SELECT count(*) FROM private.moderation_events WHERE id='${first.auditId}'`),
    ).toBe('1');
    clearModerationCounters([admin]);
    seedModerationQuota(admin, 'decision_day', 100);
    expect((await decide(admin.client, moderationDecision(fixture))).code).toBe('rate_limited');
    expect(
      explorerSql(`SELECT status FROM public.daily_score_reports WHERE id='${fixture.reportId}'`),
    ).toBe('open');
  });

  it('can admit a previously throttled key later, then replays its only business effect', async () => {
    const fixture = moderationFixture(player, player);
    const args = moderationDecision(fixture, { p_action: 'dismiss_report' });
    seedModerationQuota(admin, 'decision_minute', 10);
    expect((await decide(admin.client, args)).code).toBe('rate_limited');
    // The unadmitted attempt has no per-request durable admission. Advancing
    // the disposable limiter window models the next eligible minute.
    clearModerationCounters([admin]);
    const admitted = await decide(admin.client, args);
    expect(admitted).toMatchObject({ outcome: 'applied', code: 'report_dismissed' });
    expect(await decide(admin.client, args)).toEqual({ ...admitted, outcome: 'replayed' });
    expect(
      explorerSql(
        `SELECT count(*) FROM private.moderation_events WHERE actor_user_id='${admin.userId}' AND request_id='${args.p_request_id}'`,
      ),
    ).toBe('1');
  });

  it('paginates immutable history at microsecond boundaries and anonymizes deleted actors', async () => {
    const temporary = await explorerAccount(service, users, { admin: true });
    const fixture = moderationFixture(player, player);
    const applied = await decide(
      temporary.client,
      moderationDecision(fixture, { p_action: 'dismiss_report' }),
    );
    explorerSql(`INSERT INTO private.moderation_events(actor_user_id,daily_run_id,action,outcome,code,occurred_at)
      SELECT '${admin.userId}','${fixture.dailyRunId}','dismiss_report','rejected','report_not_open',
      '2020-02-29T23:59:59.999999Z' FROM generate_series(1,30);`);
    const first = await rpcData(admin.client, 'admin_moderation_history', {
      p_daily_run_id: fixture.dailyRunId,
      p_limit: 25,
    });
    const second = await rpcData(admin.client, 'admin_moderation_history', {
      p_daily_run_id: fixture.dailyRunId,
      p_limit: 25,
      p_snapshot: first.snapshotAt,
      p_cursor: first.nextCursor,
    });
    expect(first.total).toBe(31);
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(6);
    expect(new Set([...first.rows, ...second.rows].map((r: { id: string }) => r.id)).size).toBe(31);
    expect((await service.auth.admin.deleteUser(temporary.userId)).error).toBeNull();
    users.splice(users.indexOf(temporary.userId), 1);
    const history = await rpcData(admin.client, 'admin_moderation_history', {
      p_daily_run_id: fixture.dailyRunId,
    });
    expect(history.rows.find((r: { id: string }) => r.id === applied.auditId).actorId).toBeNull();
  });

  it('sanitizes reasons in queue and decision history instead of exporting account or secret data', async () => {
    const fixture = moderationFixture(player, player);
    explorerSql(
      `UPDATE public.daily_score_reports SET reason='Contact player@example.test token=super-secret-value for review' WHERE id='${fixture.reportId}';`,
    );
    const queue = await rpcData(admin.client, 'admin_moderation_queue', {
      p_daily_run_id: fixture.dailyRunId,
    });
    expect(JSON.stringify(queue)).not.toMatch(
      /player@example\.test|super-secret-value|reporter_user_id|lease_token|result_hash/,
    );
    await decide(
      admin.client,
      moderationDecision(fixture, {
        p_action: 'dismiss_report',
        p_reason: 'Checked player@example.test Bearer abcdef-secret-value',
      }),
    );
    const history = await rpcData(admin.client, 'admin_moderation_history', {
      p_daily_run_id: fixture.dailyRunId,
    });
    expect(JSON.stringify(history)).not.toMatch(/player@example\.test|abcdef-secret-value/);
  });
});
