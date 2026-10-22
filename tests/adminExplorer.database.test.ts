import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionRegistry';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseAdminExplorerPage } from '@/features/administration/domain/explorer/adminExplorerClient';
import { parseAdminPlayerDetail } from '@/features/administration/domain/players/adminPlayerProjection';
import {
  parseAdminAttemptItem,
  parseAdminRunItem,
} from '@/features/administration/domain/runs/adminRunContracts';
import { parseAdminRunDetail } from '@/features/administration/infrastructure/runs/adminRunQueries';
import {
  cleanupExplorer,
  type ExplorerAccount,
  explorerAccount,
  explorerClient,
  explorerSql,
  hasAdminExplorerCredentials,
  rpcData,
  seedExplorerAttempt,
  seedExplorerRuns,
} from './helpers/adminExplorerFixtures';

const describeDatabase = hasAdminExplorerCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials) {
  throw new Error(
    'Admin explorer tests require disposable loopback Supabase API and SQL credentials.',
  );
}

describeDatabase('admin explorer exact server projections', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let admin: ExplorerAccount;
  let owner: ExplorerAccount;
  let verified: ExplorerAccount;
  let saved: { attemptId: string; runId: string };
  const prefix = `s2_${randomUUID().split('-').join('')}`;

  beforeAll(async () => {
    service = explorerClient('service');
    admin = await explorerAccount(service, users, { admin: true });
    owner = await explorerAccount(service, users, {
      name: "Élodie_%(Jean), O'Connor",
    });
    verified = await explorerAccount(service, users);
    seedExplorerRuns(owner, 1005, prefix);
    saved = await seedExplorerAttempt(verified);
  });
  afterAll(async () => {
    await cleanupExplorer(service, users);
  });

  it('searches all registered players literally, with Unicode NFC and case folding', async () => {
    for (const search of ['e\u0301LODIE', "O'Connor", '%(Jean)', owner.playerId]) {
      const page = await rpcData(admin.client, 'admin_search_players', {
        p_filters: { search },
      });
      expect(page.items.map((row: { id: string }) => row.id)).toContain(owner.playerId);
    }
    const injected = await rpcData(admin.client, 'admin_search_players', {
      p_filters: { search: "x'),id.neq.0 --" },
    });
    expect(injected).toMatchObject({
      items: [],
      total: 0,
      hasMore: false,
      nextCursor: null,
    });
    expect(
      await rpcData(admin.client, 'admin_search_players', {
        p_filters: { accountState: 'guest' },
      }),
    ).toMatchObject({ items: [], total: 0 });
  });

  it('paginates more than 100 players and returns the exact last partial page', () => {
    const text = explorerSql(`BEGIN;
      INSERT INTO auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      SELECT gen_random_uuid(),'authenticated','authenticated','${prefix}_'||n||'@example.test','{}',jsonb_build_object('username','${prefix}_'||n),NOW(),NOW() FROM generate_series(1,101)n;
      SELECT set_config('request.jwt.claims','{"sub":"${admin.userId}","role":"authenticated"}',TRUE);
      SET LOCAL ROLE authenticated;
      WITH first AS(SELECT public.admin_search_players(jsonb_build_object('search','${prefix}'),NULL,NULL,100) page)
      SELECT jsonb_build_object('total',page->'total','firstLength',jsonb_array_length(page->'items'),
       'last',public.admin_search_players(jsonb_build_object('search','${prefix}'),page->'nextCursor',(page->>'snapshotAt')::timestamptz,100)) FROM first;
      ROLLBACK;`);
    const result = JSON.parse(text.split('\n').find((line) => line.startsWith('{"last"'))!);
    expect(result).toMatchObject({
      total: 101,
      firstLength: 100,
      last: { total: 101, hasMore: false, nextCursor: null },
    });
    expect(result.last.items).toHaveLength(1);
  });

  it('filters dates, verified activity and actual account population on the server', async () => {
    const some = await rpcData(admin.client, 'admin_search_players', {
      p_filters: {
        search: verified.playerId,
        verifiedRuns: 'some',
        accountState: 'registered',
      },
    });
    expect(some.items[0]).toMatchObject({ verifiedRuns: 1, verifiedWins: 1 });
    expect(
      (
        await rpcData(admin.client, 'admin_search_players', {
          p_filters: { search: owner.playerId, verifiedRuns: 'some' },
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await rpcData(admin.client, 'admin_search_players', {
          p_filters: {
            search: owner.playerId,
            registeredTo: '2025-01-01T00:00:00Z',
          },
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await rpcData(admin.client, 'admin_search_players', {
          p_filters: {
            search: owner.playerId,
            activeFrom: '2020-01-01T00:00:00Z',
          },
        })
      ).total,
    ).toBe(0);
  });

  it.each(['completed_at', 'waves_completed', 'run_level'] as const)(
    'keeps keyset order and every UUID across >1000 runs sorted by %s',
    async (sortBy) => {
      for (const sortOrder of ['asc', 'desc']) {
        const filters = { playerId: owner.playerId, sortBy, sortOrder };
        let cursor = null;
        let stamp = null;
        const actual: string[] = [];
        do {
          const page = await rpcData(admin.client, 'admin_search_runs', {
            p_filters: filters,
            p_cursor: cursor,
            p_snapshot: stamp,
            p_page_size: 100,
          });
          expect(page.total).toBe(1005);
          expect(page.items.length).toBeLessThanOrEqual(100);
          expect(page.items.every((row: { team: unknown[] }) => row.team.length === 1)).toBe(true);
          actual.push(...page.items.map((row: { id: string }) => row.id));
          cursor = page.nextCursor;
          stamp = page.snapshotAt;
          expect(page.hasMore).toBe(cursor !== null);
        } while (cursor);
        const ordering = `${sortBy} ${sortOrder},${sortBy === 'completed_at' ? '' : `completed_at ${sortOrder},`}id ${sortOrder}`;
        const expected = JSON.parse(
          explorerSql(
            `SELECT jsonb_agg(id ORDER BY ${ordering}) FROM public.runs WHERE player_id='${owner.playerId}'`,
          ),
        );
        expect(actual).toEqual(expected);
        expect(new Set(actual).size).toBe(1005);
      }
    },
    30_000,
  );

  it('reuses a watermark after concurrent insertion and supports returning to the first page', async () => {
    const filters = { playerId: owner.playerId };
    const first = await rpcData(admin.client, 'admin_search_runs', {
      p_filters: filters,
      p_page_size: 100,
    });
    const insertedId = randomUUID();
    try {
      explorerSql(
        `INSERT INTO public.runs(id,player_id,run_uuid) VALUES('${insertedId}','${owner.playerId}','new_${randomUUID()}')`,
      );
      const second = await rpcData(admin.client, 'admin_search_runs', {
        p_filters: filters,
        p_cursor: first.nextCursor,
        p_snapshot: first.snapshotAt,
        p_page_size: 100,
      });
      expect(second.total).toBe(1005);
      expect(second.items.map((row: { id: string }) => row.id)).not.toContain(insertedId);
      const back = await rpcData(admin.client, 'admin_search_runs', {
        p_filters: filters,
        p_snapshot: first.snapshotAt,
        p_page_size: 100,
      });
      expect(back).toEqual(first);
    } finally {
      explorerSql(`DELETE FROM public.runs WHERE id='${insertedId}'`);
    }
  });

  it('combines run filters without treating unavailable legacy dimensions as normal', async () => {
    const page = await rpcData(admin.client, 'admin_search_runs', {
      p_filters: {
        playerId: verified.playerId,
        championId: 'Garen',
        result: 'won',
        verification: 'verified',
        difficulty: 'normal',
        mode: 'normal',
        minWaves: 3,
        maxWaves: 3,
        progressionVersion: CURRENT_AUTHORITY_VERSION.progression,
        ledgerVersion: 1,
      },
    });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      id: saved.runId,
      verificationStatus: 'verified',
    });
    expect(
      (
        await rpcData(admin.client, 'admin_search_runs', {
          p_filters: { playerId: owner.playerId, difficulty: 'normal' },
        })
      ).total,
    ).toBe(0);
    expect(
      (
        await rpcData(admin.client, 'admin_search_runs', {
          p_filters: {
            playerId: owner.playerId,
            biome: 'top_lane',
            minWaves: 0,
            maxWaves: 16,
          },
        })
      ).total,
    ).toBe(1005);
  });

  it('exports every filtered run atomically, preserving team bigint values and refusing truncation', async () => {
    const args = { p_filters: { playerId: owner.playerId }, p_max_rows: 1005 };
    const exported = await rpcData(admin.client, 'admin_export_runs', args);
    expect(exported.items).toHaveLength(1005);
    expect(exported.total).toBe(1005);
    expect(exported.items.map(parseAdminRunItem)).toHaveLength(1005);
    expect(exported.items[0].team[0].damageDealt).toBe('9007199254740993');
    expect(exported.items[0].seed).toBe('9007199254740993');
    const again = await rpcData(admin.client, 'admin_export_runs', {
      ...args,
      p_snapshot: exported.snapshotAt,
    });
    expect(again).toEqual(exported);
    const capped = await admin.client.rpc('admin_export_runs', {
      ...args,
      p_max_rows: 1000,
    });
    expect(capped.data).toBeNull();
    expect(capped.error).toMatchObject({
      code: '22023',
      message: 'admin_export_limit_exceeded',
    });
  });

  it('separates authority attempts, exports the selected population and rejects unsupported dimensions', async () => {
    const args = {
      p_filters: {
        playerId: verified.playerId,
        status: 'verified',
        championId: 'Garen',
        progressionVersion: CURRENT_AUTHORITY_VERSION.progression,
      },
    };
    const page = await rpcData(admin.client, 'admin_search_attempts', args);
    expect(page.total).toBe(1);
    expect(parseAdminExplorerPage(page, parseAdminAttemptItem).items[0].id).toBe(saved.attemptId);
    expect(page.items[0]).toMatchObject({
      id: saved.attemptId,
      resultRunId: saved.runId,
    });
    expect(
      (
        await rpcData(admin.client, 'admin_export_runs', {
          ...args,
          p_population: 'attempts',
        })
      ).items,
    ).toEqual(page.items);
    for (const key of ['biome', 'minWaves', 'result', 'ledgerVersion', 'sortBy']) {
      const invalid = await admin.client.rpc('admin_search_attempts', {
        p_filters: { [key]: 'all' },
      });
      expect(invalid.error?.code).toBe('22023');
    }
  });

  it('projects paginated action fields without secrets, raw traces or raw authority results', async () => {
    const args = { p_run_id: saved.runId, p_page_size: 2 };
    const first = await rpcData(admin.client, 'admin_get_run_detail', args);
    expect(parseAdminRunDetail(first).run?.id).toBe(saved.runId);
    expect(first).toMatchObject({
      total: 5,
      hasMore: true,
      run: { id: saved.runId },
      attempt: { id: saved.attemptId },
    });
    const second = await rpcData(admin.client, 'admin_get_run_detail', {
      ...args,
      p_cursor: first.nextCursor,
      p_snapshot: first.snapshotAt,
    });
    const third = await rpcData(admin.client, 'admin_get_run_detail', {
      ...args,
      p_cursor: second.nextCursor,
      p_snapshot: first.snapshotAt,
    });
    expect(
      [...first.items, ...second.items, ...third.items].map(
        (row: { sequence: number }) => row.sequence,
      ),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(second.items[0]).toMatchObject({
      kind: 'unsupported',
      nodeId: null,
    });
    expect(third).toMatchObject({ hasMore: false, nextCursor: null });
    const serialized = JSON.stringify([first, second, third]);
    for (const secret of [
      'secret-lease-marker',
      'secret-auth-marker',
      'nested-secret-marker',
      'raw-result-marker',
      'raw-response-marker',
      verified.userId,
      'lease_token',
      'result_hash',
      'payload_hash',
      'actions_json',
    ])
      expect(serialized).not.toContain(secret);
    expect(first.timeline.map((event: { kind: string }) => event.kind)).toEqual(
      expect.arrayContaining(['started', 'finished', 'verified', 'completed']),
    );
  });

  it('supports an unsaved rejected attempt and a legacy run with absent journal/version data', async () => {
    const rejectedOwner = await explorerAccount(service, users);
    const started = await rejectedOwner.client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
    });
    expect(started.error).toBeNull();
    const id = started.data.attempt_id;
    explorerSql(
      `UPDATE public.run_attempts SET status='rejected',finish_command_id=gen_random_uuid(),finished_at=NOW(),rejected_at=NOW(),rejection_code='invalid_command' WHERE id='${id}'`,
    );
    const detail = await rpcData(admin.client, 'admin_get_attempt_detail', {
      p_attempt_id: id,
    });
    expect(detail).toMatchObject({
      run: null,
      attempt: { rejectionCode: 'invalid_command' },
      items: [],
      total: 0,
    });
    const legacyId = explorerSql(
      `SELECT id FROM public.runs WHERE player_id='${owner.playerId}' LIMIT 1`,
    );
    expect(
      await rpcData(admin.client, 'admin_get_run_detail', {
        p_run_id: legacyId,
      }),
    ).toMatchObject({
      attempt: null,
      items: [],
      run: {
        engineVersion: null,
        difficulty: null,
        verificationStatus: 'legacy',
      },
    });
  });

  it('shows verified totals separately from current balances and unknown Candy history', async () => {
    const adjusted = await service
      .from('players')
      .update({ total_candies: 137 })
      .eq('id', owner.playerId);
    expect(adjusted.error).toBeNull();
    const profile = await rpcData(admin.client, 'admin_get_player_detail', {
      p_player_id: owner.playerId,
    });
    expect(profile).toMatchObject({
      profile: { id: owner.playerId, candiesBalance: '137' },
      verifiedStats: { runs: 0, wins: 0, candiesEarned: '0' },
      candies: {
        balance: '137',
        historyComplete: false,
        reconciled: true,
        earnedSinceLedger: '0',
        unattributedSinceLedger: '137',
      },
      mastery: { items: [], total: 0 },
      enhancements: { items: [], total: 0 },
    });
    expect(parseAdminPlayerDetail(profile).profile.id).toBe(owner.playerId);
    expect(profile.candies.transactions.items[0]).toMatchObject({
      kind: 'unattributed',
      amount: '137',
    });
    const actual = await rpcData(admin.client, 'admin_get_player_detail', {
      p_player_id: verified.playerId,
    });
    expect(actual.verifiedStats).toMatchObject({
      runs: 1,
      wins: 1,
      waves: 3,
      candiesEarned: '7',
    });
    expect(JSON.stringify(profile)).not.toContain(owner.userId);
  });

  it('bounds large progression and ledger sections while retaining exact totals', async () => {
    const historyOwner = await explorerAccount(service, users);
    explorerSql(`INSERT INTO public.champion_mastery(player_id,champion_id)
      SELECT '${historyOwner.playerId}','future_champion_'||n FROM generate_series(1,201)n;
      INSERT INTO public.champion_enhancements(user_id,champion_id)
      SELECT '${historyOwner.userId}','future_champion_'||n FROM generate_series(1,201)n;
      INSERT INTO public.account_wallets(user_id) VALUES('${historyOwner.userId}') ON CONFLICT DO NOTHING;
      INSERT INTO public.account_champion_unlocks(user_id,champion_id,source)
      SELECT '${historyOwner.userId}','future_champion_'||n,'legacy_grant' FROM generate_series(1,51)n;
      DO $$ BEGIN
        PERFORM set_config('request.jwt.claims','{"role":"service_role"}',TRUE);
        FOR n IN 1..51 LOOP
          PERFORM private.refund_candies('${historyOwner.playerId}',1,gen_random_uuid());
          PERFORM public.adjust_champion_shards('${historyOwner.userId}',1,gen_random_uuid());
        END LOOP;
      END $$;`);
    const detail = await rpcData(admin.client, 'admin_get_player_detail', {
      p_player_id: historyOwner.playerId,
    });
    for (const name of ['mastery', 'enhancements']) {
      expect(detail[name]).toMatchObject({ total: 201, hasMore: true });
      expect(detail[name].items).toHaveLength(200);
    }
    for (const history of [
      detail.candies.transactions,
      detail.shards.transactions,
      detail.purchases,
    ]) {
      expect(history).toMatchObject({ total: 51, hasMore: true });
      expect(history.items).toHaveLength(50);
    }
    expect(detail.shards).toMatchObject({
      balance: '51',
      ledgerBalance: '51',
      reconciled: true,
    });
    expect(detail.candies).toMatchObject({
      balance: '51',
      refundedSinceLedger: '51',
      earnedSinceLedger: '0',
      reconciled: true,
    });
  });

  it('rejects invalid filter/cursor shapes, altered filter scope, and missing detail IDs', async () => {
    for (const p_filters of [
      { unknown: 'x' },
      { minWaves: -1 },
      { minWaves: 4, maxWaves: 3 },
      { mode: 'invented' },
      { from: 'infinity' },
      { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' },
    ]) {
      expect((await admin.client.rpc('admin_search_runs', { p_filters })).error?.code).toBe(
        '22023',
      );
    }
    const first = await rpcData(admin.client, 'admin_search_runs', {
      p_filters: { playerId: owner.playerId },
      p_page_size: 2,
    });
    expect(
      (
        await admin.client.rpc('admin_search_runs', {
          p_filters: { playerId: verified.playerId },
          p_cursor: first.nextCursor,
          p_snapshot: first.snapshotAt,
        })
      ).error?.code,
    ).toBe('22023');
    for (const p_page_size of [0, -1, 101])
      expect((await admin.client.rpc('admin_search_runs', { p_page_size })).error?.code).toBe(
        '22023',
      );
    expect(
      (
        await admin.client.rpc('admin_get_player_detail', {
          p_player_id: randomUUID(),
        })
      ).error,
    ).toMatchObject({ code: 'P0002', message: 'admin_player_not_found' });
    expect(
      (
        await admin.client.rpc('admin_get_run_detail', {
          p_run_id: randomUUID(),
        })
      ).error?.code,
    ).toBe('P0002');
    expect(
      (
        await admin.client.rpc('admin_get_attempt_detail', {
          p_attempt_id: randomUUID(),
        })
      ).error?.code,
    ).toBe('P0002');
  });
});
