import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseAdminBalanceTrees } from '@/features/administration/domain/balance/adminTreeReportParser';
import { analyticsAttempt } from './helpers/adminAnalyticsFixtures';
import {
  balanceFilters,
  balanceFinish,
  balanceScenario,
  balanceSnapshot,
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
  throw new Error('Admin trees need disposable loopback credentials.');
const treeRpc = `public.admin_balance_trees('${JSON.stringify(balanceFilters)}','${balanceSnapshot}')`;

describeDatabase('TREE-10 canonical aggregate sources and privacy thresholds', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let admin: ExplorerAccount;
  let owner: ExplorerAccount;
  let templateId: string;
  beforeAll(async () => {
    service = explorerClient('service');
    admin = await explorerAccount(service, users, { admin: true });
    owner = await explorerAccount(service, users);
    const start = await rpcData(owner.client, 'start_run_attempt', {
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
  afterAll(async () => cleanupExplorer(service, users));

  it('rejects non-admin and anonymous reads using current database authorization', async () => {
    const ordinary = await owner.client.rpc('admin_balance_trees', { p_filters: balanceFilters });
    expect(ordinary.error?.code).toBe('42501');
    const anon = await explorerClient().rpc('admin_balance_trees', { p_filters: balanceFilters });
    expect(anon.error?.code).toBe('42501');
    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE id='${admin.playerId}'`);
    try {
      expect(
        (await admin.client.rpc('admin_balance_trees', { p_filters: balanceFilters })).error?.code,
      ).toBe('42501');
    } finally {
      explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE id='${admin.playerId}'`);
    }
  });

  it('reports genuine N0, explicit catalogue gates and no fabricated exposure', async () => {
    const report = parseAdminBalanceTrees(
      await rpcData(admin.client, 'admin_balance_trees', { p_filters: balanceFilters }),
      balanceFilters,
    );
    expect(report.population).toEqual({ verifiedRuns: 0, uniquePlayers: 0 });
    expect(report.builds).toEqual([]);
    expect(report.purchases).toMatchObject({
      commands: 0,
      resets: 0,
      uniquePurchasers: 0,
      spent: 0,
      refunded: 0,
      attestedSpend: 0,
      nodes: [],
      branches: [],
      exposure: 'not_collected',
    });
    expect(report.catalogue).toHaveLength(88);
    expect(report.catalogue.filter((n) => n.availability === 'disabled')).toHaveLength(12);
    expect(report.catalogue.filter((n) => n.availability === 'dependency_blocked')).toHaveLength(3);
    expect(report.catalogue.filter((n) => n.availability === 'gated')).toHaveLength(16);
    expect(report.catalogue.filter((n) => n.availability === 'available')).toHaveLength(57);
    expect(JSON.stringify(report)).not.toContain(owner.userId);
  });

  it('reconciles repeat purchases and one reset from the existing ledger without modifying the balance', async () => {
    const a = await explorerAccount(service, users);
    explorerSql(`UPDATE public.players SET total_candies=100 WHERE id='${a.playerId}'`);
    const buy = (revision: number) =>
      a.client.rpc('unlock_champion_enhancement_v2', {
        p_champion_id: 'Garen',
        p_node_id: 'fighter_core_1',
        p_expected_rank: 0,
        p_expected_revision: revision,
        p_command_id: randomUUID(),
        p_expected_catalog_version: 4,
      });
    expect((await buy(0)).error).toBeNull();
    expect(
      (
        await a.client.rpc('reset_champion_enhancements', {
          p_champion_id: 'Garen',
          p_expected_revision: 1,
          p_command_id: randomUUID(),
          p_expected_policy_version: 1,
        })
      ).error,
    ).toBeNull();
    expect((await buy(2)).error).toBeNull();
    const today = new Date().toISOString().slice(0, 10);
    const filters = { from: today, to: today, progressionVersion: 4, championId: 'Garen' };
    const report = parseAdminBalanceTrees(
      await rpcData(admin.client, 'admin_balance_trees', { p_filters: filters }),
      filters,
    );
    expect(report.purchases).toMatchObject({
      commands: 2,
      resets: 1,
      uniquePurchasers: 1,
      spent: 40,
      refunded: 20,
      attestedSpend: 40,
      ledgerComplete: true,
      unclassifiedCommands: 0,
    });
    expect(report.purchases.nodes).toHaveLength(1);
    expect(report.purchases.nodes[0]).toMatchObject({
      purchases: 2,
      players: 1,
      purchaserShare: null,
      insufficientSample: true,
    });
    expect(report.purchases.branches[0]).toMatchObject({
      branchId: 'fighter_core',
      purchases: 2,
      players: 1,
    });
    expect(
      (await service.from('players').select('total_candies').eq('id', a.playerId).single()).data
        ?.total_candies,
    ).toBe(80);
    await cleanupExplorer(service, [a.userId]);
    users.splice(users.indexOf(a.userId), 1);
    const after = parseAdminBalanceTrees(
      await rpcData(admin.client, 'admin_balance_trees', { p_filters: filters }),
      filters,
    );
    expect(after.purchases.commands).toBe(0);
    expect(after.purchases.resets).toBe(0);
  });

  function runFixture(a: ExplorerAccount, snapshot: Record<string, unknown>, won = true) {
    const attempt = analyticsAttempt(templateId, a, '2024-02-01T12:00:00Z', {
      mastery_snapshot: {},
      enhancement_snapshot: snapshot,
      progression_ruleset_version: 4,
    });
    const finish = balanceFinish(attempt.id, a, { won });
    return {
      attemptId: attempt.id,
      runId: finish.id,
      sql: attempt.sql + finish.sql.replace(",2,3,'verified'", ",2,4,'verified'"),
    };
  }

  it('suppresses intervals for repeated players and separates the exact frozen rank snapshot', () => {
    const first = runFixture(owner, { Garen: { fighter_core_1: 1 } });
    const second = runFixture(owner, { Garen: { fighter_core_1: 1, fighter_core_2: 1 } }, false);
    const report = parseAdminBalanceTrees(
      balanceScenario(admin, [owner], first.sql + second.sql, treeRpc),
      balanceFilters,
    );
    expect(report.population).toEqual({ verifiedRuns: 2, uniquePlayers: 1 });
    expect(report.builds).toHaveLength(2);
    expect(new Set(report.builds.map((b) => b.snapshotHash)).size).toBe(2);
    expect(
      report.builds.every(
        (b) => b.winRate === null && b.interval95 === null && b.insufficientSample,
      ),
    ).toBe(true);
    expect(new Set(report.contexts.map((c) => c.enhancementHash)).size).toBe(2);
  });

  it('computes Wilson for 30 independent retained players and excludes rejected, unmatched and malformed evidence', () => {
    const accounts = Array.from({ length: 33 }, () => ({
      ...owner,
      userId: randomUUID(),
      playerId: randomUUID(),
    }));
    let setup = accounts
      .map(
        (
          a,
        ) => `INSERT INTO auth.users(id,aud,role,email,is_anonymous,created_at,updated_at)VALUES('${a.userId}','authenticated','authenticated','tree-${a.userId}@example.test',FALSE,'2024-01-01','2024-01-01');
      INSERT INTO public.players(id,user_id,username,created_at)VALUES('${a.playerId}','${a.userId}','tree_${a.playerId.slice(0, 20)}','2024-01-01');`,
      )
      .join('\n');
    const good = accounts
      .slice(0, 30)
      .map((a, i) => runFixture(a, { Garen: { fighter_core_1: 1 } }, i % 2 === 0));
    setup += good.map((r) => r.sql).join('\n');
    const rejected = runFixture(accounts[30], { Garen: { fighter_core_1: 1 } });
    setup +=
      rejected.sql +
      `UPDATE public.run_attempts SET status='rejected',verified_at=NULL,rejected_at='2024-02-01T12:30:00Z',rejection_code='fixture' WHERE id='${rejected.attemptId}';`;
    const unmatched = runFixture(accounts[31], { Garen: { fighter_core_1: 1 } });
    setup +=
      unmatched.sql +
      `UPDATE public.runs SET progression_payload_hash=repeat('f',64)WHERE id='${unmatched.runId}';`;
    const partial = runFixture(accounts[32], { Garen: { unknown_private_payload: 1 } });
    setup += partial.sql;
    const report = parseAdminBalanceTrees(
      balanceScenario(admin, [owner], setup, treeRpc),
      balanceFilters,
    );
    expect(report.population).toEqual({ verifiedRuns: 31, uniquePlayers: 31 });
    const valid = report.builds.find((b) => b.state === 'observed')!;
    expect(valid).toMatchObject({
      runs: 30,
      players: 30,
      wins: 15,
      winRate: 0.5,
      insufficientSample: false,
      rateStatus: 'descriptive',
    });
    expect(valid.interval95?.lower).toBeGreaterThan(0.3);
    expect(valid.interval95?.upper).toBeLessThan(0.7);
    const incomplete = report.builds.find((b) => b.state === 'partial')!;
    expect(incomplete.nodeIds).toEqual([]);
    expect(incomplete.winRate).toBeNull();
    expect(JSON.stringify(report)).not.toContain('unknown_private_payload');
  });
});
