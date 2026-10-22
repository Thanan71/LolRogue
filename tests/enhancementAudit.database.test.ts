import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getEnhancementServerLockReason,
  readEnhancementServerCatalog,
} from '../tooling/enhancements/serverEvidence';
import {
  cleanupExplorer,
  type ExplorerAccount,
  explorerAccount,
  explorerClient,
  explorerSql,
  hasAdminExplorerCredentials,
} from './helpers/adminExplorerFixtures';

const describeDatabase = hasAdminExplorerCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials) {
  throw new Error('Enhancement audit requires disposable loopback API and SQL credentials.');
}
const catalog = readEnhancementServerCatalog(process.cwd());
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
const claims = (account: ExplorerAccount) => `SELECT set_config('request.jwt.claims',
  ${literal(JSON.stringify({ sub: account.userId, role: 'authenticated' }))}, TRUE);`;
const result = <T>(sql: string): T => {
  const output = explorerSql(sql);
  const line = output.split('\n').find((entry) => /^\{"audit"\s*:/.test(entry));
  if (!line) throw new Error('Missing enhancement audit result');
  return (JSON.parse(line) as { audit: T }).audit;
};
const mastery = (account: ExplorerAccount, champion: string, candies = 700) => `
  INSERT INTO public.champion_mastery(player_id,champion_id,total_candies,mastery_level)
  VALUES ('${account.playerId}',${literal(champion)},${candies},4)
  ON CONFLICT(player_id,champion_id) DO UPDATE SET total_candies=EXCLUDED.total_candies,mastery_level=4;`;
const unlock = (champion: string, node: string, rank = 0, command = randomUUID()) =>
  `public.unlock_champion_enhancement(${literal(champion)},${literal(node)},${rank},'${command}'::uuid)`;

describeDatabase('TREE-01 actual enhancement catalog, permissions and purchases', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let owner: ExplorerAccount;
  let other: ExplorerAccount;
  let admin: ExplorerAccount;
  beforeAll(async () => {
    service = explorerClient('service');
    owner = await explorerAccount(service, users);
    other = await explorerAccount(service, users);
    admin = await explorerAccount(service, users, { admin: true });
  });
  afterAll(async () => cleanupExplorer(service, users));

  it('matches the active SQL catalog and champion role assignments to all extracted migration rows', () => {
    const actual = result<{
      version: number;
      nodes: unknown[];
      champions: unknown[];
    }>(`BEGIN READ ONLY;
      SELECT json_build_object('audit', json_build_object(
        'version',(SELECT version FROM public.progression_rulesets WHERE is_active),
        'nodes',(SELECT json_agg(json_build_object('id',node_id,'role',champion_role,'candyCost',candy_cost,
          'maxRanks',max_rank,'requiredMasteryLevel',required_mastery_level,'prerequisites',prerequisite_node_ids,
          'active',active,'rulesetVersion',ruleset_version,'championId',champion_id,'disabledReason',disabled_reason,'eligibility',eligibility) ORDER BY node_id COLLATE "C")
          FROM public.enhancement_node_catalog WHERE ruleset_version=(SELECT version FROM public.progression_rulesets WHERE is_active)),
        'champions',(SELECT json_agg(json_build_object('championId',champion_id,'primaryRole',primary_role,'active',active)
          ORDER BY champion_id COLLATE "C") FROM public.progression_champion_catalog
          WHERE ruleset_version=(SELECT version FROM public.progression_rulesets WHERE is_active))
      )); ROLLBACK;`);
    expect(actual.version).toBe(catalog.rulesetVersion);
    expect(actual.nodes).toEqual([...catalog.nodes].sort((a, b) => (a.id < b.id ? -1 : 1)));
    expect(actual.champions).toEqual(
      [...catalog.champions].sort((a, b) => (a.championId < b.championId ? -1 : 1)),
    );
  });

  it('checks effective function grants, owner RLS and direct-write denial including an administrator', async () => {
    const actual = result<{
      grants: { role: string; purchase: boolean; privatePurchase: boolean; mutate: boolean }[];
      visibility: Record<string, number>;
    }>(`BEGIN;
      INSERT INTO public.champion_enhancements(user_id,champion_id,unlocked_nodes)
      VALUES ('${owner.userId}','Garen','{"fighter_core_1":1}');
      CREATE TEMP TABLE audit_visibility(label text,n integer); GRANT INSERT,SELECT ON audit_visibility TO authenticated;
      ${[owner, other, admin]
        .map(
          (account, index) => `${claims(account)} SET LOCAL ROLE authenticated;
        INSERT INTO audit_visibility SELECT '${['owner', 'other', 'administrator'][index]}',count(*)
        FROM public.champion_enhancements WHERE user_id='${owner.userId}'; RESET ROLE;`,
        )
        .join('\n')}
      SELECT json_build_object('audit',json_build_object(
        'grants',(SELECT json_agg(json_build_object('role',r,'purchase',
          has_function_privilege(r,'public.unlock_champion_enhancement(text,text,integer,uuid)','EXECUTE'),
          'privatePurchase',has_function_privilege(r,'private.purchase_enhancement_v4(text,text,integer,integer,uuid)','EXECUTE'),
          'mutate',has_table_privilege(r,'public.champion_enhancements','INSERT,UPDATE,DELETE')))
          FROM unnest(ARRAY['anon','authenticated','service_role']) r),
        'visibility',(SELECT json_object_agg(label,n) FROM audit_visibility)
      )); ROLLBACK;`);
    expect(actual.grants).toEqual([
      { role: 'anon', purchase: false, privatePurchase: false, mutate: false },
      { role: 'authenticated', purchase: true, privatePurchase: false, mutate: false },
      { role: 'service_role', purchase: false, privatePurchase: false, mutate: true },
    ]);
    expect(actual.visibility).toEqual({ owner: 1, other: 0, administrator: 0 });
    const anonymousApi = explorerClient();
    const denied = await anonymousApi.rpc('unlock_champion_enhancement', {
      p_champion_id: 'Garen',
      p_node_id: 'fighter_core_1',
      p_expected_rank: 0,
      p_command_id: randomUUID(),
    });
    expect(denied.error?.code).toBe('42501');
    for (const account of [other, admin]) {
      const ownPurchase = await account.client.rpc('unlock_champion_enhancement', {
        p_champion_id: 'Garen',
        p_node_id: 'fighter_core_1',
        p_expected_rank: 0,
        p_command_id: randomUUID(),
      });
      expect(ownPurchase.error?.message).toBe('insufficient_candies');
    }
    const anonymousSession = await anonymousApi.auth.signInAnonymously();
    if (anonymousSession.data.user) {
      users.push(anonymousSession.data.user.id);
      const anonymousPurchase = await anonymousApi.rpc('unlock_champion_enhancement', {
        p_champion_id: 'Garen',
        p_node_id: 'fighter_core_1',
        p_expected_rank: 0,
        p_command_id: randomUUID(),
      });
      expect(anonymousPurchase.error?.message).toBe('registered_account_required');
      await anonymousApi.auth.signOut();
    }
    // This is the disposable local config, not a claim about any remote project.
    if (!anonymousSession.data.user)
      expect(anonymousSession.error?.code).toBe('anonymous_provider_disabled');
  });

  it('checks all 88 canonical IDs against actual SQL: 57 legal, 12 disabled, 3 inherited and 16 gated', () => {
    const champions = new Map(
      catalog.nodes.map((node) => [
        node.role,
        catalog.champions.find((champion) => champion.primaryRole === node.role)!.championId,
      ]),
    );
    const ancestors = (id: string, owned: Record<string, number> = {}): Record<string, number> => {
      for (const parent of catalog.nodes.find((node) => node.id === id)?.prerequisites ?? []) {
        owned[parent] = 1;
        ancestors(parent, owned);
      }
      return owned;
    };
    const probe = catalog.nodes.map((node) => {
      const championId = node.championId ?? champions.get(node.role)!;
      const owned = ancestors(node.id);
      return {
        node,
        championId,
        owned,
        error: getEnhancementServerLockReason(node, owned, 4, 100_000, undefined, {
          nodes: catalog.nodes,
          championId,
        }),
      };
    });
    const actual = result<{
      responses: {
        node_id: string;
        current_rank: number;
        candy_cost: number;
        max_rank: number;
        catalog_version: number;
        replayed: boolean;
      }[];
      errors: Record<string, string>;
      spent: number;
      debited: number;
      commands: number;
      balance: number;
    }>(`BEGIN;
      UPDATE public.players SET total_candies=100000 WHERE id='${owner.playerId}';
      ${[...new Set(probe.map((entry) => entry.championId))].map((champion) => mastery(owner, champion)).join('\n')}
      CREATE TEMP TABLE audit_purchases(response jsonb); GRANT INSERT,SELECT ON audit_purchases TO authenticated;
      CREATE TEMP TABLE audit_errors(node_id text,error text); GRANT INSERT,SELECT ON audit_errors TO authenticated;
      ${claims(owner)}
      ${probe
        .map(
          ({ node, championId, owned }) => `
        INSERT INTO public.champion_enhancements(user_id,champion_id,unlocked_nodes)
        VALUES ('${owner.userId}',${literal(championId)},${literal(JSON.stringify(owned))}::jsonb)
        ON CONFLICT(user_id,champion_id) DO UPDATE SET unlocked_nodes=EXCLUDED.unlocked_nodes;
        SET LOCAL ROLE authenticated;
        DO $audit$ BEGIN BEGIN INSERT INTO audit_purchases VALUES (${unlock(championId, node.id)});
          EXCEPTION WHEN OTHERS THEN INSERT INTO audit_errors VALUES (${literal(node.id)},SQLERRM); END; END $audit$;
        RESET ROLE;`,
        )
        .join('\n')}
      SELECT json_build_object('audit',json_build_object(
        'responses',(SELECT json_agg(response ORDER BY response->>'node_id' COLLATE "C") FROM audit_purchases),
        'errors',(SELECT json_object_agg(node_id,error) FROM audit_errors),
        'spent',(SELECT count(*) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='spent'),
        'debited',(SELECT -sum(amount) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='spent'),
        'commands',(SELECT count(*) FROM public.progression_commands WHERE user_id='${owner.userId}'),
        'balance',(SELECT total_candies FROM public.players WHERE id='${owner.playerId}')
      )); ROLLBACK;`);
    expect(probe.filter((entry) => entry.error === null)).toHaveLength(57);
    expect(actual.responses).toHaveLength(57);
    expect(actual.errors).toEqual(
      Object.fromEntries(
        probe.filter((entry) => entry.error).map((entry) => [entry.node.id, entry.error]),
      ),
    );
    for (const { node } of probe.filter((entry) => entry.error === null)) {
      expect(actual.responses.find((response) => response.node_id === node.id)).toMatchObject({
        current_rank: 1,
        candy_cost: node.candyCost,
        max_rank: node.maxRanks,
        catalog_version: 4,
        replayed: false,
      });
    }
    const total = probe
      .filter((entry) => entry.error === null)
      .reduce((sum, entry) => sum + entry.node.candyCost, 0);
    expect(actual.spent).toBe(57);
    expect(actual.commands).toBe(57);
    expect(actual.debited).toBe(total);
    expect(actual.balance).toBe(100000 - total);
    // Owned ancestry is seeded to isolate every SQL node refusal, including legacy
    // disabled parents. A separate test buys a complete legal chain from empty.
  });

  it('buys a complete legal three-node chain from empty and freezes its earlier run snapshot', () => {
    const actual = result<{
      purchases: { node_id: string; current_rank: number }[];
      snapshot: Record<string, Record<string, number>>;
      current: Record<string, number>;
      mastery: number[];
      spent: number;
    }>(`BEGIN;
      UPDATE public.players SET total_candies=1000 WHERE id='${owner.playerId}'; ${mastery(owner, 'Garen')}
      CREATE TEMP TABLE audit_chain(response jsonb); CREATE TEMP TABLE audit_attempt(response jsonb);
      GRANT INSERT,SELECT ON audit_chain,audit_attempt TO authenticated;
      ${claims(owner)} SET LOCAL ROLE authenticated;
      INSERT INTO audit_chain VALUES (${unlock('Garen', 'fighter_core_1')});
      INSERT INTO audit_attempt SELECT public.start_run_attempt('${randomUUID()}'::uuid,ARRAY['Garen'],ARRAY[]::text[],'normal','normal');
      INSERT INTO audit_chain VALUES (${unlock('Garen', 'fighter_core_2')});
      INSERT INTO audit_chain VALUES (${unlock('Garen', 'fighter_core_3')}); RESET ROLE;
      SELECT json_build_object('audit',json_build_object(
        'purchases',(SELECT json_agg(response) FROM audit_chain),
        'snapshot',(SELECT enhancement_snapshot FROM public.run_attempts WHERE id=(SELECT (response->>'attempt_id')::uuid FROM audit_attempt)),
        'current',(SELECT unlocked_nodes FROM public.champion_enhancements WHERE user_id='${owner.userId}' AND champion_id='Garen'),
        'mastery',(SELECT json_agg(public.mastery_level_from_candies(n) ORDER BY n) FROM unnest(ARRAY[0,49,50,149,150,349,350,699,700,100000]) n),
        'spent',(SELECT count(*) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='spent')
      )); ROLLBACK;`);
    expect(actual.purchases.map((purchase) => [purchase.node_id, purchase.current_rank])).toEqual([
      ['fighter_core_1', 1],
      ['fighter_core_2', 1],
      ['fighter_core_3', 1],
    ]);
    expect(actual.snapshot.Garen).toEqual({ fighter_core_1: 1 });
    expect(actual.current).toEqual({ fighter_core_1: 1, fighter_core_2: 1, fighter_core_3: 1 });
    expect(actual.mastery).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(actual.spent).toBe(3);
  });

  it('rejects missing values, forged IDs, secondary roles, mastery, funds, missing parents and stale/max ranks atomically', () => {
    const cases = [
      {
        label: 'missing_command',
        expression: "public.unlock_champion_enhancement('Garen','fighter_core_1',0,NULL::uuid)",
        expected: 'invalid_enhancement_request',
      },
      {
        label: 'unknown_node',
        expression: unlock('Garen', 'forged_node'),
        expected: 'enhancement_not_in_champion_catalog',
      },
      {
        label: 'secondary_role',
        expression: unlock('Garen', 'tank_core_1'),
        expected: 'enhancement_not_in_champion_catalog',
      },
      {
        label: 'mastery_derived_from_total',
        expression: unlock('Garen', 'fighter_core_2'),
        mastery: 0,
        expected: 'mastery_level_required',
      },
      {
        label: 'funds',
        expression: unlock('Garen', 'fighter_core_1'),
        candies: 0,
        expected: 'insufficient_candies',
      },
      {
        label: 'parent',
        expression: unlock('Garen', 'fighter_core_2'),
        expected: 'enhancement_prerequisite_required:fighter_core_1',
      },
      {
        label: 'stale',
        expression: unlock('Garen', 'fighter_core_1'),
        rank: 1,
        expected: 'enhancement_rank_conflict',
      },
      {
        label: 'max',
        expression: unlock('Garen', 'fighter_core_1', 1),
        rank: 1,
        expected: 'enhancement_max_rank',
      },
    ];
    const actual = result<{
      errors: Record<string, string>;
      spent: number;
      commands: number;
    }>(`BEGIN;
      CREATE TEMP TABLE audit_refusals(label text,error text); GRANT INSERT,SELECT ON audit_refusals TO authenticated;
      ${claims(owner)}
      ${cases
        .map(
          (entry) => `${mastery(owner, 'Garen', entry.mastery ?? 700)}
        UPDATE public.players SET total_candies=${entry.candies ?? 1000} WHERE id='${owner.playerId}';
        INSERT INTO public.champion_enhancements(user_id,champion_id,unlocked_nodes)
        VALUES ('${owner.userId}','Garen',${literal(JSON.stringify(entry.rank ? { fighter_core_1: entry.rank } : {}))}::jsonb)
        ON CONFLICT(user_id,champion_id) DO UPDATE SET unlocked_nodes=EXCLUDED.unlocked_nodes;
        SET LOCAL ROLE authenticated;
        DO $audit$ BEGIN BEGIN PERFORM ${entry.expression}; INSERT INTO audit_refusals VALUES ('${entry.label}','UNEXPECTED_SUCCESS');
        EXCEPTION WHEN OTHERS THEN INSERT INTO audit_refusals VALUES ('${entry.label}',SQLERRM); END; END $audit$;
        RESET ROLE;`,
        )
        .join('\n')}
      SELECT json_build_object('audit',json_build_object(
        'errors',(SELECT json_object_agg(label,error) FROM audit_refusals),
        'spent',(SELECT count(*) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='spent'),
        'commands',(SELECT count(*) FROM public.progression_commands WHERE user_id='${owner.userId}')
      )); ROLLBACK;`);
    expect(actual.errors).toEqual(
      Object.fromEntries(cases.map((entry) => [entry.label, entry.expected])),
    );
    expect(actual.spent).toBe(0);
    expect(actual.commands).toBe(0);
  });

  it('serializes distinct concurrent commands and replays the winner with exactly one ledger debit', async () => {
    const concurrent = await explorerAccount(service, users);
    expect(
      (await service.from('players').update({ total_candies: 100 }).eq('id', concurrent.playerId))
        .error,
    ).toBeNull();
    const requests = [randomUUID(), randomUUID()].map((command) => ({
      p_champion_id: 'Garen',
      p_node_id: 'fighter_core_1',
      p_expected_rank: 0,
      p_command_id: command,
    }));
    const outcomes = await Promise.all(
      requests.map((request) => concurrent.client.rpc('unlock_champion_enhancement', request)),
    );
    const index = outcomes.findIndex((outcome) => !outcome.error);
    expect(outcomes.filter((outcome) => !outcome.error)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.error)[0].error?.message).toBe(
      'enhancement_rank_conflict',
    );
    const replay = await concurrent.client.rpc('unlock_champion_enhancement', requests[index]);
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ current_rank: 1, remaining_candies: 80, replayed: true });
    const reused = await concurrent.client.rpc('unlock_champion_enhancement', {
      ...requests[index],
      p_node_id: 'fighter_core_2',
    });
    expect(reused.error?.message).toBe('idempotency_key_reused');
    const actual = result<{
      balance: number;
      spent: number;
      debited: number;
      commands: number;
    }>(`BEGIN READ ONLY;
      SELECT json_build_object('audit',json_build_object(
        'balance',(SELECT total_candies FROM public.players WHERE id='${concurrent.playerId}'),
        'spent',(SELECT count(*) FROM public.candy_transactions WHERE player_id='${concurrent.playerId}' AND kind='spent'),
        'debited',(SELECT -sum(amount) FROM public.candy_transactions WHERE player_id='${concurrent.playerId}' AND kind='spent'),
        'commands',(SELECT count(*) FROM public.progression_commands WHERE user_id='${concurrent.userId}')
      )); ROLLBACK;`);
    expect(actual).toEqual({ balance: 80, spent: 1, debited: 20, commands: 1 });
  });
});
