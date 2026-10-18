import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseAdminDiagnostics } from '@/pages/admin/diagnostics/adminDiagnosticsParser';
import type { DiagnosticsSection } from '@/pages/admin/diagnostics/adminDiagnosticsTypes';
import {
  cloneDiagnosticAttempt,
  diagnosticDay,
  diagnosticSqlText,
  seedDiagnosticLogs,
} from './helpers/adminDiagnosticsFixtures';
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
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials)
  throw new Error('Diagnostic tests require disposable loopback API and SQL credentials.');

describeDatabase('bounded administrative technical diagnostics', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let admin: ExplorerAccount;
  let player: ExplorerAccount;
  let forged: ExplorerAccount;
  let template: string;
  const period = { from: diagnosticDay, to: diagnosticDay };
  const historicalPeriod = { from: '2024-02-29', to: '2024-02-29' };
  async function query(
    section: string,
    filters: Record<string, unknown> = {},
    extra: Record<string, unknown> = {},
  ) {
    const response = await rpcData(admin.client, 'admin_diagnostics', {
      p_section: section,
      p_filters: filters,
      ...extra,
    });
    parseAdminDiagnostics(response, {
      section: section as DiagnosticsSection,
      filters: response.filters,
      limit: typeof extra.p_limit === 'number' ? extra.p_limit : 25,
      cursor: extra.p_cursor as never,
      snapshotAt: extra.p_snapshot as never,
    });
    return response;
  }
  beforeAll(async () => {
    service = explorerClient('service');
    admin = await explorerAccount(service, users, { admin: true });
    player = await explorerAccount(service, users);
    forged = await explorerAccount(service, users, { forgedAdmin: true });
    const result = await rpcData(player.client, 'start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    template = result.attempt_id;
    explorerSql(
      `UPDATE public.run_attempts SET status='expired',expired_at=NOW() WHERE id='${template}'`,
    );
  });
  afterEach(() => {
    explorerSql(`DELETE FROM public.logs WHERE user_id=ANY(ARRAY[${users.map(diagnosticSqlText).join(',')}]::uuid[]);
      DELETE FROM public.run_attempts WHERE user_id='${player.userId}' AND id<>'${template}';`);
  });
  afterAll(async () => {
    await cleanupExplorer(service, users);
  });

  it('authorizes the live registered database admin before target and filter evaluation', async () => {
    for (const client of [explorerClient(), player.client, forged.client, service]) {
      const result = await client.rpc('admin_diagnostics', {
        p_section: 'correlation',
        p_filters: { attemptId: 'broken' },
      });
      expect(result.error?.code).toBe('42501');
    }
    const allowed = await query('logs', period);
    expect(allowed).toMatchObject({
      schemaVersion: 1,
      section: 'logs',
      data: { rows: [], total: 0, retentionDays: 14 },
    });
  });
  it('denies the unchanged access token after admin revocation and anonymous identity changes', async () => {
    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE id='${admin.playerId}'`);
    try {
      expect((await admin.client.rpc('admin_diagnostics', { p_section: 'logs' })).error?.code).toBe(
        '42501',
      );
    } finally {
      explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE id='${admin.playerId}'`);
    }
    explorerSql(`UPDATE auth.users SET is_anonymous=TRUE WHERE id='${admin.userId}'`);
    try {
      expect((await admin.client.rpc('admin_diagnostics', { p_section: 'logs' })).error?.code).toBe(
        '42501',
      );
    } finally {
      explorerSql(`UPDATE auth.users SET is_anonymous=FALSE WHERE id='${admin.userId}'`);
    }
  });
  it('removes raw log access and deletion from every browser identity including admin', async () => {
    seedDiagnosticLogs(player);
    for (const client of [explorerClient(), player.client, admin.client]) {
      expect((await client.from('logs').select('*').limit(1)).error?.code).toBe('42501');
      expect((await client.from('logs').delete().eq('user_id', player.userId)).error?.code).toBe(
        '42501',
      );
      expect((await client.rpc('purge_expired_logs')).error?.code).toBe('42501');
    }
    expect((await service.from('logs').select('id').eq('user_id', player.userId)).error).toBeNull();
  });
  it('paginates all 103 logs at exact equal-microsecond boundaries with stable UUID ordering', async () => {
    const fixture = seedDiagnosticLogs(player, { count: 103 });
    const first = await query('logs', period, { p_limit: 50 });
    const second = await query('logs', period, {
      p_limit: 50,
      p_cursor: first.data.nextCursor,
      p_snapshot: first.snapshotAt,
    });
    const third = await query('logs', period, {
      p_limit: 50,
      p_cursor: second.data.nextCursor,
      p_snapshot: first.snapshotAt,
    });
    expect(first.data.total).toBe(103);
    expect(first.data.rows).toHaveLength(50);
    expect(second.data.rows).toHaveLength(50);
    expect(third.data.rows).toHaveLength(3);
    expect(third.data.nextCursor).toBeNull();
    expect(
      [...first.data.rows, ...second.data.rows, ...third.data.rows].map(
        (r: { id: string }) => r.id,
      ),
    ).toEqual([...fixture.ids].reverse());
    expect(first.data.nextCursor.at).toBe(`${diagnosticDay}T23:59:59.999999Z`);
  });
  it('filters operation, severity, period and exact session or attempt across the full server set', async () => {
    seedDiagnosticLogs(player, { count: 102 });
    const attemptId = cloneDiagnosticAttempt(player, template);
    const target = seedDiagnosticLogs(player, {
      date: `${diagnosticDay}T00:00:00.000000Z`,
      attemptId,
    });
    const result = await query('logs', {
      ...period,
      operation: 'insert',
      level: 'error',
      correlationId: target.sessionId,
      attemptId,
    });
    expect(result.data.total).toBe(1);
    expect(result.data.rows[0].id).toBe(target.ids[0]);
    expect((await query('logs', { ...period, operation: 'select' })).data.total).toBe(0);
    expect((await query('logs', { from: '2024-03-01', to: '2024-03-01' })).data.total).toBe(0);
  });
  it.each(['requestPasswordReset', 'updatePassword'])(
    'accepts the exact safe authentication method %s from the real SQL projection',
    async (method) => {
      const fixture = seedDiagnosticLogs(player, { method });
      const result = await query('logs', { ...period, correlationId: fixture.sessionId });
      expect(result.data.rows).toHaveLength(1);
      expect(result.data.rows[0].method).toBe(method);
    },
  );
  it('sanitizes legacy metadata at read-time and never projects sensitive details, identities or stack traces', async () => {
    const fixture = seedDiagnosticLogs(player, {
      unsafe: true,
      attemptId: template,
    });
    const result = await query('logs', period);
    expect(result.data.rows[0]).toMatchObject({
      repository: 'unknown',
      method: 'unknown',
      tableName: 'run_attempts',
      message: '[REDACTED]',
      attemptId: template,
      correlationId: fixture.sessionId,
    });
    expect(Object.keys(result.data.rows[0]).sort()).toEqual(
      [
        'attemptId',
        'correlationId',
        'createdAt',
        'durationMs',
        'id',
        'level',
        'message',
        'method',
        'operation',
        'repository',
        'tableName',
      ].sort(),
    );
    for (const secret of [
      'secret-',
      '192.0.2.99',
      'person@example.test',
      player.userId,
      player.playerId,
      'sensitive-command',
    ])
      expect(JSON.stringify(result)).not.toContain(secret);
    expect(
      explorerSql(`SELECT details->>'token' FROM public.logs WHERE id='${fixture.ids[0]}'`),
    ).toBe('secret-token-marker');
  });
  it('does not fabricate attempt links from malformed legacy details', async () => {
    seedDiagnosticLogs(player, { attemptId: 'secret-attempt-marker' });
    const result = await query('logs', period);
    expect(result.data.rows[0].attemptId).toBeNull();
    expect(JSON.stringify(result)).not.toContain('secret-attempt-marker');
  });
  it.each([
    { p_limit: 0 },
    { p_limit: 51 },
    { p_section: 'unknown' },
    { p_filters: { secret: true } },
    { p_filters: { from: '2024-02-30' } },
    { p_filters: { from: '2024-01-01', to: '2024-02-01' } },
    { p_filters: { level: 'fatal' } },
    { p_filters: { operation: 'rpc' } },
    { p_filters: { attemptId: 'no' } },
    { p_filters: { from: ['2024-01-01'] } },
    { p_cursor: { at: '2024-02-29T12:00:00.000000Z', id: randomUUID() } },
    {
      p_cursor: { at: '2024-02-29T12:00:00Z', id: randomUUID() },
      p_snapshot: '2024-03-01T00:00:00Z',
    },
    { p_snapshot: 'infinity' },
    { p_snapshot: '9999-01-01T00:00:00Z' },
  ])('rejects malformed or unbounded diagnostic queries: %j', async (extra) => {
    const result = await admin.client.rpc('admin_diagnostics', {
      p_section: 'logs',
      p_filters: period,
      ...extra,
    });
    expect(result.error?.code).toBe('22023');
  });
  it('reports complete authority counts across pages and exact unknown-engine/rejection filters', async () => {
    const ids = Array.from({ length: 53 }, () =>
      cloneDiagnosticAttempt(player, template, { engine: 'run-engine-future' }),
    )
      .sort()
      .reverse();
    const rejected = cloneDiagnosticAttempt(player, template, {
      status: 'rejected',
      engine: 'run-engine-future',
      code: 'unsupported_engine',
    });
    const first = await query(
      'authority',
      { ...historicalPeriod, engineVersion: 'run-engine-future' },
      { p_limit: 50 },
    );
    const next = await query(
      'authority',
      { ...historicalPeriod, engineVersion: 'run-engine-future' },
      {
        p_limit: 50,
        p_cursor: first.data.nextCursor,
        p_snapshot: first.snapshotAt,
      },
    );
    expect(first.data).toMatchObject({
      total: 54,
      counts: {
        started: 0,
        finished: 0,
        verified: 0,
        rejected: 1,
        expired: 53,
      },
    });
    expect(
      new Set([...first.data.rows, ...next.data.rows].map((r: { id: string }) => r.id)),
    ).toEqual(new Set([...ids, rejected]));
    const targeted = await query('authority', {
      ...historicalPeriod,
      status: 'rejected',
      rejectionCode: 'unsupported_engine',
    });
    expect(targeted.data.rows[0].id).toBe(rejected);
    expect(targeted.data.total).toBe(1);
    const empty = await query('authority', {
      from: '1900-01-01',
      to: '1900-01-01',
    });
    expect(empty.data).toMatchObject({
      total: 0,
      rows: [],
      nextCursor: null,
      counts: { started: 0, finished: 0, verified: 0, rejected: 0, expired: 0 },
    });
  });
  it('uses the existing authority aggregate view for fifteen complete minute buckets independent of browsed dates', async () => {
    const stamp = new Date();
    stamp.setUTCSeconds(0, 0);
    const inside = new Date(stamp.getTime() - 60_000).toISOString();
    cloneDiagnosticAttempt(player, template, {
      status: 'rejected',
      startedAt: inside,
      finishedAt: inside,
      terminalAt: inside,
      engine: 'run-engine-alert-fixture',
      code: 'unsupported_engine',
    });
    const excluded = new Date(stamp.getTime() - 16 * 60_000).toISOString();
    cloneDiagnosticAttempt(player, template, {
      status: 'rejected',
      startedAt: excluded,
      finishedAt: excluded,
      terminalAt: excluded,
      engine: 'run-engine-alert-fixture',
    });
    const result = await query('authority', {
      from: '1900-01-01',
      to: '1900-01-01',
      engineVersion: 'run-engine-alert-fixture',
      status: 'verified',
    });
    expect(result.data.total).toBe(0);
    expect(result.data.alerts).toMatchObject({
      complete: true,
      totalGroups: 1,
    });
    expect(result.data.alerts.aggregates[0]).toMatchObject({
      attemptCount: 1,
      rejectedCount: 1,
      rejectionCode: 'unsupported_engine',
    });
    expect(Date.parse(result.data.alerts.to) - Date.parse(result.data.alerts.from)).toBe(
      15 * 60_000,
    );
  });
  it('shows missing telemetry and all empty time buckets without inventing transport availability', async () => {
    const result = await query('service', {
      from: '1900-01-01',
      to: '1900-01-02',
      granularity: 'hour',
      engineVersion: 'run-engine-no-signal-fixture',
    });
    expect(result.data).toMatchObject({
      coverage: 'server_attempts_only',
      requestAvailability: null,
      requestLatencyP95Ms: null,
      pendingBacklog: 0,
      summary: {
        started: 0,
        verified: 0,
        rejected: 0,
        expired: 0,
        pending: 0,
        eligibleSeals: 0,
        withinSlo: 0,
        terminalSamples: 0,
        sealToTerminalP95Ms: null,
        sealToTerminalSli: null,
      },
    });
    expect(result.data.buckets).toHaveLength(48);
    expect(result.data.buckets.every((b: { hasSignal: boolean }) => !b.hasSignal)).toBe(true);
  });
  it('measures seal-to-terminal latency independently of game duration and leaves immature seals outside the denominator', async () => {
    cloneDiagnosticAttempt(player, template, {
      status: 'rejected',
      startedAt: '2024-02-29T00:00:00Z',
      finishedAt: '2024-02-29T23:00:00Z',
      terminalAt: '2024-02-29T23:00:02Z',
      engine: 'run-engine-slo-fixture',
    });
    cloneDiagnosticAttempt(player, template, {
      status: 'rejected',
      startedAt: '2024-02-29T00:00:01Z',
      finishedAt: '2024-02-29T23:01:00Z',
      terminalAt: '2024-02-29T23:11:00Z',
      engine: 'run-engine-slo-fixture',
    });
    const result = await query('service', {
      ...historicalPeriod,
      engineVersion: 'run-engine-slo-fixture',
    });
    expect(result.data.summary).toMatchObject({
      started: 2,
      rejected: 2,
      pending: 0,
      eligibleSeals: 2,
      withinSlo: 1,
      terminalSamples: 2,
      sealToTerminalSli: 0.5,
    });
    expect(result.data.summary.sealToTerminalP95Ms).toBeCloseTo(570100, 1);
    expect(result.data.buckets[0].hasSignal).toBe(true);
    const immature = await query(
      'service',
      { ...historicalPeriod, engineVersion: 'run-engine-slo-fixture' },
      { p_snapshot: '2024-02-29T23:00:30Z' },
    );
    expect(immature.data.summary.eligibleSeals).toBe(0);
    expect(immature.data.summary.sealToTerminalSli).toBeNull();
  });

  it('keeps seals whose start is outside the period and matches the independent per-bucket reference', async () => {
    cloneDiagnosticAttempt(player, template, {
      status: 'rejected',
      startedAt: '2024-02-28T12:00:00Z',
      finishedAt: '2024-02-29T00:00:00Z',
      terminalAt: '2024-02-29T00:00:01Z',
      engine: 'run-engine-cross-period',
    });
    const filters = {
      ...historicalPeriod,
      engineVersion: 'run-engine-cross-period',
      granularity: 'hour',
    };
    const response = await query('service', filters);
    expect(response.data.summary).toMatchObject({
      started: 0,
      rejected: 0,
      eligibleSeals: 1,
      withinSlo: 1,
      terminalSamples: 1,
      sealToTerminalP95Ms: 1000,
      sealToTerminalSli: 1,
    });
    expect(response.data.buckets[0]).toMatchObject({
      hasSignal: true,
      started: 0,
      eligibleSeals: 1,
    });
    const actual = diagnosticSqlText(JSON.stringify(response.data.buckets));
    const scoped = diagnosticSqlText(JSON.stringify(response.filters));
    const reference =
      explorerSql(`SELECT ${actual}::jsonb = jsonb_agg(private.diagnostic_service_metrics(${scoped}::jsonb,${diagnosticSqlText(response.snapshotAt)}::timestamptz,at,at+interval '1 hour')
      ||jsonb_build_object('at',private.diagnostic_stamp(at),'hasSignal',at='2024-02-29T00:00:00Z'::timestamptz) ORDER BY at)
      FROM generate_series('2024-02-29T00:00:00Z'::timestamptz,'2024-02-29T23:00:00Z'::timestamptz,interval '1 hour')at;`);
    expect(reference).toBe('t');
  });
  it('keeps overdue sealed backlog visible when it predates the selected service period', async () => {
    const target = cloneDiagnosticAttempt(player, template, { engine: 'run-engine-old-backlog' });
    explorerSql(
      `UPDATE public.run_attempts SET status='finished',expired_at=NULL,finished_at='2024-03-01T00:00:00Z',finish_command_id=gen_random_uuid(),sealed_sequence=0,sealed_journal_hash=repeat('a',64) WHERE id='${target}'`,
    );
    const response = await query('service', {
      from: '1900-01-01',
      to: '1900-01-01',
      engineVersion: 'run-engine-old-backlog',
    });
    expect(response.data.summary.started).toBe(0);
    expect(response.data.pendingBacklog).toBe(1);
  });

  it('links only explicit exact attempt IDs and does not claim a complete event trace', async () => {
    const target = cloneDiagnosticAttempt(player, template);
    const log = seedDiagnosticLogs(player, { attemptId: target });
    seedDiagnosticLogs(player, { attemptId: randomUUID() });
    const result = await query('correlation', { ...period, attemptId: target });
    expect(result.data).toMatchObject({
      linksComplete: false,
      attempt: { id: target, status: 'expired' },
      logs: { total: 1 },
    });
    expect(result.data.logs.rows[0].id).toBe(log.ids[0]);
    const missing = await query('correlation', {
      ...period,
      attemptId: randomUUID(),
    });
    expect(missing.data).toMatchObject({
      attempt: null,
      linksComplete: false,
      logs: { rows: [], total: 0 },
    });
  });

  it('refuses cross-account claimed attempt links while retaining the unlinked sanitized log', async () => {
    seedDiagnosticLogs(forged, { attemptId: template });
    expect((await query('logs', period)).data.rows[0].attemptId).toBeNull();
    expect((await query('logs', { ...period, attemptId: template })).data.total).toBe(0);
    expect((await query('correlation', { ...period, attemptId: template })).data.logs.total).toBe(
      0,
    );
  });
  it('withholds expired logs even before cron and with a historical snapshot', async () => {
    const expiredAt = new Date(Date.now() - 15 * 86400_000).toISOString();
    const day = expiredAt.slice(0, 10);
    seedDiagnosticLogs(player, { date: expiredAt });
    expect((await query('logs', { from: day, to: day })).data.total).toBe(0);
    const snapshot = new Date(Date.now() - 14 * 86400_000).toISOString();
    expect((await query('logs', { from: day, to: day }, { p_snapshot: snapshot })).data.total).toBe(
      0,
    );
  });
  it('coalesces legacy unsafe authority dimensions after normalization without duplicating alert buckets', async () => {
    const now = new Date();
    now.setUTCSeconds(0, 0);
    const at = new Date(now.getTime() - 60_000).toISOString();
    for (const engine of ['unsafe engineA', 'unsafe engineB'])
      cloneDiagnosticAttempt(player, template, {
        status: 'rejected',
        startedAt: at,
        finishedAt: at,
        terminalAt: at,
        engine,
        code: 'unsafe:code',
      });
    const result = await query('authority', { from: '1900-01-01', to: '1900-01-01' });
    const aggregate = result.data.alerts.aggregates.find(
      (item: { engineVersion: string; rejectionCode: string }) =>
        item.engineVersion === 'unknown' && item.rejectionCode === 'unknown',
    );
    expect(aggregate).toMatchObject({ attemptCount: 2, rejectedCount: 2 });
  });

  it('preserves the existing 14-day daily purge and keeps opt-in ingestion separate', async () => {
    const old = seedDiagnosticLogs(player, {
      date: new Date(Date.now() - 15 * 86400_000).toISOString(),
    });
    const recent = seedDiagnosticLogs(player, {
      date: new Date(Date.now() - 13 * 86400_000).toISOString(),
    });
    explorerSql(`BEGIN; SELECT public.purge_expired_logs(); DO $x$ BEGIN
      IF EXISTS(SELECT 1 FROM public.logs WHERE id='${old.ids[0]}') OR NOT EXISTS(SELECT 1 FROM public.logs WHERE id='${recent.ids[0]}') THEN RAISE EXCEPTION 'retention_failed'; END IF;
      IF (SELECT count(*) FROM cron.job WHERE jobname='lolrogue-purge-expired-client-logs' AND schedule='17 3 * * *')<>1 THEN RAISE EXCEPTION 'cron_changed'; END IF;
      END $x$; ROLLBACK;`);
    expect((await query('logs', { from: '1900-01-01', to: '1900-01-01' })).data.total).toBe(0);
  });
});
