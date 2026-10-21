import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseAdminBalanceConfig } from '../src/features/administration/domain/balance/adminBalanceConfigParser';
import {
  parseAdminBalanceBuilds,
  parseAdminBalanceChampions,
} from '../src/features/administration/domain/balance/adminBalanceReportParser';
import { analyticsAttempt } from './helpers/adminAnalyticsFixtures';
import {
  balanceFilters,
  balanceFinish,
  balanceRpc,
  balanceScenario,
} from './helpers/adminBalanceFixtures';
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
  throw new Error(
    'Admin balance tests require disposable loopback Supabase API and SQL credentials.',
  );

describeDatabase('read-only verified balance populations', () => {
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

  function fixture(
    account = a,
    overrides: Record<string, unknown> = {},
    options: Parameters<typeof balanceFinish>[2] = {},
  ) {
    const attempt = analyticsAttempt(templateId, account, '2024-02-01T12:00:00Z', {
      mastery_snapshot: {},
      enhancement_snapshot: {},
      ...overrides,
    });
    const finish = balanceFinish(attempt.id, account, options);
    return {
      attemptId: attempt.id,
      runId: finish.id,
      sql: attempt.sql + finish.sql,
    };
  }

  it('returns genuine empty N0 rather than fabricated champion or build measurements', async () => {
    for (const resource of ['champions', 'builds'] as const) {
      const value = await rpcData(admin.client, `admin_balance_${resource}`, {
        p_filters: balanceFilters,
      });
      expect(value).toMatchObject({
        filters: balanceFilters,
        minimumSampleSize: 30,
        population: { verifiedRuns: 0, uniquePlayers: 0 },
        segments: [],
        contexts: [],
        rows: [],
      });
      expect(() =>
        resource === 'champions'
          ? parseAdminBalanceChampions(value, balanceFilters)
          : parseAdminBalanceBuilds(value, balanceFilters),
      ).not.toThrow();
    }
  });

  it('uses verified final appearances with a denominator including an absent catalog champion', () => {
    const value = balanceScenario(admin, [a], fixture().sql, balanceRpc('champions'));
    expect(value.population).toEqual({ verifiedRuns: 1, uniquePlayers: 1 });
    expect(() => parseAdminBalanceChampions(value, balanceFilters)).not.toThrow();
    expect(value.rows.find((r: { championId: string }) => r.championId === 'Garen')).toMatchObject({
      cohortRuns: 1,
      runs: 1,
      players: 1,
      wins: 1,
      survived: 1,
      ledgerRuns: 1,
      meanDamageDealt: 120,
      meanHealingDone: 40,
    });
    expect(value.rows.find((r: { championId: string }) => r.championId === 'Ashe')).toMatchObject({
      cohortRuns: 1,
      runs: 0,
      players: 0,
      wins: 0,
      survived: 0,
      ledgerRuns: 0,
      meanDamageDealt: null,
      meanHealingDone: null,
    });
    expect(value.metrics).toEqual({
      damage: 'ledger_total',
      healing: 'ledger_total',
      dps: 'not_collected',
      crowdControl: 'not_collected',
    });
  });

  it('measures initial picks on all starts, including abandoned starts without any final team', () => {
    const first = analyticsAttempt(templateId, a, '2024-02-01T12:00:00Z', {
      initial_team: ['Garen', 'Ashe'],
    });
    const second = analyticsAttempt(templateId, b, '2024-02-01T13:00:00Z');
    const value = balanceScenario(admin, [a, b], first.sql + second.sql, balanceRpc('champions'));
    expect(value.population).toEqual({ verifiedRuns: 0, uniquePlayers: 0 });
    expect(value.contexts).toEqual([]);
    expect(value.rows).toEqual([]);
    expect(value.selections.population).toEqual({
      starts: 2,
      uniquePlayers: 2,
    });
    expect(
      value.selections.rows.find((r: { championId: string }) => r.championId === 'Garen'),
    ).toMatchObject({
      cohortStarts: 2,
      cohortPlayers: 2,
      starts: 2,
      players: 2,
    });
    expect(
      value.selections.rows.find((r: { championId: string }) => r.championId === 'Ashe'),
    ).toMatchObject({ cohortStarts: 2, starts: 1, players: 1 });
    expect(
      value.selections.rows.find((r: { championId: string }) => r.championId === 'Annie'),
    ).toMatchObject({ cohortStarts: 2, starts: 0, players: 0 });
    expect(() => parseAdminBalanceChampions(value, balanceFilters)).not.toThrow();
  });

  it('keeps start and verification clocks independent when the start lies outside the window', () => {
    const first = fixture();
    const value = balanceScenario(
      admin,
      [a],
      first.sql +
        `UPDATE public.run_attempts SET started_at='2024-01-31T23:59:59Z',created_at='2024-01-31T23:59:59Z' WHERE id='${first.attemptId}';`,
      balanceRpc('champions'),
    );
    expect(value.population.verifiedRuns).toBe(1);
    expect(value.selections.population.starts).toBe(0);
    expect(value.selections.rows).toEqual([]);
  });

  it('keeps initial pick denominators across the champion selector and exact difficulty groups', () => {
    const first = analyticsAttempt(templateId, a, '2024-02-01T12:00:00Z', {
      initial_team: ['Garen'],
    });
    const second = analyticsAttempt(templateId, a, '2024-02-01T13:00:00Z', {
      initial_team: ['Ashe'],
      difficulty: 'hard',
    });
    const selected = {
      ...balanceFilters,
      championId: 'Ashe',
      difficulty: 'normal' as const,
    };
    const value = balanceScenario(
      admin,
      [a],
      first.sql + second.sql,
      balanceRpc('champions', selected),
    );
    expect(value.selections.population).toEqual({
      starts: 1,
      uniquePlayers: 1,
    });
    expect(value.selections.rows).toHaveLength(1);
    expect(value.selections.rows[0]).toMatchObject({
      championId: 'Ashe',
      cohortStarts: 1,
      starts: 0,
      players: 0,
    });
    expect(() => parseAdminBalanceChampions(value, selected)).not.toThrow();
  });

  it('separates mixed compositions and exact rune, mastery, enhancement and authority dimensions', () => {
    const fixtures = [
      fixture(),
      fixture(a, { initial_team: ['Garen', 'Ashe'] }),
      fixture(a, { rune_ids: ['UnknownRune'] }),
      fixture(a, { mastery_snapshot: { Garen: 1 } }),
      fixture(a, { enhancement_snapshot: { Garen: { test: 1 } } }),
      fixture(a, { difficulty: 'hard' }),
    ];
    const value = balanceScenario(
      admin,
      [a],
      fixtures.map((f) => f.sql).join(''),
      balanceRpc('champions'),
    );
    expect(value.population).toEqual({ verifiedRuns: 6, uniquePlayers: 1 });
    expect(value.contexts).toHaveLength(6);
    expect(value.segments).toHaveLength(2);
    expect(
      value.contexts.find(
        (c: { initialComposition: string[] }) => c.initialComposition.length === 2,
      ).initialComposition,
    ).toEqual(['Ashe', 'Garen']);
    expect(value.rows.every((r: { cohortRuns: number }) => r.cohortRuns === 1)).toBe(true);
  });

  it('counts the whole 1005-run population, keeps repeated-player N separate and never clips browser totals', () => {
    const first = fixture();
    const setup =
      first.sql +
      `CREATE TEMP TABLE balance_copies AS SELECT gen_random_uuid()aid,gen_random_uuid()rid FROM generate_series(1,1004);
      INSERT INTO public.run_attempts SELECT mapped.* FROM public.run_attempts t CROSS JOIN balance_copies c CROSS JOIN LATERAL jsonb_populate_record(NULL::public.run_attempts,to_jsonb(t)||jsonb_build_object('id',c.aid,'run_uuid','attempt_'||c.aid,'start_command_id',gen_random_uuid(),'result_run_id',c.rid))mapped WHERE t.id='${first.attemptId}';
    INSERT INTO public.runs(id,player_id,run_uuid,won,waves_completed,run_level,progression_version,progression_source,run_attempt_id,progression_payload_hash,created_at,started_at,completed_at,ledger_version,run_ledger)
    SELECT c.rid,r.player_id,'balance_'||c.rid,r.won,r.waves_completed,r.run_level,r.progression_version,r.progression_source,c.aid,r.progression_payload_hash,r.created_at,r.started_at,r.completed_at,r.ledger_version,r.run_ledger FROM public.runs r CROSS JOIN balance_copies c WHERE r.id='${first.runId}';
    INSERT INTO public.run_team_members(run_id,champion_id,final_hp,survived,damage_dealt,healing_done) SELECT c.rid,m.champion_id,m.final_hp,m.survived,m.damage_dealt,m.healing_done FROM public.run_team_members m CROSS JOIN balance_copies c WHERE m.run_id='${first.runId}';`;
    const value = balanceScenario(
      admin,
      [a],
      setup,
      balanceRpc('champions', { ...balanceFilters, championId: 'Garen' }),
    );
    expect(value.population).toEqual({ verifiedRuns: 1005, uniquePlayers: 1 });
    expect(value.selections.population).toEqual({
      starts: 1005,
      uniquePlayers: 1,
    });
    expect(value.selections.rows[0]).toMatchObject({
      starts: 1005,
      players: 1,
      cohortStarts: 1005,
    });
    expect(value.rows[0]).toMatchObject({
      runs: 1005,
      players: 1,
      wins: 1005,
      cohortRuns: 1005,
      ledgerRuns: 1005,
    });
  });

  it('counts players distinctly across repeated runs and does not pool contexts for win conclusions', () => {
    const value = balanceScenario(
      admin,
      [a, b],
      fixture().sql + fixture().sql + fixture(b, {}, { won: false }).sql,
      balanceRpc('champions', { ...balanceFilters, championId: 'Garen' }),
    );
    expect(value.rows[0]).toMatchObject({
      runs: 3,
      players: 2,
      wins: 2,
      cohortRuns: 3,
      cohortPlayers: 2,
    });
  });

  it('retains a safe unknown historical champion without pretending it is in the versioned catalog', () => {
    const value = balanceScenario(
      admin,
      [a],
      fixture(a, {}, { championId: 'RetiredChampion' }).sql,
      balanceRpc('champions'),
    );
    expect(
      value.rows.find((r: { championId: string }) => r.championId === 'RetiredChampion'),
    ).toMatchObject({ catalogStatus: 'unknown', runs: 1 });
    const absent = balanceScenario(
      admin,
      [a],
      fixture().sql,
      balanceRpc('champions', {
        ...balanceFilters,
        championId: 'MissingChampion',
      }),
    );
    expect(absent.rows).toEqual([]);
    expect(absent.population.verifiedRuns).toBe(1);
  });

  it('does not turn missing or historical default ledger values into measured damage/healing zeros', () => {
    const value = balanceScenario(
      admin,
      [a],
      fixture(a, {}, { ledger: false }).sql,
      balanceRpc('champions', { ...balanceFilters, championId: 'Garen' }),
    );
    expect(value.rows[0]).toMatchObject({
      runs: 1,
      survived: 1,
      ledgerRuns: 0,
      meanDamageDealt: null,
      meanHealingDone: null,
    });
  });

  it('rejects mismatched canonical result linkage and nonverified attempts instead of including them', () => {
    const first = fixture();
    const second = fixture();
    const value = balanceScenario(
      admin,
      [a],
      first.sql +
        second.sql +
        `UPDATE public.runs SET progression_payload_hash=repeat('a',64)WHERE id='${first.runId}';UPDATE public.run_attempts SET status='rejected',verified_at=NULL,rejected_at='2024-02-01T12:30:00Z',rejection_code='fixture' WHERE id='${second.attemptId}';`,
      balanceRpc('champions'),
    );
    expect(value.population).toEqual({ verifiedRuns: 0, uniquePlayers: 0 });
  });

  it('uses verification UTC day and applies exact selected difficulty and authority filters', () => {
    const first = fixture();
    const second = fixture(a, { difficulty: 'hard' });
    const value = balanceScenario(
      admin,
      [a],
      first.sql +
        second.sql +
        `UPDATE public.runs SET completed_at='2024-01-31' WHERE id='${first.runId}';`,
      balanceRpc('champions', {
        ...balanceFilters,
        difficulty: 'normal',
        gameplayVersion: 24,
        engineVersion: 'run-engine-0.2.5',
        contentHash: '9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa',
      }),
    );
    expect(value.population.verifiedRuns).toBe(1);
  });

  it('reports ever-equipped history sets, never concurrent equipment or availability-adjusted effectiveness', () => {
    const value = balanceScenario(
      admin,
      [a],
      fixture(
        a,
        {},
        {
          items: ['UnknownItem', 'AnotherItem'],
          runeIds: ['MissingRune'],
          augmentIds: ['MissingAugment'],
        },
      ).sql,
      balanceRpc('builds'),
    );
    expect(value).toMatchObject({
      itemBasis: 'ever_equipped_set',
      exposure: 'not_collected',
      itemCatalog: 'not_available',
    });
    expect(() => parseAdminBalanceBuilds(value, balanceFilters)).not.toThrow();
    expect(value.rows.find((r: { kind: string }) => r.kind === 'items')).toMatchObject({
      championId: 'Garen',
      ids: ['AnotherItem', 'UnknownItem'],
      unknownIds: [],
      state: 'observed',
      runs: 1,
      wins: 1,
    });
    expect(value.rows.find((r: { kind: string }) => r.kind === 'runes')).toMatchObject({
      championId: null,
      ids: ['MissingRune'],
      unknownIds: ['MissingRune'],
      state: 'observed',
    });
    expect(value.rows.find((r: { kind: string }) => r.kind === 'augments')).toMatchObject({
      unknownIds: ['MissingAugment'],
    });
  });

  it('distinguishes trustworthy empty equipment from missing source and partial history', () => {
    const value = balanceScenario(
      admin,
      [a],
      fixture().sql + fixture(a, {}, { ledger: false }).sql,
      balanceRpc('builds'),
    );
    const items = value.rows.filter((r: { kind: string }) => r.kind === 'items');
    expect(items).toHaveLength(2);
    expect(items.map((r: { state: string }) => r.state).sort()).toEqual(['empty', 'partial']);
    expect(items.every((r: { ids: string[] }) => r.ids.length === 0)).toBe(true);
  });

  it('preserves augment stack multiplicity instead of pooling distinct builds into a set', () => {
    const value = balanceScenario(
      admin,
      [a],
      fixture(a, {}, { augmentIds: ['MissingAugment'] }).sql +
        fixture(a, {}, { augmentIds: ['MissingAugment', 'MissingAugment'] }).sql,
      balanceRpc('builds'),
    );
    const augments = value.rows.filter((r: { kind: string }) => r.kind === 'augments');
    expect(augments).toHaveLength(2);
    expect(augments.map((r: { ids: string[] }) => r.ids.length).sort()).toEqual([1, 2]);
    expect(augments.every((r: { state: string }) => r.state === 'observed')).toBe(true);
    expect(augments.every((r: { unknownIds: string[] }) => r.unknownIds.length === 1)).toBe(true);
    expect(() => parseAdminBalanceBuilds(value, balanceFilters)).not.toThrow();
  });

  it('rejects scope overflow instead of returning a silent first page of contexts', () => {
    const first = fixture();
    const copies = Array.from(
      { length: 129 },
      (_, i) => fixture(a, { enhancement_snapshot: { Garen: { fixture: i } } }).sql,
    ).join('');
    expect(() => balanceScenario(admin, [a], first.sql + copies, balanceRpc('builds'))).toThrow(
      /admin_balance_scope_too_large/,
    );
  });

  it('returns live read-only version and economy state with honest TREE-10 dependency', async () => {
    const value = await rpcData(admin.client, 'admin_balance_config', {});
    expect(() => parseAdminBalanceConfig(value)).not.toThrow();
    expect(value).toMatchObject({
      readOnly: true,
      minimumSampleSize: 30,
      trees: { status: 'dependency_unavailable', dependency: 'TREE-10' },
      unsupportedMetrics: ['dps', 'crowd_control_duration', 'item_exposure'],
    });
    expect(value.gameplayRulesets.filter((r: { active: boolean }) => r.active)).toHaveLength(1);
    expect(value.gameplayRulesets.find((r: { version: number }) => r.version === 24)).toMatchObject(
      { engineVersion: 'run-engine-0.2.5', active: true },
    );
    expect(value.progressionRulesets.filter((r: { active: boolean }) => r.active)).toHaveLength(1);
    expect(JSON.stringify(value)).not.toMatch(
      /user_id|email|lease_token|payload_hash|raw_user_meta_data|command_id/,
    );
  });

  it('represents absent configuration as unavailable rather than an invented disabled flag', () => {
    const value = balanceScenario(
      admin,
      [a],
      'DELETE FROM public.champion_economy_config;',
      'public.admin_balance_config()',
    );
    expect(value.championEconomy).toBeNull();
  });

  it.each([
    null,
    [],
    {},
    { ...balanceFilters, unknown: 'x' },
    { ...balanceFilters, accountAge: 'all' },
    { ...balanceFilters, granularity: 'day' },
    { ...balanceFilters, from: '2024-02-31' },
    { ...balanceFilters, from: '2023-01-01' },
    { ...balanceFilters, to: '2999-01-01' },
    { ...balanceFilters, gameplayVersion: 1.5 },
    { ...balanceFilters, championId: "bad'identifier" },
    { ...balanceFilters, championId: null },
  ])('rejects invalid filters %j before querying cohorts', async (filters) => {
    for (const resource of ['champions', 'builds']) {
      const response = await admin.client.rpc(`admin_balance_${resource}`, {
        p_filters: filters,
      });
      expect(response.data).toBeNull();
      expect(response.error?.code).toBe('22023');
    }
  });
});
