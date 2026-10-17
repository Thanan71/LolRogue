import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;
const hasCredentials = Boolean(supabaseUrl && anonKey && serviceKey && databaseUrl);
const describeDatabase = hasCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasCredentials) {
  throw new Error(
    'Admin metrics tests require disposable local Supabase and database credentials.',
  );
}

const sqlArguments = [
  '--no-psqlrc',
  '--no-password',
  '--quiet',
  '--tuples-only',
  '--no-align',
  '--set',
  'ON_ERROR_STOP=1',
];
function sqlEnvironment() {
  for (const input of [supabaseUrl, databaseUrl]) {
    if (!input || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(input).hostname)) {
      throw new Error('Admin metric fixtures require a disposable loopback database.');
    }
  }
  const connection = new URL(databaseUrl!);
  return {
    ...process.env,
    PGHOST: connection.hostname,
    PGPORT: connection.port,
    PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
  };
}
function localSql(sql: string): string {
  return execFileSync('psql', sqlArguments, {
    encoding: 'utf8',
    input: sql,
    env: sqlEnvironment(),
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
function concurrentSql(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'psql',
      [...sqlArguments, '--command', sql],
      { encoding: 'utf8', env: sqlEnvironment() },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
    );
  });
}
function uuid(value: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error('Invalid fixture UUID');
  return `'${value}'::uuid`;
}
type Account = { client: SupabaseClient<Database>; userId: string; playerId: string };

function canonicalResult(waves = 1, economyEnabled = false) {
  const champion = {
    waves_participated: waves,
    biomes_participated: waves > 0 ? ['top_lane'] : [],
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
  };
  return {
    verified: true,
    won: false,
    run_level: 1,
    waves_completed: waves,
    biomes_visited: ['top_lane'],
    gold_earned: 0,
    gold_spent: 0,
    gold_balance: 0,
    augment_ids: [],
    team_members: [
      { champion_id: 'Garen', ...champion, final_level: 2, final_hp: 100, items_collected: [] },
    ],
    ledger: {
      version: 2,
      champions: { Garen: champion },
      gold: { earned: 0, spent: 0 },
      items: [],
      next_item_event_sequence: 1,
    },
    ...(economyEnabled
      ? { economy: { version: 1, waves_completed: waves, biomes_completed: 0 } }
      : {}),
  };
}

describeDatabase('admin metric definitions and Candy accounting', () => {
  const createdUserIds: string[] = [];
  let service: SupabaseClient<Database>;
  let admin: Account;
  const auth = { autoRefreshToken: false, persistSession: false };

  async function account() {
    const suffix = randomUUID();
    const client = createClient<Database>(supabaseUrl!, anonKey!, { auth });
    const signup = await client.auth.signUp({
      email: `adm-metric-${suffix}@example.test`,
      password: 'Admin-metric-test-42!',
      options: { data: { username: `adm-${suffix}` } },
    });
    if (signup.error || !signup.data.user || !signup.data.session) {
      throw signup.error ?? new Error('Fixture signup needs an authenticated session');
    }
    createdUserIds.push(signup.data.user.id);
    const profile = await service
      .from('players')
      .select('id')
      .eq('user_id', signup.data.user.id)
      .single();
    if (profile.error || !profile.data) throw profile.error ?? new Error('Missing fixture player');
    return { client, userId: signup.data.user.id, playerId: profile.data.id } satisfies Account;
  }
  async function metrics() {
    const response = await admin.client.from('admin_stats').select('stat_name,stat_value');
    expect(response.error).toBeNull();
    return Object.fromEntries(response.data!.map((row) => [row.stat_name!, row.stat_value]));
  }
  async function ledger(owner: Account) {
    const response = await service
      .from('candy_transactions')
      .select('kind,amount,source_key')
      .eq('player_id', owner.playerId)
      .order('id');
    expect(response.error).toBeNull();
    return response.data!;
  }
  async function balance(owner: Account) {
    const response = await service
      .from('players')
      .select('total_candies')
      .eq('id', owner.playerId)
      .single();
    expect(response.error).toBeNull();
    return response.data!.total_candies;
  }
  async function claim(owner: Account) {
    const started = await owner.client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(started.error).toBeNull();
    const id = (started.data as { attempt_id: string }).attempt_id;
    const appended = await owner.client.rpc('append_run_attempt_commands', {
      p_attempt_id: id,
      p_commands: [{ command_id: randomUUID(), sequence: 1, kind: 'abandon_run', payload: {} }],
    });
    expect(appended.error).toBeNull();
    const sealed = await owner.client.rpc('seal_run_attempt', {
      p_attempt_id: id,
      p_finish_command_id: randomUUID(),
      p_expected_sequence: 1,
    });
    expect(sealed.error).toBeNull();
    const result = await service.rpc('claim_run_verification', {
      p_attempt_id: id,
      p_worker_id: randomUUID(),
    });
    expect(result.error).toBeNull();
    const data = result.data as {
      claimed: boolean;
      lease_token: string;
      economy_version: number | null;
    };
    expect(data.claimed).toBe(true);
    return { id, token: data.lease_token, economyEnabled: data.economy_version !== null };
  }

  beforeAll(async () => {
    sqlEnvironment();
    service = createClient<Database>(supabaseUrl!, serviceKey!, { auth });
    admin = await account();
    const granted = await service
      .from('players')
      .update({ is_admin: true })
      .eq('id', admin.playerId);
    expect(granted.error).toBeNull();
  });
  afterAll(async () => {
    for (const id of createdUserIds) {
      const deleted = await service.auth.admin.deleteUser(id);
      expect(deleted.error).toBeNull();
    }
  });

  it('publishes every metric with a valid coverage timestamp and exact source totals', async () => {
    const values = await metrics();
    expect(Object.keys(values).sort()).toEqual(
      [
        'total_players',
        'total_runs',
        'total_daily_runs',
        'total_wins',
        'active_today',
        'total_candies_balance',
        'total_candies_earned',
        'total_candies_spent',
        'total_candies_refunded',
        'candies_earned_since_ledger',
        'candies_spent_since_ledger',
        'candies_refunded_since_ledger',
        'candies_history_incomplete_accounts',
        'candies_unreconciled_accounts',
        'candies_ledger_started_at',
      ].sort(),
    );
    expect(values.candies_ledger_started_at).toMatch(/Z$/);
    expect(Number.isFinite(Date.parse(values.candies_ledger_started_at!))).toBe(true);
    const source = JSON.parse(
      localSql(`SELECT json_build_object(
      'total_players',(SELECT count(*) FROM public.players),
      'total_runs',(SELECT count(*) FROM public.runs),
      'total_daily_runs',(SELECT count(*) FROM public.daily_runs),
      'total_wins',(SELECT coalesce(sum(total_wins),0) FROM public.players),
      'total_candies_balance',(SELECT coalesce(sum(total_candies),0) FROM public.players));`),
    );
    for (const [key, value] of Object.entries(source)) expect(values[key]).toBe(String(value));
    expect(values.candies_unreconciled_accounts).toBe('0');
  });

  it.each([0, 101, 1001])(
    'counts %i additional accounts server-side without a row cap',
    (count) => {
      const difference = localSql(`BEGIN;
      CREATE TEMP TABLE metric_before AS SELECT count(*) AS n FROM public.players;
      INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
      SELECT id,'adm-bulk-'||id::text||'@example.test',
        jsonb_build_object('username','adm-bulk-'||id::text), '{}'::jsonb
      FROM (SELECT gen_random_uuid() AS id FROM generate_series(1,${count})) AS accounts;
      GRANT SELECT ON metric_before TO authenticated;
      DO $claims$ BEGIN PERFORM set_config('request.jwt.claims',
        json_build_object('sub',${uuid(admin.userId)},'role','authenticated')::text,true); END $claims$;
      SET LOCAL ROLE authenticated;
      SELECT stat_value::bigint - (SELECT n FROM metric_before)
      FROM public.admin_stats WHERE stat_name='total_players';
      ROLLBACK;`);
      expect(difference).toBe(String(count));
    },
  );

  it('counts UTC logins once, excludes adjacent days and ignores the session timezone', async () => {
    const today = await account();
    const yesterday = await account();
    const tomorrow = await account();
    const before = Number((await metrics()).active_today);
    localSql(`UPDATE public.players SET last_login_at =
      (date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') + CASE
        WHEN id=${uuid(today.playerId)} THEN interval '0 seconds'
        WHEN id=${uuid(yesterday.playerId)} THEN interval '-1 microsecond'
        ELSE interval '1 day' END
      WHERE id IN (${uuid(today.playerId)},${uuid(yesterday.playerId)},${uuid(tomorrow.playerId)});`);
    expect((await metrics()).active_today).toBe(String(before + 1));
    for (let n = 0; n < 2; n++) {
      expect((await today.client.rpc('touch_player_last_login')).error).toBeNull();
    }
    const fromDifferentZone = localSql(`BEGIN;
      SET LOCAL TIME ZONE 'Pacific/Kiritimati';
      DO $claims$ BEGIN PERFORM set_config('request.jwt.claims',
        json_build_object('sub',${uuid(admin.userId)},'role','authenticated')::text,true); END $claims$;
      SET LOCAL ROLE authenticated;
      SELECT stat_value FROM public.admin_stats WHERE stat_name='active_today'; ROLLBACK;`);
    expect(fromDifferentZone).toBe(String(before + 1));
  });

  it('returns a legitimate zero for a day without any recorded login', () => {
    const emptyDay = localSql(`BEGIN;
      UPDATE public.players SET last_login_at=NULL;
      DO $claims$ BEGIN PERFORM set_config('request.jwt.claims',
        json_build_object('sub',${uuid(admin.userId)},'role','authenticated')::text,true); END $claims$;
      SET LOCAL ROLE authenticated;
      SELECT stat_value FROM public.admin_stats WHERE stat_name='active_today'; ROLLBACK;`);
    expect(emptyDay).toBe('0');
  });

  it('keeps champion mastery progression separate from spendable Candy accounting', async () => {
    const owner = await account();
    const before = await metrics();
    const mastery = await service.from('champion_mastery').insert({
      player_id: owner.playerId,
      champion_id: 'Garen',
      total_candies: 900,
      mastery_level: 4,
      current_level_candies: 0,
      unlocked_ids: [],
    });
    expect(mastery.error).toBeNull();
    expect(await balance(owner)).toBe(0);
    expect(await ledger(owner)).toEqual([]);
    expect((await metrics()).candies_earned_since_ledger).toBe(before.candies_earned_since_ledger);
  });

  it('keeps unattributed history unknown after its balance returns to zero', async () => {
    const owner = await account();
    expect(await ledger(owner)).toEqual([]);
    const accountBefore = await service
      .from('candy_accounts')
      .select('*')
      .eq('player_id', owner.playerId)
      .single();
    expect(accountBefore.data).toMatchObject({ opening_balance: 0, history_complete: true });
    for (const amount of [137, 0]) {
      expect(
        (await service.from('players').update({ total_candies: amount }).eq('id', owner.playerId))
          .error,
      ).toBeNull();
    }
    expect((await ledger(owner)).map(({ kind, amount }) => ({ kind, amount }))).toEqual([
      { kind: 'unattributed', amount: 137 },
      { kind: 'unattributed', amount: -137 },
    ]);
    const accountAfter = await service
      .from('candy_accounts')
      .select('history_complete')
      .eq('player_id', owner.playerId)
      .single();
    expect(accountAfter.data?.history_complete).toBe(false);
    expect(() =>
      localSql(
        `UPDATE public.candy_accounts SET history_complete=TRUE WHERE player_id=${uuid(owner.playerId)};`,
      ),
    ).toThrow();
    const values = await metrics();
    expect(values.total_candies_earned).toBeNull();
    expect(values.total_candies_spent).toBeNull();
    expect(values.total_candies_refunded).toBeNull();
    expect(values.candies_unreconciled_accounts).toBe('0');
  });

  it('records a canonical enhancement debit once across concurrent commands and retries', async () => {
    const owner = await account();
    const beforeSpent = Number((await metrics()).candies_spent_since_ledger);
    expect(
      (await service.from('players').update({ total_candies: 1000 }).eq('id', owner.playerId))
        .error,
    ).toBeNull();
    const commandIds = [randomUUID(), randomUUID()];
    const purchase = (command: string) =>
      owner.client.rpc('unlock_champion_enhancement', {
        p_champion_id: 'Garen',
        p_node_id: 'fighter_core_1',
        p_expected_rank: 0,
        p_command_id: command,
      });
    const concurrent = await Promise.all(commandIds.map(purchase));
    expect(concurrent.filter(({ error }) => !error)).toHaveLength(1);
    expect(concurrent.find(({ error }) => error)?.error?.message).toContain(
      'enhancement_rank_conflict',
    );
    const winner = concurrent.findIndex(({ error }) => !error);
    const result = concurrent[winner].data as { candy_cost: number; replayed: boolean };
    const retry = await purchase(commandIds[winner]);
    expect(retry.error).toBeNull();
    expect(retry.data).toMatchObject({ replayed: true });
    expect(await balance(owner)).toBe(1000 - result.candy_cost);
    expect((await ledger(owner)).filter(({ kind }) => kind === 'spent')).toEqual([
      { kind: 'spent', amount: -result.candy_cost, source_key: `purchase:${commandIds[winner]}` },
    ]);
    expect((await metrics()).candies_spent_since_ledger).toBe(
      String(beforeSpent + result.candy_cost),
    );
  });

  it('rolls back the purchase debit, enhancement and command if its ledger event fails', async () => {
    const owner = await account();
    const command = randomUUID();
    expect(
      (await service.from('players').update({ total_candies: 1000 }).eq('id', owner.playerId))
        .error,
    ).toBeNull();
    localSql(`CREATE FUNCTION private.reject_candy_fixture_event() RETURNS trigger
      LANGUAGE plpgsql SET search_path='' AS $fixture$
      BEGIN IF NEW.player_id=${uuid(owner.playerId)} AND NEW.kind='spent' THEN
        RAISE EXCEPTION 'fixture_candy_event_failure'; END IF; RETURN NEW; END $fixture$;
      REVOKE ALL ON FUNCTION private.reject_candy_fixture_event() FROM PUBLIC,anon,authenticated,service_role;
      CREATE TRIGGER reject_candy_fixture_event BEFORE INSERT ON public.candy_transactions
      FOR EACH ROW EXECUTE FUNCTION private.reject_candy_fixture_event();`);
    const purchase = () =>
      owner.client.rpc('unlock_champion_enhancement', {
        p_champion_id: 'Garen',
        p_node_id: 'fighter_core_1',
        p_expected_rank: 0,
        p_command_id: command,
      });
    try {
      expect((await purchase()).error?.message).toContain('fixture_candy_event_failure');
      expect(await balance(owner)).toBe(1000);
      expect((await ledger(owner)).filter(({ kind }) => kind === 'spent')).toEqual([]);
      const enhancement = await service
        .from('champion_enhancements')
        .select('unlocked_nodes')
        .eq('user_id', owner.userId);
      expect(enhancement.error).toBeNull();
      expect(enhancement.data).toEqual([]);
      const commands = await service
        .from('progression_commands')
        .select('command_id')
        .eq('user_id', owner.userId);
      expect(commands.error).toBeNull();
      expect(commands.data).toEqual([]);
    } finally {
      localSql(
        'DROP TRIGGER reject_candy_fixture_event ON public.candy_transactions; DROP FUNCTION private.reject_candy_fixture_event();',
      );
    }
    expect((await purchase()).error).toBeNull();
  });

  it('records only the final verified reward, including a concurrent verification retry', async () => {
    const owner = await account();
    const beforeEarned = Number((await metrics()).candies_earned_since_ledger);
    const run = await claim(owner);
    // SQL permits a null result hash; generated argument types do not model nullable parameters.
    const verifier = createClient(supabaseUrl!, serviceKey!, { auth });
    const complete = () =>
      verifier.rpc('complete_run_verification', {
        p_attempt_id: run.id,
        p_lease_token: run.token,
        p_result: canonicalResult(1, run.economyEnabled),
        p_result_hash: null,
      });
    const outcomes = await Promise.all([complete(), complete()]);
    for (const outcome of outcomes) expect(outcome.error).toBeNull();
    const source = await service
      .from('runs')
      .select('id,candies_earned')
      .eq('run_attempt_id', run.id)
      .single();
    expect(source.error).toBeNull();
    expect(source.data!.candies_earned).toBeGreaterThan(0);
    expect(await balance(owner)).toBe(source.data!.candies_earned);
    expect(await ledger(owner)).toEqual([
      { kind: 'earned', amount: source.data!.candies_earned, source_key: `run:${source.data!.id}` },
    ]);
    const completeness = await service
      .from('candy_accounts')
      .select('history_complete')
      .eq('player_id', owner.playerId)
      .single();
    expect(completeness.data?.history_complete).toBe(true);
    expect((await metrics()).candies_earned_since_ledger).toBe(
      String(beforeEarned + source.data!.candies_earned),
    );
  });

  it('leaves rejected attempts without a reward or a Candy event', async () => {
    const owner = await account();
    const run = await claim(owner);
    const rejected = await service.rpc('reject_run_verification', {
      p_attempt_id: run.id,
      p_lease_token: run.token,
      p_rejection_code: 'invalid_command_payload',
    });
    expect(rejected.error).toBeNull();
    expect(await balance(owner)).toBe(0);
    expect(await ledger(owner)).toEqual([]);
  });

  it('accepts a verified zero-Candy run without creating a zero-amount ledger event', async () => {
    const owner = await account();
    const run = await claim(owner);
    const verifier = createClient(supabaseUrl!, serviceKey!, { auth });
    const result = await verifier.rpc('complete_run_verification', {
      p_attempt_id: run.id,
      p_lease_token: run.token,
      p_result: canonicalResult(0, run.economyEnabled),
      p_result_hash: null,
    });
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ status: 'verified', candies_earned: 0 });
    expect(await balance(owner)).toBe(0);
    expect(await ledger(owner)).toEqual([]);
    const source = await service
      .from('runs')
      .select('candies_earned')
      .eq('run_attempt_id', run.id)
      .single();
    expect(source.error).toBeNull();
    expect(source.data?.candies_earned).toBe(0);
  });

  it('refunds atomically and once across two real concurrent transactions', async () => {
    const owner = await account();
    const beforeRefunded = Number((await metrics()).candies_refunded_since_ledger);
    const command = randomUUID();
    const sql = `SELECT private.refund_candies(${uuid(owner.playerId)},43,${uuid(command)});`;
    const outcomes = await Promise.all([concurrentSql(sql), concurrentSql(sql)]);
    expect(outcomes.map((result) => JSON.parse(result).replayed).sort()).toEqual([false, true]);
    expect(await balance(owner)).toBe(43);
    expect((await metrics()).candies_refunded_since_ledger).toBe(String(beforeRefunded + 43));
    expect(await ledger(owner)).toEqual([
      { kind: 'refunded', amount: 43, source_key: `refund:${command}` },
    ]);
    expect(() =>
      localSql(`SELECT private.refund_candies(${uuid(owner.playerId)},44,${uuid(command)});`),
    ).toThrow();
    expect(await balance(owner)).toBe(43);
  });

  it('rolls back both the credited balance and its refund event on transaction failure', async () => {
    const owner = await account();
    expect(() =>
      localSql(`BEGIN;
      SELECT private.refund_candies(${uuid(owner.playerId)},43,${uuid(randomUUID())});
      SELECT 1/0; COMMIT;`),
    ).toThrow();
    expect(await balance(owner)).toBe(0);
    expect(await ledger(owner)).toEqual([]);
  });
});
