import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnhancementContractForChampion } from '@/game/enhancements/catalog';
import { previewEnhancementPurchase } from '@/game/enhancements/eligibility';
import type { EnhancementRequirement } from '@/types/enhancementTree';
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
  throw new Error('Enhancement resets need disposable loopback credentials.');
const claims = (a: ExplorerAccount) =>
  `SELECT set_config('request.jwt.claims','{"sub":"${a.userId}","role":"authenticated"}',TRUE);`;
const json = <T>(sql: string): T =>
  JSON.parse(
    explorerSql(sql)
      .split('\n')
      .find((line) => /^\{"audit"\s*:/.test(line))!,
  ).audit;
const buy = (revision = 0) =>
  `public.unlock_champion_enhancement_v2('Garen','fighter_core_1',0,${revision},'${randomUUID()}'::uuid,4)`;
const reset = (revision: number, command = randomUUID(), policy = 1) =>
  `public.reset_champion_enhancements('Garen',${revision},'${command}'::uuid,${policy})`;
const seed = (
  a: ExplorerAccount,
) => `UPDATE public.players SET total_candies=100 WHERE id='${a.playerId}';
  INSERT INTO public.champion_mastery(player_id,champion_id,total_candies,mastery_level) VALUES('${a.playerId}','Garen',700,4);`;

describeDatabase('TREE-07 attested and atomic free tree resets', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let owner: ExplorerAccount;
  beforeAll(async () => {
    service = explorerClient('service');
    owner = await explorerAccount(service, users);
  });
  afterAll(async () => cleanupExplorer(service, users));

  it('returns a read-only empty preview without creating a tree or a command', () => {
    const result = json<{
      preview: { eligible: boolean; reason: string; refund_amount: number };
      rows: number;
      commands: number;
    }>(`BEGIN;${claims(owner)}
      SET LOCAL ROLE authenticated; SELECT public.get_enhancement_reset_preview('Garen'); RESET ROLE;
      SELECT json_build_object('audit',json_build_object('preview',public.get_enhancement_reset_preview('Garen'),
        'rows',(SELECT count(*) FROM public.champion_enhancements WHERE user_id='${owner.userId}'),
        'commands',(SELECT count(*) FROM public.progression_commands WHERE user_id='${owner.userId}')));ROLLBACK;`);
    expect(result.preview).toMatchObject({
      eligible: false,
      reason: 'tree_empty',
      refund_amount: 0,
    });
    expect(result.rows).toBe(0);
    expect(result.commands).toBe(0);
  });

  it('refunds actual debits over repeated free resets and leaves all other profile and mastery values unchanged', () => {
    const result = json<{
      before: unknown;
      after: unknown;
      quotes: { fee_amount: number; refund_amount: number }[];
      balance: number;
      spent: number;
      refunded: number;
      mastery: number;
      resets: number;
    }>(`BEGIN;${seed(owner)}
      CREATE TEMP TABLE audit_before AS SELECT to_jsonb(p)-'total_candies'-'updated_at' profile FROM public.players p WHERE id='${owner.playerId}';
      CREATE TEMP TABLE quotes(q jsonb);GRANT INSERT,SELECT ON quotes TO authenticated;${claims(owner)} SET LOCAL ROLE authenticated;
      SELECT ${buy(0)};INSERT INTO quotes SELECT public.get_enhancement_reset_preview('Garen');SELECT ${reset(1)};
      SELECT ${buy(2)};INSERT INTO quotes SELECT public.get_enhancement_reset_preview('Garen');SELECT ${reset(3)};RESET ROLE;
      SELECT json_build_object('audit',json_build_object('before',(SELECT profile FROM audit_before),
        'after',(SELECT to_jsonb(p)-'total_candies'-'updated_at' FROM public.players p WHERE id='${owner.playerId}'),
        'quotes',(SELECT json_agg(q) FROM quotes),'balance',(SELECT total_candies FROM public.players WHERE id='${owner.playerId}'),
        'spent',(SELECT -sum(amount) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='spent'),
        'refunded',(SELECT sum(amount) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='refunded'),
        'mastery',(SELECT total_candies FROM public.champion_mastery WHERE player_id='${owner.playerId}' AND champion_id='Garen'),
        'resets',(SELECT reset_count FROM public.champion_enhancements WHERE user_id='${owner.userId}' AND champion_id='Garen')));ROLLBACK;`);
    expect(result.before).toEqual(result.after);
    expect(result.balance).toBe(100);
    expect(result.spent).toBe(40);
    expect(result.refunded).toBe(40);
    expect(result.mastery).toBe(700);
    expect(result.resets).toBe(2);
    expect(result.quotes).toHaveLength(2);
    for (const quote of result.quotes)
      expect(quote).toMatchObject({ fee_amount: 0, refund_amount: 20 });
  });

  it('refunds one real legacy pre-ledger purchase, without minting from a forged historical totalSpent', () => {
    const command = randomUUID();
    const result = json<{
      quote: { eligible: boolean; actual_spend: number; refund_amount: number };
      balance: number;
      spentRows: number;
      refunds: number;
    }>(`BEGIN;${seed(owner)}${claims(owner)}
      UPDATE public.progression_rulesets SET is_active=FALSE WHERE is_active;UPDATE public.progression_rulesets SET is_active=TRUE WHERE version=3;
      SELECT private.unlock_champion_enhancement_pre_candy_ledger('Garen','fighter_core_1',0,'${command}'::uuid);
      UPDATE public.progression_commands SET created_at=(SELECT started_at-interval '1 day' FROM public.candy_ledger_settings WHERE singleton),
        completed_at=(SELECT started_at-interval '1 day' FROM public.candy_ledger_settings WHERE singleton)
        WHERE user_id='${owner.userId}' AND command_id='${command}';
      UPDATE public.champion_enhancements SET total_candies_spent=100000 WHERE user_id='${owner.userId}';
      UPDATE public.progression_rulesets SET is_active=FALSE WHERE is_active;UPDATE public.progression_rulesets SET is_active=TRUE WHERE version=4;
      CREATE TEMP TABLE quote AS SELECT public.get_enhancement_reset_preview('Garen') q;
      SET LOCAL ROLE authenticated;SELECT ${reset(0)};RESET ROLE;
      SELECT json_build_object('audit',json_build_object('quote',(SELECT q FROM quote),
        'balance',(SELECT total_candies FROM public.players WHERE id='${owner.playerId}'),
        'spentRows',(SELECT count(*) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='spent'),
        'refunds',(SELECT sum(amount) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='refunded')));ROLLBACK;`);
    expect(result.quote).toMatchObject({ eligible: true, actual_spend: 20, refund_amount: 20 });
    expect(result.balance).toBe(100);
    expect(result.spentRows).toBe(0);
    expect(result.refunds).toBe(20);
  });

  it('preserves unattested legacy ranks and exposes a support reason instead of deleting or refunding them', () => {
    const result = json<{
      quote: {
        eligible: boolean;
        history_unavailable: boolean;
        reason: string;
        refund_amount: number;
      };
      owned: unknown;
      error: string;
      balance: number;
      refunds: number;
    }>(`BEGIN;${seed(owner)}
      INSERT INTO public.champion_enhancements(user_id,champion_id,unlocked_nodes,total_candies_spent)VALUES('${owner.userId}','Garen','{"fighter_core_1":1}',100000);
      ${claims(owner)}CREATE TEMP TABLE quote AS SELECT public.get_enhancement_reset_preview('Garen') q;
      CREATE TEMP TABLE refused(error text);GRANT INSERT,SELECT ON refused TO authenticated;SET LOCAL ROLE authenticated;
      DO $probe$ BEGIN BEGIN PERFORM ${reset(0)};EXCEPTION WHEN OTHERS THEN INSERT INTO refused VALUES(SQLERRM);END;END $probe$;RESET ROLE;
      SELECT json_build_object('audit',json_build_object('quote',(SELECT q FROM quote),'error',(SELECT error FROM refused),
        'owned',(SELECT unlocked_nodes FROM public.champion_enhancements WHERE user_id='${owner.userId}' AND champion_id='Garen'),
        'balance',(SELECT total_candies FROM public.players WHERE id='${owner.playerId}'),
        'refunds',(SELECT count(*) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='refunded')));ROLLBACK;`);
    expect(result.quote).toMatchObject({
      eligible: false,
      history_unavailable: true,
      reason: 'history_unavailable',
      refund_amount: 0,
    });
    expect(result.owned).toEqual({ fighter_core_1: 1 });
    expect(result.error).toBe('enhancement_reset_ineligible:history_unavailable');
    expect(result.balance).toBe(100);
    expect(result.refunds).toBe(0);
  });

  it('retains an active run snapshot while clearing the current owned tree', () => {
    const result = json<{
      snapshot: Record<string, unknown>;
      owned: unknown;
    }>(`BEGIN;${seed(owner)}${claims(owner)}SET LOCAL ROLE authenticated;
      SELECT ${buy()};SELECT public.start_run_attempt('${randomUUID()}'::uuid,ARRAY['Garen'],ARRAY[]::text[],'normal','normal');SELECT ${reset(1)};RESET ROLE;
      SELECT json_build_object('audit',json_build_object('snapshot',(SELECT enhancement_snapshot FROM public.run_attempts WHERE user_id='${owner.userId}'),
        'owned',(SELECT unlocked_nodes FROM public.champion_enhancements WHERE user_id='${owner.userId}' AND champion_id='Garen')));ROLLBACK;`);
    expect(result.snapshot.Garen).toEqual({ fighter_core_1: 1 });
    expect(result.owned).toEqual({});
  });

  it('refuses a stale catalogue or reset policy before any debit and exempts disabled-node compensation from hypothetical fees', () => {
    const result = json<{
      errors: Record<string, string>;
      quote: { fee_amount: number; fee_exempt: boolean; refund_amount: number };
      commands: number;
    }>(`BEGIN;${seed(owner)}${claims(owner)}
      CREATE TEMP TABLE refused(kind text,error text);GRANT INSERT,SELECT ON refused TO authenticated;SET LOCAL ROLE authenticated;
      DO $probe$ BEGIN BEGIN PERFORM public.unlock_champion_enhancement_v2('Garen','fighter_core_1',0,0,gen_random_uuid(),3);
        EXCEPTION WHEN OTHERS THEN INSERT INTO refused VALUES('catalog',SQLERRM);END;END $probe$;
      SELECT ${buy(0)};SELECT ${reset(1)};SELECT ${buy(2)};RESET ROLE;
      UPDATE private.enhancement_contract_settings SET repeat_reset_fee_basis_points=1000,reset_policy_version=2;
      UPDATE public.enhancement_node_catalog SET active=FALSE WHERE ruleset_version=4 AND node_id='fighter_core_1';
      SET LOCAL ROLE authenticated;DO $probe$ BEGIN BEGIN PERFORM ${reset(3)};
        EXCEPTION WHEN OTHERS THEN INSERT INTO refused VALUES('policy',SQLERRM);END;END $probe$;RESET ROLE;
      SELECT json_build_object('audit',json_build_object('errors',(SELECT json_object_agg(kind,error)FROM refused),
        'quote',public.get_enhancement_reset_preview('Garen'),'commands',(SELECT count(*)FROM public.progression_commands WHERE user_id='${owner.userId}')));ROLLBACK;`);
    expect(result.errors).toEqual({
      catalog: 'enhancement_catalog_conflict',
      policy: 'enhancement_reset_policy_conflict',
    });
    expect(result.quote).toMatchObject({ fee_amount: 0, fee_exempt: true, refund_amount: 20 });
    expect(result.commands).toBe(3);
  });

  it.each([true, false])(
    'refunds once under simultaneous %s same-command double clicks',
    async (same) => {
      const a = await explorerAccount(service, users);
      explorerSql(seed(a));
      const purchased = await a.client.rpc('unlock_champion_enhancement_v2', {
        p_champion_id: 'Garen',
        p_node_id: 'fighter_core_1',
        p_expected_rank: 0,
        p_expected_revision: 0,
        p_command_id: randomUUID(),
        p_expected_catalog_version: 4,
      });
      expect(purchased.error).toBeNull();
      const command = randomUUID();
      const requests = [command, same ? command : randomUUID()].map((id) => ({
        p_champion_id: 'Garen',
        p_expected_revision: 1,
        p_command_id: id,
        p_expected_policy_version: 1,
      }));
      const results = await Promise.all(
        requests.map((request) => a.client.rpc('reset_champion_enhancements', request)),
      );
      expect(results.filter((r) => !r.error)).toHaveLength(same ? 2 : 1);
      if (!same)
        expect(results.find((r) => r.error)?.error?.message).toBe('enhancement_revision_conflict');
      const rows = await service
        .from('candy_transactions')
        .select('amount')
        .eq('player_id', a.playerId)
        .eq('kind', 'refunded');
      expect(rows.error).toBeNull();
      expect(rows.data).toEqual([{ amount: 20 }]);
    },
  );

  it('serializes a purchase against a reset without a lost rank or duplicate refund', async () => {
    const a = await explorerAccount(service, users);
    explorerSql(seed(a));
    expect(
      (
        await a.client.rpc('unlock_champion_enhancement_v2', {
          p_champion_id: 'Garen',
          p_node_id: 'fighter_core_1',
          p_expected_rank: 0,
          p_expected_revision: 0,
          p_command_id: randomUUID(),
          p_expected_catalog_version: 4,
        })
      ).error,
    ).toBeNull();
    const outcomes = await Promise.all([
      a.client.rpc('reset_champion_enhancements', {
        p_champion_id: 'Garen',
        p_expected_revision: 1,
        p_command_id: randomUUID(),
        p_expected_policy_version: 1,
      }),
      a.client.rpc('unlock_champion_enhancement_v2', {
        p_champion_id: 'Garen',
        p_node_id: 'fighter_bruiser_1',
        p_expected_rank: 0,
        p_expected_revision: 1,
        p_command_id: randomUUID(),
        p_expected_catalog_version: 4,
      }),
    ]);
    expect(outcomes.filter((r) => !r.error)).toHaveLength(1);
    expect(outcomes.find((r) => r.error)?.error?.message).toBe('enhancement_revision_conflict');
    const quote = await a.client.rpc('get_enhancement_reset_preview', { p_champion_id: 'Garen' });
    expect(quote.error).toBeNull();
    if (quote.data.eligible)
      expect(
        (
          await a.client.rpc('reset_champion_enhancements', {
            p_champion_id: 'Garen',
            p_expected_revision: quote.data.revision,
            p_command_id: randomUUID(),
            p_expected_policy_version: quote.data.policy_version,
          })
        ).error,
      ).toBeNull();
    const balance = await service
      .from('players')
      .select('total_candies')
      .eq('id', a.playerId)
      .single();
    expect(balance.data?.total_candies).toBe(100);
    const ledger = await service
      .from('candy_transactions')
      .select('amount')
      .eq('player_id', a.playerId)
      .in('kind', ['spent', 'refunded']);
    expect(ledger.error).toBeNull();
    expect(ledger.data!.reduce((sum, row) => sum + row.amount, 0)).toBe(0);
  });

  it('uses the pure eligibility oracle for absent/zero/over-cap parents, OR, AND, mastery and both exclusion directions', () => {
    const leaf = (nodeId: string): EnhancementRequirement => ({ kind: 'node', nodeId });
    const scenarios: {
      id: string;
      owned: Record<string, number>;
      requirement: EnhancementRequirement;
      mastery?: number;
    }[] = [
      { id: 'absent', owned: {}, requirement: leaf('fighter_core_1') },
      { id: 'zero', owned: { fighter_core_1: 0 }, requirement: leaf('fighter_core_1') },
      { id: 'over_cap', owned: { fighter_core_1: 2 }, requirement: leaf('fighter_core_1') },
      {
        id: 'or_none',
        owned: {},
        requirement: { kind: 'or', conditions: [leaf('fighter_core_1'), leaf('fighter_core_2')] },
      },
      {
        id: 'or_one',
        owned: { fighter_core_1: 1 },
        requirement: { kind: 'or', conditions: [leaf('fighter_core_1'), leaf('fighter_core_2')] },
      },
      {
        id: 'and_partial',
        owned: { fighter_core_1: 1 },
        requirement: {
          kind: 'and',
          conditions: [leaf('fighter_core_1'), leaf('fighter_bruiser_1')],
        },
      },
      {
        id: 'parent_mastery',
        owned: { fighter_core_1: 1, fighter_core_2: 1 },
        requirement: leaf('fighter_core_2'),
        mastery: 0,
      },
      {
        id: 'exclusive_left',
        owned: { garen_durability_1: 1, garen_execution_1: 1 },
        requirement: leaf('garen_durability_1'),
      },
      {
        id: 'exclusive_right',
        owned: { garen_durability_1: 1, garen_execution_1: 1 },
        requirement: leaf('garen_execution_1'),
      },
    ];
    const expected = scenarios.map((s) => {
      const original = getEnhancementContractForChampion({
        id: 'Garen',
        tags: ['Fighter', 'Tank'],
      });
      const contract = {
        ...original,
        nodes: original.nodes.map((n) =>
          n.id === 'fighter_core_3'
            ? { ...n, requiredMasteryLevel: 0, requirement: s.requirement }
            : n,
        ),
      };
      return {
        id: s.id,
        allowed: previewEnhancementPurchase(
          contract.nodes.find((n) => n.id === 'fighter_core_3')!,
          {
            contract,
            unlockedNodes: s.owned,
            totalCandiesSpent: 0,
            masteryLevel: s.mastery ?? 4,
            availableCandies: 100,
            enabledGates: ['champion_specializations'],
          },
        ).eligible,
      };
    });
    const results = json<
      {
        id: string;
        allowed: boolean;
        beforeBalance: number;
        afterBalance: number;
        beforeCommands: number;
        afterCommands: number;
        beforeLedger: number;
        afterLedger: number;
      }[]
    >(`BEGIN;${seed(owner)}
      CREATE TEMP TABLE cases(id text,allowed boolean,before_balance int,after_balance int,before_commands bigint,after_commands bigint,before_ledger bigint,after_ledger bigint);
      GRANT UPDATE,SELECT ON cases TO authenticated;${claims(owner)}
      ${scenarios
        .map(
          (s) => `UPDATE public.players SET total_candies=100 WHERE id='${owner.playerId}';
        UPDATE public.champion_mastery SET total_candies=${s.mastery === 0 ? 0 : 700} WHERE player_id='${owner.playerId}' AND champion_id='Garen';
        INSERT INTO public.champion_enhancements(user_id,champion_id,unlocked_nodes) VALUES('${owner.userId}','Garen','${JSON.stringify(s.owned)}')
          ON CONFLICT(user_id,champion_id) DO UPDATE SET unlocked_nodes=EXCLUDED.unlocked_nodes,revision=0,total_candies_spent=0;
        UPDATE public.enhancement_node_catalog SET required_mastery_level=0,eligibility='${JSON.stringify({ schemaVersion: 1, requirement: s.requirement, exclusiveWith: [], budget: null })}'
          WHERE ruleset_version=4 AND node_id='fighter_core_3';
        INSERT INTO cases(id,before_balance,before_commands,before_ledger)SELECT '${s.id}',100,
          (SELECT count(*)FROM public.progression_commands WHERE user_id='${owner.userId}'),
          (SELECT count(*)FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='spent');
        SET LOCAL ROLE authenticated;DO $probe$ BEGIN BEGIN PERFORM public.unlock_champion_enhancement_v2('Garen','fighter_core_3',0,0,gen_random_uuid(),4);
          UPDATE cases SET allowed=TRUE WHERE id='${s.id}';EXCEPTION WHEN OTHERS THEN UPDATE cases SET allowed=FALSE WHERE id='${s.id}';END;END $probe$;RESET ROLE;
        UPDATE cases SET after_balance=(SELECT total_candies FROM public.players WHERE id='${owner.playerId}'),
          after_commands=(SELECT count(*)FROM public.progression_commands WHERE user_id='${owner.userId}'),
          after_ledger=(SELECT count(*)FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='spent') WHERE id='${s.id}';`,
        )
        .join('\n')}
      SELECT json_build_object('audit',(SELECT json_agg(json_build_object('id',id,'allowed',allowed,'beforeBalance',before_balance,'afterBalance',after_balance,
        'beforeCommands',before_commands,'afterCommands',after_commands,'beforeLedger',before_ledger,'afterLedger',after_ledger)ORDER BY id)FROM cases));ROLLBACK;`);
    expect(results.map((r) => ({ id: r.id, allowed: r.allowed }))).toEqual(
      expected.sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(results.filter((r) => r.allowed).map((r) => r.id)).toEqual(['or_one']);
    for (const row of results.filter((r) => !r.allowed)) {
      expect(row.afterBalance).toBe(row.beforeBalance);
      expect(row.afterCommands).toBe(row.beforeCommands);
      expect(row.afterLedger).toBe(row.beforeLedger);
    }
  });
});
