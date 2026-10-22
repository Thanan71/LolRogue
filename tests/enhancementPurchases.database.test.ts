import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cleanupExplorer,
  type ExplorerAccount,
  explorerAccount,
  explorerClient,
  explorerSql,
  hasAdminExplorerCredentials,
} from './helpers/adminExplorerFixtures';

const describeDatabase = hasAdminExplorerCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials)
  throw new Error('Enhancement purchases need disposable loopback credentials.');
const claims = (a: ExplorerAccount) =>
  `SELECT set_config('request.jwt.claims','{"sub":"${a.userId}","role":"authenticated"}',TRUE);`;
const json = <T>(sql: string): T =>
  JSON.parse(
    explorerSql(sql)
      .split('\n')
      .find((line) => /^\{"audit"\s*:/.test(line))!,
  ).audit;
const purchase = (champion: string, node: string, revision = 0) =>
  `public.unlock_champion_enhancement_v2('${champion}','${node}',0,${revision},'${randomUUID()}'::uuid)`;

describeDatabase('TREE-02 canonical v4 eligibility and revision purchases', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let owner: ExplorerAccount;
  beforeAll(async () => {
    service = explorerClient('service');
    owner = await explorerAccount(service, users);
  });
  afterAll(async () => cleanupExplorer(service, users));

  it('preserves 72 historical IDs and ranks, disables 12 unsupported nodes and gates 16 extensions', () => {
    const result = json<{
      active: number;
      counts: Record<string, number>;
      disabled: number;
      gated: number;
      retained: number;
    }>(`BEGIN READ ONLY;
      SELECT json_build_object('audit',json_build_object('active',(SELECT version FROM public.progression_rulesets WHERE is_active),
        'counts',(SELECT json_object_agg(ruleset_version,n) FROM (SELECT ruleset_version,count(*) n FROM public.enhancement_node_catalog GROUP BY ruleset_version) c),
        'disabled',(SELECT count(*) FROM public.enhancement_node_catalog WHERE ruleset_version=4 AND NOT active),
        'gated',(SELECT count(*) FROM public.enhancement_node_catalog WHERE ruleset_version=4 AND eligibility->>'gate'='champion_specializations'),
        'retained',(SELECT count(*) FROM public.enhancement_node_catalog a JOIN public.enhancement_node_catalog b USING(node_id)
          WHERE a.ruleset_version=3 AND b.ruleset_version=4 AND a.candy_cost=b.candy_cost AND a.max_rank=b.max_rank
          AND a.required_mastery_level=b.required_mastery_level AND a.prerequisite_node_ids=b.prerequisite_node_ids)
      )); ROLLBACK;`);
    expect(result).toMatchObject({ active: 4, disabled: 12, gated: 16, retained: 72 });
    expect(result.counts).toEqual({ '1': 72, '2': 72, '3': 72, '4': 88 });
  });

  it('rejects unsupported nodes and descendants even when a legacy disabled parent is already owned', () => {
    const result = json<{
      errors: Record<string, string>;
      retained: Record<string, number>;
      spent: number;
    }>(`BEGIN;
      UPDATE public.players SET total_candies=1000 WHERE id='${owner.playerId}';
      INSERT INTO public.champion_mastery(player_id,champion_id,total_candies,mastery_level) VALUES('${owner.playerId}','Garen',700,4);
      INSERT INTO public.champion_enhancements(user_id,champion_id,unlocked_nodes) VALUES('${owner.userId}','Garen','{"fighter_duelist_1":1}');
      CREATE TEMP TABLE refused(id text,error text); GRANT INSERT,SELECT ON refused TO authenticated;
      ${claims(owner)} SET LOCAL ROLE authenticated;
      DO $probe$ DECLARE node text; BEGIN FOREACH node IN ARRAY ARRAY['fighter_duelist_1','fighter_duelist_2','garen_durability_1'] LOOP
        BEGIN PERFORM public.unlock_champion_enhancement_v2('Garen',node,0,0,gen_random_uuid());
        INSERT INTO refused VALUES(node,'UNEXPECTED_SUCCESS'); EXCEPTION WHEN OTHERS THEN INSERT INTO refused VALUES(node,SQLERRM); END;
      END LOOP; END $probe$; RESET ROLE;
      SELECT json_build_object('audit',json_build_object('errors',(SELECT json_object_agg(id,error) FROM refused),
        'retained',(SELECT unlocked_nodes FROM public.champion_enhancements WHERE user_id='${owner.userId}' AND champion_id='Garen'),
        'spent',(SELECT count(*) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='spent'))); ROLLBACK;`);
    expect(result.errors).toEqual({
      fighter_duelist_1: 'enhancement_not_in_champion_catalog',
      fighter_duelist_2: 'enhancement_requirement_required',
      garen_durability_1: 'enhancement_feature_disabled',
    });
    expect(result.retained).toEqual({ fighter_duelist_1: 1 });
    expect(result.spent).toBe(0);
  });

  it('enforces declarative OR, exclusions, aggregate budget and champion identity on altered clients', () => {
    const result = json<{ errors: Record<string, string>; success: boolean }>(`BEGIN;
      UPDATE public.players SET total_candies=1000 WHERE id='${owner.playerId}';
      INSERT INTO public.champion_mastery(player_id,champion_id,total_candies,mastery_level) VALUES('${owner.playerId}','Garen',700,4);
      INSERT INTO public.champion_enhancements(user_id,champion_id,unlocked_nodes,total_candies_spent)
        VALUES('${owner.userId}','Garen','{"fighter_core_1":1}',20);
      UPDATE private.enhancement_contract_settings SET champion_specializations_enabled=TRUE;
      UPDATE public.enhancement_node_catalog SET eligibility='{"schemaVersion":1,"requirement":{"kind":"or","conditions":[{"kind":"node","nodeId":"fighter_core_1"},{"kind":"node","nodeId":"fighter_core_2"}]},"exclusiveWith":["fighter_bruiser_1"],"budget":60}'
        WHERE ruleset_version=4 AND node_id='fighter_core_3';
      CREATE TEMP TABLE refused(id text,error text); GRANT INSERT,SELECT ON refused TO authenticated;
      ${claims(owner)} SET LOCAL ROLE authenticated;
      SELECT ${purchase('Garen', 'fighter_core_3')}; RESET ROLE;
      UPDATE public.champion_enhancements SET unlocked_nodes='{"fighter_core_1":1,"fighter_bruiser_1":1}',total_candies_spent=70 WHERE user_id='${owner.userId}';
      SET LOCAL ROLE authenticated; DO $probe$ BEGIN BEGIN PERFORM ${purchase('Garen', 'fighter_core_3', 1)};
        EXCEPTION WHEN OTHERS THEN INSERT INTO refused VALUES('exclusive',SQLERRM); END; END $probe$; RESET ROLE;
      UPDATE public.champion_enhancements SET unlocked_nodes='{"fighter_core_1":1}',total_candies_spent=70 WHERE user_id='${owner.userId}';
      SET LOCAL ROLE authenticated; DO $probe$ BEGIN BEGIN PERFORM ${purchase('Garen', 'fighter_core_3', 1)};
        EXCEPTION WHEN OTHERS THEN INSERT INTO refused VALUES('budget',SQLERRM); END;
        BEGIN PERFORM ${purchase('Garen', 'annie_burst_1', 1)};
        EXCEPTION WHEN OTHERS THEN INSERT INTO refused VALUES('champion',SQLERRM); END; END $probe$; RESET ROLE;
      SELECT json_build_object('audit',json_build_object('errors',(SELECT json_object_agg(id,error) FROM refused),
        'success',(SELECT count(*)=1 FROM public.progression_commands WHERE user_id='${owner.userId}'))); ROLLBACK;`);
    expect(result).toEqual({
      errors: {
        exclusive: 'enhancement_exclusive_conflict',
        budget: 'enhancement_budget_exceeded',
        champion: 'enhancement_not_in_champion_catalog',
      },
      success: true,
    });
  });

  it('rejects an actual anonymous Auth user and anonymous API grants rather than trusting user metadata', () => {
    const result = json<{ error: string; anon: boolean; service: boolean }>(`BEGIN;
      UPDATE auth.users SET is_anonymous=TRUE WHERE id='${owner.userId}';
      CREATE TEMP TABLE refused(error text); GRANT INSERT,SELECT ON refused TO authenticated;
      ${claims(owner)} SET LOCAL ROLE authenticated;
      DO $probe$ BEGIN BEGIN PERFORM ${purchase('Garen', 'fighter_core_1')}; EXCEPTION WHEN OTHERS THEN INSERT INTO refused VALUES(SQLERRM); END; END $probe$;
      RESET ROLE; SELECT json_build_object('audit',json_build_object('error',(SELECT error FROM refused),
        'anon',has_function_privilege('anon','public.unlock_champion_enhancement_v2(text,text,integer,integer,uuid)','EXECUTE'),
        'service',has_function_privilege('service_role','public.unlock_champion_enhancement_v2(text,text,integer,integer,uuid)','EXECUTE'))); ROLLBACK;`);
    expect(result).toEqual({ error: 'registered_account_required', anon: false, service: false });
  });

  it('serializes simultaneous purchases of different roots with the same stale revision', async () => {
    const a = await explorerAccount(service, users);
    explorerSql(
      `UPDATE public.players SET total_candies=1000 WHERE id='${a.playerId}'; INSERT INTO public.champion_mastery(player_id,champion_id,total_candies,mastery_level) VALUES('${a.playerId}','Garen',700,4);`,
    );
    const requests = ['fighter_core_1', 'fighter_bruiser_1'].map((node) => ({
      p_champion_id: 'Garen',
      p_node_id: node,
      p_expected_rank: 0,
      p_expected_revision: 0,
      p_command_id: randomUUID(),
    }));
    const outcomes = await Promise.all(
      requests.map((request) => a.client.rpc('unlock_champion_enhancement_v2', request)),
    );
    expect(outcomes.filter((r) => !r.error)).toHaveLength(1);
    expect(outcomes.find((r) => r.error)?.error?.message).toBe('enhancement_revision_conflict');
    const index = outcomes.findIndex((r) => !r.error);
    const winner = outcomes[index].data;
    const replay = await a.client.rpc('unlock_champion_enhancement_v2', requests[index]);
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({
      revision: 1,
      replayed: true,
      remaining_candies: winner.remaining_candies,
    });
    const rows = await service
      .from('candy_transactions')
      .select('amount')
      .eq('player_id', a.playerId)
      .eq('kind', 'spent');
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([{ amount: -winner.candy_cost }]);
  });
});
