import { randomUUID } from 'node:crypto';
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
  throw new Error('Moderation privilege tests require disposable loopback Supabase credentials.');

describeDatabase('moderation authorization, anti-abuse and effective retention', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let admin: ExplorerAccount;
  let player: ExplorerAccount;
  let forged: ExplorerAccount;
  beforeAll(async () => {
    service = explorerClient('service');
    admin = await explorerAccount(service, users, { admin: true });
    player = await explorerAccount(service, users);
    forged = await explorerAccount(service, users, { forgedAdmin: true });
  });
  beforeEach(() => {
    clearModerationCounters([admin, player, forged]);
    clearModerationEvents(users);
  });
  afterAll(async () => {
    clearModerationEvents(users);
    await cleanupExplorer(service, users);
  });

  it.each(['anon', 'ordinary', 'forged', 'service'] as const)(
    'denies %s reads before validating filters or looking up targets',
    async (role) => {
      const client =
        role === 'anon'
          ? explorerClient()
          : role === 'ordinary'
            ? player.client
            : role === 'forged'
              ? forged.client
              : service;
      expect((await client.rpc('admin_moderation_queue', { p_limit: -1 })).error?.code).toBe(
        '42501',
      );
      expect(
        (
          await client.rpc('admin_moderation_history', {
            p_daily_run_id: randomUUID(),
            p_limit: -1,
          })
        ).error?.code,
      ).toBe('42501');
    },
  );

  it.each(['ordinary', 'forged'] as const)(
    'returns a committed, bounded access rejection to an authenticated %s caller without a target lookup',
    async (role) => {
      const account = role === 'ordinary' ? player : forged;
      const args = moderationDecision({
        dailyRunId: randomUUID(),
        reportId: randomUUID(),
        dailyDate: '2020-02-29',
      });
      const first = await decide(account.client, args);
      expect(first).toMatchObject({
        outcome: 'rejected',
        code: 'admin_access_denied',
        reportId: null,
        dailyRunId: null,
        action: null,
      });
      const receipts = [first];
      for (let i = 0; i < 3; i++)
        receipts.push(await decide(account.client, { ...args, p_request_id: randomUUID() }));
      const byWindow = new Map<string, unknown>();
      for (const receipt of receipts) {
        const minute = String(receipt.occurredAt).slice(0, 16);
        if (byWindow.has(minute)) expect(receipt.auditId).toBe(byWindow.get(minute));
        byWindow.set(minute, receipt.auditId);
      }
      expect(
        explorerSql(
          `SELECT sum(attempts) FROM private.moderation_rate_windows WHERE actor_user_id='${account.userId}' AND kind='denied_minute'`,
        ),
      ).toBe('4');
      expect(
        JSON.parse(
          explorerSql(
            `SELECT jsonb_build_object('target',daily_run_id,'report',report_id,'reason',reason) FROM private.moderation_events WHERE id='${first.auditId}'`,
          ),
        ),
      ).toEqual({ target: null, report: null, reason: null });
    },
  );

  it('immediately purges authorization for a revoked admin with the same JWT and refuses anonymous Auth identities', async () => {
    const fixture = moderationFixture(player, player);
    const token = (await admin.client.auth.getSession()).data.session!.access_token;
    await rpcData(admin.client, 'admin_moderation_queue', { p_daily_run_id: fixture.dailyRunId });
    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE id='${admin.playerId}'`);
    try {
      expect((await admin.client.rpc('admin_moderation_queue')).error?.code).toBe('42501');
      expect((await decide(admin.client, moderationDecision(fixture))).code).toBe(
        'admin_access_denied',
      );
      expect((await admin.client.auth.getSession()).data.session!.access_token).toBe(token);
    } finally {
      explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE id='${admin.playerId}'`);
    }
    explorerSql(`UPDATE auth.users SET is_anonymous=TRUE WHERE id='${admin.userId}'`);
    try {
      expect((await admin.client.rpc('admin_moderation_queue')).error?.code).toBe('42501');
      expect((await decide(admin.client, moderationDecision(fixture))).code).toBe(
        'admin_access_denied',
      );
    } finally {
      explorerSql(`UPDATE auth.users SET is_anonymous=FALSE WHERE id='${admin.userId}'`);
    }
  });

  it('refuses direct promotion, old invalidation bypass, direct report inserts and event tampering for every browser role', async () => {
    const fixture = moderationFixture(player, player);
    for (const account of [player, admin]) {
      expect(
        (await account.client.from('players').update({ is_admin: true }).eq('id', account.playerId))
          .error,
      ).not.toBeNull();
      expect(
        (
          await account.client.rpc('invalidate_daily_score', {
            p_daily_run_id: fixture.dailyRunId,
            p_reason: moderationReason,
          })
        ).error?.code,
      ).toBe('42501');
      expect(
        (
          await account.client.from('daily_score_reports').insert({
            daily_run_id: fixture.dailyRunId,
            reporter_user_id: account.userId,
            reason: moderationReason,
          })
        ).error?.code,
      ).toBe('42501');
    }
    const grants = JSON.parse(
      explorerSql(`SELECT jsonb_agg(jsonb_build_object('role',r,'eventRead',has_table_privilege(r,'private.moderation_events','SELECT'),
      'eventInsert',has_table_privilege(r,'private.moderation_events','INSERT'),'eventUpdate',has_table_privilege(r,'private.moderation_events','UPDATE'),
      'eventDelete',has_table_privilege(r,'private.moderation_events','DELETE'),'counters',has_table_privilege(r,'private.moderation_rate_windows','SELECT')))
      FROM unnest(ARRAY['anon','authenticated','service_role'])r`),
    );
    for (const grant of grants)
      expect(grant).toMatchObject({
        eventRead: false,
        eventInsert: false,
        eventUpdate: false,
        eventDelete: false,
        counters: false,
      });
    expect(() =>
      explorerSql(
        `BEGIN;SET LOCAL ROLE authenticated;UPDATE private.moderation_events SET reason='Tampered event reason';ROLLBACK;`,
      ),
    ).toThrow(/permission denied/);
  });

  it('grants only public invokers and the two independently guarded private definers', () => {
    const grants = JSON.parse(
      explorerSql(`SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definer',p.prosecdef,
      'emptyPath',p.proconfig@>ARRAY['search_path=""'],'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
      'auth',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE')))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public')
      AND (p.proname LIKE 'moderation_%' OR p.proname LIKE 'admin_moderation%' OR p.proname='report_daily_score')`),
    );
    for (const row of grants) {
      expect(row).toMatchObject({ emptyPath: true, anon: false, service: false });
      expect(row.auth).toBe(
        row.schema === 'public' || ['admin_moderation', 'report_daily_score'].includes(row.name),
      );
      expect(row.definer).toBe(
        row.schema === 'private' && ['admin_moderation', 'report_daily_score'].includes(row.name),
      );
    }
    expect(() =>
      explorerSql(
        `BEGIN;SET LOCAL ROLE authenticated;SELECT private.moderation_queue_data('{}');ROLLBACK;`,
      ),
    ).toThrow(/permission denied/);
  });

  it('keeps all four moderation tables behind explicit restrictive API-denial policies', () => {
    const tables = JSON.parse(
      explorerSql(`SELECT jsonb_agg(jsonb_build_object('schema',p.schemaname,'table',p.tablename,
      'permissive',p.permissive,'command',p.cmd,'roles',p.roles,'using',p.qual,'check',p.with_check,
      'rls',c.relrowsecurity,'anonymousGrant',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
      'authenticatedGrant',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
      FROM pg_policies p JOIN pg_namespace n ON n.nspname=p.schemaname
      JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=p.tablename
      WHERE (p.schemaname,p.tablename) IN(('private','moderation_events'),('private','moderation_rate_windows'),
      ('public','daily_score_reports'),('public','daily_score_invalidation_audit'))`),
    );
    expect(tables).toHaveLength(4);
    expect(new Set(tables.map((table: { table: string }) => table.table)).size).toBe(4);
    for (const table of tables) {
      expect(table).toMatchObject({
        permissive: 'RESTRICTIVE',
        command: 'ALL',
        using: 'false',
        check: 'false',
        rls: true,
        anonymousGrant: false,
        authenticatedGrant: false,
      });
      expect([...table.roles].sort()).toEqual(['anon', 'authenticated', 'service_role']);
    }
  });

  it('keeps reporting duplicates stable after dismissal and denies anonymous Auth report creation', async () => {
    const fixture = moderationFixture(player, player);
    const original = explorerSql(
      `SELECT to_jsonb(r)::text FROM public.daily_score_reports r WHERE id='${fixture.reportId}'`,
    );
    expect(
      (
        await player.client.rpc('report_daily_score', {
          p_daily_run_id: fixture.dailyRunId,
          p_reason: 'A changed duplicate explanation that must be ignored.',
        })
      ).error,
    ).toBeNull();
    expect(
      explorerSql(
        `SELECT to_jsonb(r)::text FROM public.daily_score_reports r WHERE id='${fixture.reportId}'`,
      ),
    ).toBe(original);
    await decide(admin.client, moderationDecision(fixture, { p_action: 'dismiss_report' }));
    const dismissed = explorerSql(
      `SELECT to_jsonb(r)::text FROM public.daily_score_reports r WHERE id='${fixture.reportId}'`,
    );
    expect(
      (
        await player.client.rpc('report_daily_score', {
          p_daily_run_id: fixture.dailyRunId,
          p_reason: moderationReason,
        })
      ).error,
    ).toBeNull();
    expect(
      explorerSql(
        `SELECT to_jsonb(r)::text FROM public.daily_score_reports r WHERE id='${fixture.reportId}'`,
      ),
    ).toBe(dismissed);
    explorerSql(`UPDATE auth.users SET is_anonymous=TRUE WHERE id='${player.userId}'`);
    try {
      expect(
        (
          await player.client.rpc('report_daily_score', {
            p_daily_run_id: fixture.dailyRunId,
            p_reason: moderationReason,
          })
        ).error,
      ).not.toBeNull();
    } finally {
      explorerSql(`UPDATE auth.users SET is_anonymous=FALSE WHERE id='${player.userId}'`);
    }
  });

  it('returns HTTP 429 for reporting abuse while committing one bounded abuse event and no report', async () => {
    const fixture = moderationFixture(admin, admin);
    seedModerationQuota(player, 'report_minute', 5);
    const rejected = await player.client.rpc('report_daily_score', {
      p_daily_run_id: fixture.dailyRunId,
      p_reason: moderationReason,
    });
    expect(rejected.error).not.toBeNull();
    expect(
      explorerSql(
        `SELECT count(*) FROM public.daily_score_reports WHERE daily_run_id='${fixture.dailyRunId}' AND reporter_user_id='${player.userId}'`,
      ),
    ).toBe('0');
    expect(
      explorerSql(
        `SELECT count(*) FROM private.moderation_events WHERE actor_user_id='${player.userId}' AND action='report' AND code='rate_limited'`,
      ),
    ).toBe('1');
    const again = await player.client.rpc('report_daily_score', {
      p_daily_run_id: fixture.dailyRunId,
      p_reason: moderationReason,
    });
    expect(again.error).not.toBeNull();
    expect(
      explorerSql(
        `SELECT sum(attempts)-10 FROM private.moderation_rate_windows WHERE actor_user_id='${player.userId}' AND kind='report_minute'`,
      ),
    ).toBe('2');
  });

  it('commits invalid report attempts and applies exhausted quotas without retaining raw reasons or target IDs', async () => {
    const missing = randomUUID();
    for (let n = 0; n < 6; n++) {
      if (n === 2) seedModerationQuota(player, 'report_day', 20);
      const result = await player.client.rpc('report_daily_score', {
        p_daily_run_id: missing,
        p_reason: n % 2 ? moderationReason : 'short',
      });
      expect(result.error).not.toBeNull();
    }
    expect(
      explorerSql(
        `SELECT sum(attempts) FROM private.moderation_rate_windows WHERE actor_user_id='${player.userId}' AND kind='report_minute'`,
      ),
    ).toBe('6');
    const events = JSON.parse(
      explorerSql(`SELECT jsonb_agg(jsonb_build_object('code',code,'reason',reason,'target',daily_run_id))
      FROM private.moderation_events WHERE actor_user_id='${player.userId}' AND action='report'`),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { code: 'invalid_request', reason: null, target: null },
        { code: 'rate_limited', reason: null, target: null },
      ]),
    );
    const perWindow = JSON.parse(
      explorerSql(`SELECT jsonb_agg(n) FROM (SELECT count(*) n
      FROM private.moderation_events WHERE actor_user_id='${player.userId}' AND action='report'
      GROUP BY code,date_trunc('minute',occurred_at))t`),
    );
    expect(perWindow.every((n: number) => n === 1)).toBe(true);
  });

  it('physically purges expired decisions/rejections/reviewed reports, keeps old open reports, and runs one daily retention job', async () => {
    const old = moderationFixture(player, player, { status: 'dismissed' });
    const open = moderationFixture(player, player, { createdAt: '1900-01-01T00:00:00Z' });
    const recent = moderationFixture(player, player, { status: 'dismissed' });
    const expiredEvent = randomUUID();
    const expiredRejection = randomUUID();
    const freshEvent = randomUUID();
    const expiredCounter = "'1900-01-01T00:00:00Z'";
    explorerSql(`UPDATE public.daily_score_reports SET reviewed_at=NOW()-INTERVAL '366 days' WHERE id='${old.reportId}';
      INSERT INTO private.moderation_events(id,actor_user_id,daily_run_id,action,outcome,code,reason,occurred_at)
      VALUES('${expiredEvent}','${admin.userId}','${old.dailyRunId}','dismiss_report','applied','report_dismissed',${sqlText(moderationReason)},NOW()-INTERVAL '366 days'),
      ('${expiredRejection}','${admin.userId}','${old.dailyRunId}','dismiss_report','rejected','report_not_open',NULL,NOW()-INTERVAL '31 days'),
      ('${freshEvent}','${admin.userId}','${recent.dailyRunId}','dismiss_report','applied','report_dismissed',${sqlText(moderationReason)},NOW());
      INSERT INTO private.moderation_rate_windows(actor_user_id,kind,window_start,attempts) VALUES('${admin.userId}','decision_day',${expiredCounter},1);`);
    const purge = await service.rpc('purge_expired_social_data');
    expect(purge.error).toBeNull();
    expect(purge.data).toBeGreaterThanOrEqual(4);
    expect(
      explorerSql(
        `SELECT count(*) FROM private.moderation_events WHERE id IN('${expiredEvent}','${expiredRejection}')`,
      ),
    ).toBe('0');
    expect(
      explorerSql(`SELECT count(*) FROM private.moderation_events WHERE id='${freshEvent}'`),
    ).toBe('1');
    expect(
      explorerSql(`SELECT count(*) FROM public.daily_score_reports WHERE id='${old.reportId}'`),
    ).toBe('0');
    expect(
      explorerSql(
        `SELECT count(*) FROM public.daily_score_reports WHERE id IN('${open.reportId}','${recent.reportId}')`,
      ),
    ).toBe('2');
    const jobs = JSON.parse(
      explorerSql(
        `SELECT jsonb_agg(jsonb_build_object('schedule',schedule,'active',active)) FROM cron.job WHERE jobname='lolrogue-purge-expired-social-data'`,
      ),
    );
    expect(jobs).toEqual([{ schedule: '43 4 * * *', active: true }]);
  });
});
