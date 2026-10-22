import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getEnhancementContractForChampion } from '@/game/enhancements/catalog';
import { getActiveEnhancementRanks } from '@/game/enhancements/eligibility';
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
  throw new Error('Enhancement authority tests need disposable loopback credentials.');
const claims = (a: ExplorerAccount) =>
  `SELECT set_config('request.jwt.claims','{"sub":"${a.userId}","role":"authenticated"}',TRUE);`;
const sqlJson = (value: unknown) => `'${JSON.stringify(value).split("'").join("''")}'::jsonb`;
const audit = <T>(sql: string): T =>
  JSON.parse(
    explorerSql(sql)
      .split('\n')
      .find((line) => /^\{"audit"\s*:/.test(line))!,
  ).audit;
const start = () =>
  `public.start_run_attempt('${randomUUID()}'::uuid,ARRAY['Garen'],ARRAY[]::text[],'normal','normal')`;
const seed = (
  a: ExplorerAccount,
  mastery = 4,
) => `UPDATE public.players SET total_candies=100 WHERE id='${a.playerId}';
  INSERT INTO public.champion_mastery(player_id,champion_id,total_candies,mastery_level)
    VALUES('${a.playerId}','Garen',700,${mastery});`;
const storedSnapshot = (user: string) =>
  `(SELECT enhancement_snapshot FROM public.run_attempts WHERE user_id='${user}')`;
const startedId = `(SELECT (payload->>'attempt_id')::uuid FROM started)`;
const token = `(SELECT (payload->>'lease_token')::uuid FROM claimed)`;
function finishAndClaim() {
  return `SELECT public.append_run_attempt_commands(${startedId},jsonb_build_array(jsonb_build_object(
    'command_id',gen_random_uuid(),'sequence',1,'kind','abandon_run','payload','{}'::jsonb)));
    SELECT public.seal_run_attempt(${startedId},gen_random_uuid(),1);
    CREATE TEMP TABLE claimed AS SELECT public.claim_run_verification(${startedId},gen_random_uuid()) payload;`;
}
function member(champion: string, waves: number, biomes: string[]) {
  return {
    champion_id: champion,
    final_level: 2,
    final_hp: 100,
    waves_participated: waves,
    biomes_participated: biomes,
    kills: 0,
    assists: 0,
    damage_dealt: 0,
    damage_to_shields: 0,
    damage_received: 0,
    healing_done: 0,
    healing_received: 0,
    overhealing: 0,
    shielding_done: 0,
    shielding_absorbed: 0,
    deaths: 0,
    items_collected: [],
  };
}
function result() {
  const members = [member('Garen', 6, ['top_lane', 'jungle']), member('Lux', 1, ['jungle'])];
  return {
    verified: true,
    won: false,
    run_level: 2,
    waves_completed: 6,
    biomes_visited: ['top_lane', 'jungle'],
    gold_earned: 0,
    gold_spent: 0,
    gold_balance: 0,
    augment_ids: [],
    team_members: members,
    ledger: {
      version: 2,
      champions: Object.fromEntries(
        members.map(
          ({
            champion_id,
            final_hp: _hp,
            final_level: _level,
            items_collected: _items,
            ...rest
          }) => [champion_id, rest],
        ),
      ),
      gold: { earned: 0, spent: 0 },
      items: [],
      next_item_event_sequence: 1,
    },
  };
}

describeDatabase('TREE-04 catalogue 4 frozen authority and reward compatibility', () => {
  let service: SupabaseClient;
  let owner: ExplorerAccount;
  const users: string[] = [];
  beforeAll(async () => {
    service = explorerClient('service');
    owner = await explorerAccount(service, users);
  });
  afterAll(async () => cleanupExplorer(service, users));

  it('publishes one exact gameplay/Daily pair while keeping helpers inaccessible and specialization purchases gated', () => {
    const out = audit<{
      identity: object;
      daily: object;
      progression: number;
      gate: boolean;
      helpers: boolean[];
    }>(`SELECT json_build_object('audit',json_build_object(
      'identity',(SELECT to_jsonb(g)-'created_at'-'content_hash' FROM public.gameplay_rulesets g WHERE is_active),
      'daily',(SELECT json_build_object('version',version,'gameplay',gameplay_ruleset_version,'score',score_version,'gold',gold_points) FROM public.daily_challenge_rulesets WHERE is_active),
      'progression',(SELECT version FROM public.progression_rulesets WHERE is_active),
      'gate',(SELECT champion_specializations_enabled FROM private.enhancement_contract_settings WHERE singleton),
      'helpers',(SELECT json_agg(has_function_privilege(r,fn,'EXECUTE')) FROM unnest(ARRAY['anon','authenticated','service_role'])r
        CROSS JOIN unnest(ARRAY['private.active_enhancement_snapshot(jsonb,jsonb,smallint)',
          'public.freeze_run_attempt_enhancements_v25()',
          'private.complete_run_verification_before_trees(uuid,uuid,jsonb,text)',
          'public.complete_run_verification_pre_champion_economy(uuid,uuid,jsonb,text)']) fn)));`);
    expect(out.identity).toMatchObject({
      version: 25,
      engine_version: 'run-engine-0.3.0',
      code: '0.3.0',
      command_schema_version: 2,
    });
    expect(out.daily).toEqual({ version: 25, gameplay: 25, score: 15, gold: 0 });
    expect(out.progression).toBe(4);
    expect(out.gate).toBe(false);
    expect(out.helpers).toHaveLength(12);
    expect(out.helpers.every((allowed) => !allowed)).toBe(true);
  });

  it('matches the pure active-rank oracle for disabled ancestors, mastery, caps and both exclusive paths', () => {
    const states: { mastery: number; ranks: Record<string, number> }[] = [
      {
        mastery: 4,
        ranks: {
          fighter_core_1: 1,
          fighter_core_2: 1,
          fighter_duelist_1: 1,
          fighter_duelist_2: 1,
          mage_core_1: 1,
          unknown_node: 1,
        },
      },
      { mastery: 0, ranks: { fighter_core_1: 1, fighter_core_2: 1, garen_durability_1: 1 } },
      { mastery: 4, ranks: { fighter_core_1: 2, fighter_core_2: 1 } },
      { mastery: 4, ranks: { garen_durability_1: 1, garen_durability_2: 1 } },
      { mastery: 4, ranks: { garen_durability_1: 1, garen_execution_1: 1, garen_execution_2: 1 } },
      { mastery: 4, ranks: { garen_durability_2: 1 } },
    ];
    const actual = audit<
      Record<string, Record<string, number>>[]
    >(`SELECT json_build_object('audit',json_build_array(
      ${states.map(({ mastery, ranks }) => `private.active_enhancement_snapshot(${sqlJson({ Garen: ranks })},${sqlJson({ Garen: mastery })},4::smallint)`).join(',')}));`);
    for (const [index, { mastery, ranks }] of states.entries()) {
      expect(actual[index].Garen).toEqual(
        getActiveEnhancementRanks(
          getEnhancementContractForChampion({ id: 'Garen', tags: ['Fighter'] }),
          { unlockedNodes: ranks, totalCandiesSpent: 0 },
          { masteryLevel: mastery, enabledGates: ['champion_specializations'] },
        ),
      );
    }
  });

  it('returns the actually filtered start snapshot, hashes it after frozen mastery, and preserves account history', () => {
    const ranks = {
      fighter_core_1: 1,
      fighter_core_2: 1,
      fighter_duelist_1: 1,
      fighter_duelist_2: 1,
      garen_durability_1: 1,
    };
    const out = audit<{
      response: { enhancement_snapshot: object };
      snapshot: { Garen: object };
      owned: object;
      hashMatches: boolean;
      mastery: number;
    }>(`BEGIN;${seed(owner)}
      INSERT INTO public.champion_enhancements(user_id,champion_id,unlocked_nodes)VALUES('${owner.userId}','Garen',${sqlJson(ranks)});${claims(owner)}
      CREATE TEMP TABLE started(payload jsonb);GRANT SELECT,INSERT ON started TO authenticated;
      SET LOCAL ROLE authenticated;INSERT INTO started SELECT ${start()};RESET ROLE;
      SELECT json_build_object('audit',json_build_object('response',(SELECT payload FROM started),'snapshot',${storedSnapshot(owner.userId)},
        'owned',(SELECT unlocked_nodes FROM public.champion_enhancements WHERE user_id='${owner.userId}'),
        'mastery',(SELECT (mastery_snapshot->>'Garen')::integer FROM public.run_attempts WHERE user_id='${owner.userId}'),
        'hashMatches',(SELECT journal_hash=encode(extensions.digest(convert_to(jsonb_build_object(
          'attempt_id',id,'ruleset_version',ruleset_version,'gameplay_ruleset_version',gameplay_ruleset_version,
          'engine_version',engine_version,'seed',seed,'mode',mode,'difficulty',difficulty,
          'initial_team',to_jsonb(initial_team),'rune_ids',to_jsonb(rune_ids),
          'enhancement_snapshot',enhancement_snapshot,'mastery_snapshot',mastery_snapshot)::text,'UTF8'),'sha256'),'hex')
          FROM public.run_attempts WHERE user_id='${owner.userId}')));ROLLBACK;`);
    expect(out.snapshot.Garen).toEqual({
      fighter_core_1: 1,
      fighter_core_2: 1,
      garen_durability_1: 1,
    });
    expect(out.response.enhancement_snapshot).toEqual(out.snapshot);
    expect(out.owned).toEqual(ranks);
    expect(out.hashMatches).toBe(true);
    expect(out.mastery).toBe(4);
  });

  it('uses frozen stored mastery rather than recomputing it, and leaves legacy 0.2.5 snapshots unchanged', () => {
    const ranks = {
      fighter_core_1: 1,
      fighter_core_2: 1,
      fighter_duelist_1: 1,
      fighter_duelist_2: 1,
    };
    const out = audit<{
      current: { Garen: object };
      legacy: { Garen: object };
    }>(`BEGIN;${seed(owner, 0)}
      INSERT INTO public.champion_enhancements(user_id,champion_id,unlocked_nodes)VALUES('${owner.userId}','Garen',${sqlJson(ranks)});${claims(owner)}
      CREATE TEMP TABLE started AS SELECT ${start()} payload;
      CREATE TEMP TABLE current_snapshot AS SELECT enhancement_snapshot FROM public.run_attempts WHERE user_id='${owner.userId}';
      UPDATE public.run_attempts SET status='expired',expired_at=clock_timestamp() WHERE user_id='${owner.userId}';
      UPDATE public.gameplay_rulesets SET is_active=FALSE WHERE is_active;UPDATE public.gameplay_rulesets SET is_active=TRUE WHERE version=24;
      UPDATE public.progression_rulesets SET is_active=FALSE WHERE is_active;UPDATE public.progression_rulesets SET is_active=TRUE WHERE version=3;
      UPDATE public.champion_economy_config SET gameplay_ruleset_version=24 WHERE singleton;
      SELECT ${start()};
      SELECT json_build_object('audit',json_build_object('current',(SELECT enhancement_snapshot FROM current_snapshot),
        'legacy',(SELECT enhancement_snapshot FROM public.run_attempts WHERE user_id='${owner.userId}' AND status='started')));ROLLBACK;`);
    expect(out.current.Garen).toEqual({ fighter_core_1: 1 });
    expect(out.legacy.Garen).toEqual(ranks);
  });

  it('keeps an open 0.3.0 run frozen through a real refunded reset, and keeps Daily enhancements and mastery neutral', () => {
    const out = audit<{
      before: unknown;
      after: unknown;
      owned: object;
      daily: { enhancement_snapshot: object; mastery_snapshot: object };
    }>(`BEGIN;${seed(owner)}${claims(owner)}
      SELECT public.unlock_champion_enhancement_v2('Garen','fighter_core_1',0,0,gen_random_uuid(),4);
      CREATE TEMP TABLE started AS SELECT ${start()} payload;
      CREATE TEMP TABLE frozen AS SELECT enhancement_snapshot FROM public.run_attempts WHERE id=${startedId};
      SELECT public.reset_champion_enhancements('Garen',1,gen_random_uuid(),1);
      CREATE TEMP TABLE preserved AS SELECT enhancement_snapshot FROM public.run_attempts WHERE id=${startedId};
      UPDATE public.run_attempts SET status='expired',expired_at=clock_timestamp() WHERE id=${startedId};
      CREATE TEMP TABLE daily AS SELECT public.start_daily_run_attempt(gen_random_uuid(),
        ARRAY[(public.daily_starter_ids((clock_timestamp() AT TIME ZONE 'UTC')::date,25::smallint))[1]],ARRAY[]::text[]) payload;
      SELECT json_build_object('audit',json_build_object('before',(SELECT enhancement_snapshot FROM frozen),
        'after',(SELECT enhancement_snapshot FROM preserved),'owned',(SELECT unlocked_nodes FROM public.champion_enhancements WHERE user_id='${owner.userId}'),
        'daily',(SELECT payload FROM daily)));ROLLBACK;`);
    expect(out.before).toEqual(out.after);
    expect(out.owned).toEqual({});
    expect(out.daily).toMatchObject({ enhancement_snapshot: {}, mastery_snapshot: {} });
  });

  it('allocates the real v3 participation budget under progression 4 and replays without a second reward', () => {
    const verified = result();
    const out = audit<{
      first: object;
      replay: object;
      attempt: object;
      run: object;
      candies: number;
      earned: number;
      members: object[];
    }>(`BEGIN;${claims(owner)}
      CREATE TEMP TABLE started AS SELECT ${start()} payload;${finishAndClaim()}
      CREATE TEMP TABLE first AS SELECT public.complete_run_verification(${startedId},${token},${sqlJson(verified)},NULL) payload;
      CREATE TEMP TABLE replay AS SELECT public.complete_run_verification(${startedId},${token},${sqlJson(verified)},NULL) payload;
      SELECT json_build_object('audit',json_build_object('first',(SELECT payload FROM first),'replay',(SELECT payload FROM replay),
        'attempt',(SELECT json_build_object('engine',engine_version,'gameplay',gameplay_ruleset_version,'progression',ruleset_version,'result',result) FROM public.run_attempts WHERE id=${startedId}),
        'run',(SELECT json_build_object('progression',progression_version,'candies',candies_earned,'ledger',ledger_version) FROM public.runs WHERE run_attempt_id=${startedId}),
        'candies',(SELECT total_candies FROM public.players WHERE id='${owner.playerId}'),
        'earned',(SELECT sum(amount) FROM public.candy_transactions WHERE player_id='${owner.playerId}' AND kind='earned'),
        'members',(SELECT json_agg(json_build_object('champion',champion_id,'candies',total_candies)ORDER BY champion_id) FROM public.champion_mastery WHERE player_id='${owner.playerId}')));ROLLBACK;`);
    expect(out.first).toMatchObject({
      status: 'verified',
      replayed: false,
      candies_earned: 20,
      candies_by_champion: { Garen: 15, Lux: 5 },
      progression_version: 4,
      gameplay_ruleset_version: 25,
      engine_version: 'run-engine-0.3.0',
    });
    expect(out.replay).toMatchObject({
      replayed: true,
      candies_earned: 20,
      progression_version: 4,
    });
    expect(out.attempt).toEqual({
      engine: 'run-engine-0.3.0',
      gameplay: 25,
      progression: 4,
      result: verified,
    });
    expect(out.run).toEqual({ progression: 4, candies: 20, ledger: 2 });
    expect(out.candies).toBe(20);
    expect(out.earned).toBe(20);
    expect(out.members).toEqual([
      { champion: 'Garen', candies: 15 },
      { champion: 'Lux', candies: 5 },
    ]);
  });

  it('rolls back compatibility identities and all rewards after malformed participation is refused', () => {
    const invalid = result();
    invalid.ledger.champions.Garen.waves_participated = 5;
    const out = audit<{
      error: string;
      before: unknown;
      after: unknown;
      runs: number;
      events: number;
      candies: number;
    }>(`BEGIN;${claims(owner)}
      CREATE TEMP TABLE started AS SELECT ${start()} payload;${finishAndClaim()}
      CREATE TEMP TABLE before AS SELECT to_jsonb(a) state FROM public.run_attempts a WHERE id=${startedId};
      CREATE TEMP TABLE errors(error text);
      DO $probe$ BEGIN BEGIN PERFORM public.complete_run_verification(${startedId},${token},${sqlJson(invalid)},NULL);
        EXCEPTION WHEN OTHERS THEN INSERT INTO errors VALUES(SQLERRM);END;END $probe$;
      SELECT json_build_object('audit',json_build_object('error',(SELECT error FROM errors),'before',(SELECT state FROM before),
        'after',(SELECT to_jsonb(a) FROM public.run_attempts a WHERE id=${startedId}),
        'runs',(SELECT count(*) FROM public.runs WHERE player_id='${owner.playerId}'),
        'events',(SELECT count(*) FROM public.candy_transactions WHERE player_id='${owner.playerId}'),
        'candies',(SELECT total_candies FROM public.players WHERE id='${owner.playerId}')));ROLLBACK;`);
    expect(out.error).toBe('verified_participation_ledger_mismatch:Garen');
    expect(out.after).toEqual(out.before);
    expect(out.runs).toBe(0);
    expect(out.events).toBe(0);
    expect(out.candies).toBe(0);
  });
});
