import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  CHAMPION_CATALOG_VERSION,
  calculateShardReward,
  getRotationForInstant,
} from '@/domain/championEconomy';
import type { ChampionEconomySnapshot, ChampionPurchaseResult } from '@/types/championEconomy';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;
const hasCredentials = Boolean(supabaseUrl && anonKey && serviceKey && databaseUrl);
const describeLive = hasCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasCredentials) {
  throw new Error('Champion economy tests require local Supabase API keys and SUPABASE_DB_URL');
}

function localSql(sql: string): string {
  for (const value of [supabaseUrl!, databaseUrl!]) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname)) {
      throw new Error('Champion economy fixtures require disposable loopback Supabase');
    }
  }
  const connection = new URL(databaseUrl!);
  return execFileSync(
    'psql',
    [
      '--no-psqlrc',
      '--no-password',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '--set',
      'ON_ERROR_STOP=1',
    ],
    {
      encoding: 'utf8',
      input: sql,
      env: {
        ...process.env,
        PGHOST: connection.hostname,
        PGPORT: connection.port,
        PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
        PGUSER: decodeURIComponent(connection.username),
        PGPASSWORD: decodeURIComponent(connection.password),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  ).trim();
}

function sqlJson<T>(sql: string): T {
  return JSON.parse(localSql(sql)) as T;
}

function uuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Invalid fixture UUID');
  }
  return `'${value}'::uuid`;
}

async function snapshot(client: SupabaseClient): Promise<ChampionEconomySnapshot> {
  const response = await client.rpc('get_champion_economy_snapshot');
  expect(response.error).toBeNull();
  return response.data as ChampionEconomySnapshot;
}

function verifiedResult(championIds: string[], waves = 1, biomes = 0, won = false) {
  const visited = ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'].slice(
    0,
    biomes + (won ? 0 : 1),
  );
  const champions = Object.fromEntries(
    championIds.map((championId) => [
      championId,
      {
        waves_participated: waves,
        biomes_participated: waves > 0 ? visited : [],
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
      },
    ]),
  );
  return {
    verified: true,
    won,
    run_level: won ? 6 : biomes + 1,
    waves_completed: waves,
    biomes_visited: visited,
    gold_earned: 0,
    gold_spent: 0,
    gold_balance: 0,
    augment_ids: [],
    team_members: championIds.map((championId) => ({
      champion_id: championId,
      ...champions[championId],
      final_level: 2,
      final_hp: 100,
      items_collected: [],
    })),
    ledger: {
      version: 2,
      champions,
      gold: { earned: 0, spent: 0 },
      items: [],
      next_item_event_sequence: 1,
    },
    economy: { version: 1, waves_completed: waves, biomes_completed: biomes },
  };
}

describeLive('champion economy live authority', () => {
  const auth = { autoRefreshToken: false, persistSession: false };
  let server: SupabaseClient;
  let anonymous: SupabaseClient;
  let originalConfig: string;
  let activationTime: string;
  let legacy: { id: string; client: SupabaseClient };
  const users: string[] = [];

  async function account() {
    const client = createClient(supabaseUrl!, anonKey!, { auth });
    const suffix = randomUUID();
    const response = await client.auth.signUp({
      email: `champion-economy-${suffix}@example.test`,
      password: 'Test-password-42!',
      options: { data: { username: `eco-${suffix}` } },
    });
    if (response.error || !response.data.user?.id || !response.data.session) {
      throw response.error ?? new Error('Economy fixture did not receive an authenticated session');
    }
    users.push(response.data.user.id);
    return { client, id: response.data.user.id };
  }

  async function credit(userId: string, amount: number) {
    const response = await server.rpc('adjust_champion_shards', {
      p_user_id: userId,
      p_amount: amount,
      p_command_id: randomUUID(),
    });
    expect(response.error).toBeNull();
  }

  async function purchase(
    client: SupabaseClient,
    championId: string,
    commandId = randomUUID(),
    price = 400,
    version: number = CHAMPION_CATALOG_VERSION,
  ) {
    return client.rpc('purchase_champion', {
      p_command_id: commandId,
      p_champion_id: championId,
      p_expected_price: price,
      p_expected_catalog_version: version,
    });
  }

  async function attempt(client: SupabaseClient, team = ['Garen']) {
    const started = await client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: team,
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(started.error).toBeNull();
    const attemptId = (started.data as { attempt_id: string }).attempt_id;
    const appended = await client.rpc('append_run_attempt_commands', {
      p_attempt_id: attemptId,
      p_commands: [{ command_id: randomUUID(), sequence: 1, kind: 'abandon_run', payload: {} }],
    });
    expect(appended.error).toBeNull();
    const sealed = await client.rpc('seal_run_attempt', {
      p_attempt_id: attemptId,
      p_finish_command_id: randomUUID(),
      p_expected_sequence: 1,
    });
    expect(sealed.error).toBeNull();
    const claim = await server.rpc('claim_run_verification', {
      p_attempt_id: attemptId,
      p_worker_id: randomUUID(),
    });
    expect(claim.error).toBeNull();
    expect(claim.data.claimed).toBe(true);
    return {
      id: attemptId,
      token: claim.data.lease_token as string,
      started: started.data,
      claim: claim.data,
    };
  }

  async function complete(
    run: { id: string; token: string },
    result: ReturnType<typeof verifiedResult>,
  ) {
    return server.rpc('complete_run_verification', {
      p_attempt_id: run.id,
      p_lease_token: run.token,
      p_result: result,
      p_result_hash: null,
    });
  }

  beforeAll(async () => {
    // All mutation helpers require loopback credentials, even if called by accident.
    originalConfig = localSql(
      'SELECT row_to_json(config) FROM public.champion_economy_config AS config;',
    );
    localSql(
      'UPDATE public.champion_economy_config SET enabled=FALSE, activated_at=NULL WHERE singleton;',
    );
    server = createClient(supabaseUrl!, serviceKey!, { auth });
    anonymous = createClient(supabaseUrl!, anonKey!, { auth });
    legacy = await account();
    const before = await snapshot(legacy.client);
    expect(before.enabled).toBe(false);
    expect(before.wallet).toEqual({ shardsBalance: 0, lifetimeEarned: 0, lifetimeSpent: 0 });
    const enabled = await server.rpc('set_champion_economy_enabled', { p_enabled: true });
    expect(enabled.error).toBeNull();
    activationTime = enabled.data.activatedAt as string;
  });

  afterAll(async () => {
    if (originalConfig) {
      const encoded = Buffer.from(originalConfig).toString('base64');
      localSql(`UPDATE public.champion_economy_config SET enabled = (source.value->>'enabled')::boolean,
        activated_at = (source.value->>'activated_at')::timestamptz,
        legacy_catalog_version = (source.value->>'legacy_catalog_version')::smallint,
        updated_at = (source.value->>'updated_at')::timestamptz
        FROM (SELECT convert_from(decode('${encoded}', 'base64'), 'UTF8')::jsonb AS value) AS source
        WHERE singleton;`);
    }
    for (const id of users) {
      // Existing attempt/run foreign keys form a cycle; break only fixture rows.
      localSql(`UPDATE public.run_attempts SET status='expired', verified_at=NULL, rejected_at=NULL,
        expired_at=clock_timestamp(), result_run_id=NULL WHERE user_id=${uuid(id)};`);
      const response = await server.auth.admin.deleteUser(id);
      expect(response.error).toBeNull();
    }
  });

  it('grandfathers pre-activation accounts exactly once without inventing shards', async () => {
    const current = await snapshot(legacy.client);
    expect(current.ownedChampionIds).toHaveLength(current.catalog.length);
    expect(current.wallet?.shardsBalance).toBe(0);
    const source = await legacy.client.from('account_champion_unlocks').select('source,price_paid');
    expect(source.error).toBeNull();
    expect(source.data).toHaveLength(current.catalog.length);
    expect(source.data?.every((row) => row.source === 'legacy_grant' && row.price_paid === 0)).toBe(
      true,
    );
    const reenabled = await server.rpc('set_champion_economy_enabled', { p_enabled: true });
    expect(reenabled.error).toBeNull();
    expect(reenabled.data.activatedAt).toBe(activationTime);
    expect((await snapshot(legacy.client)).ownedChampionIds).toHaveLength(current.catalog.length);
  });

  it('publishes a common bounded rotation while keeping guest wallets absent', async () => {
    const a = await account();
    const b = await account();
    const [first, second, guest] = await Promise.all([
      snapshot(a.client),
      snapshot(b.client),
      snapshot(anonymous),
    ]);
    expect(first.rotation).toEqual(second.rotation);
    expect(guest.rotation).toEqual(first.rotation);
    expect(
      first.catalog.filter((entry) => entry.permanentFree).map((entry) => entry.championId),
    ).toEqual(['Annie', 'Ashe', 'Garen']);
    expect(first.rotation?.championIds).toHaveLength(5);
    expect(first.ownedChampionIds).toEqual([]);
    expect(guest.wallet).toBeNull();
    expect(guest.ownedChampionIds).toEqual([]);
    expect({
      ...first.rotation,
      startsAt: new Date(first.rotation!.startsAt).toISOString(),
      endsAt: new Date(first.rotation!.endsAt).toISOString(),
    }).toEqual(getRotationForInstant(first.serverNow, first.gameplayRulesetVersion));
    expect((await purchase(anonymous, 'Darius')).error?.code).toBe('42501');
  });

  it('keeps the v1 legacy grant frozen when the active catalogue grows to Veigar', async () => {
    const original = localSql('SELECT activated_at::text FROM public.champion_economy_config;');
    localSql(
      "UPDATE public.champion_economy_config SET legacy_catalog_version=1, activated_at=clock_timestamp()+interval '1 hour' WHERE singleton;",
    );
    try {
      const importedLegacy = await account();
      const state = await snapshot(importedLegacy.client);
      expect(state.catalogVersion).toBe(2);
      expect(state.catalog.some((entry) => entry.championId === 'Veigar')).toBe(true);
      expect(state.ownedChampionIds).toHaveLength(10);
      expect(state.ownedChampionIds).not.toContain('Veigar');
      await credit(importedLegacy.id, 400);
      expect((await purchase(importedLegacy.client, 'Veigar')).error).toBeNull();
      expect((await snapshot(importedLegacy.client)).ownedChampionIds).toContain('Veigar');
    } finally {
      localSql(
        `UPDATE public.champion_economy_config SET legacy_catalog_version=2, activated_at='${original}'::timestamptz WHERE singleton;`,
      );
    }
  });

  it('enforces owner-only reads and denies direct balance, ledger and unlock writes', async () => {
    const a = await account();
    const b = await account();
    await credit(b.id, 400);
    for (const table of ['account_wallets', 'shard_transactions', 'account_champion_unlocks']) {
      const other = await a.client.from(table).select('*').eq('user_id', b.id);
      expect(other.error).toBeNull();
      expect(other.data).toEqual([]);
      const guest = await anonymous.from(table).select('*');
      expect(guest.error?.code).toBe('42501');
    }
    const balance = await a.client
      .from('account_wallets')
      .update({ shards_balance: 99999 })
      .eq('user_id', a.id);
    expect(balance.error?.code).toBe('42501');
    const unlock = await a.client
      .from('account_champion_unlocks')
      .insert({ user_id: a.id, champion_id: 'Darius', source: 'admin_grant' });
    expect(unlock.error?.code).toBe('42501');
    const ledger = await a.client.from('shard_transactions').insert({
      user_id: a.id,
      amount: 400,
      balance_after: 400,
      reason: 'admin_adjustment',
      economy_version: 1,
      idempotency_key: randomUUID(),
    });
    expect(ledger.error?.code).toBe('42501');
    expect(
      (
        await a.client.rpc('adjust_champion_shards', {
          p_user_id: a.id,
          p_amount: 400,
          p_command_id: randomUUID(),
        })
      ).error?.code,
    ).toBe('42501');
    expect(
      (await a.client.rpc('set_champion_economy_enabled', { p_enabled: false })).error?.code,
    ).toBe('42501');
  });

  it.each([399, 400, 401])(
    'handles the exact %i shard purchase boundary without touching mastery',
    async (balance) => {
      const owner = await account();
      await credit(owner.id, balance);
      const player = await owner.client
        .from('players')
        .select('id,total_candies')
        .eq('user_id', owner.id)
        .single();
      expect(player.error).toBeNull();
      const before = await owner.client
        .from('champion_mastery')
        .select('*')
        .eq('player_id', player.data!.id);
      expect(before.error).toBeNull();
      const bought = await purchase(owner.client, 'Darius');
      if (balance < 400) {
        expect(bought.error?.message).toContain('insufficient_shards');
        expect((await snapshot(owner.client)).wallet?.shardsBalance).toBe(399);
      } else {
        expect(bought.error).toBeNull();
        const result = bought.data as ChampionPurchaseResult;
        expect(result.snapshot.wallet).toEqual({
          shardsBalance: balance - 400,
          lifetimeEarned: balance,
          lifetimeSpent: 400,
        });
        expect(result.snapshot.ownedChampionIds).toEqual(['Darius']);
      }
      const after = await owner.client
        .from('champion_mastery')
        .select('*')
        .eq('player_id', player.data!.id);
      expect(after.error).toBeNull();
      expect(after.data).toEqual(before.data);
      const latestPlayer = await owner.client
        .from('players')
        .select('total_candies')
        .eq('user_id', owner.id)
        .single();
      expect(latestPlayer.data?.total_candies).toBe(player.data?.total_candies);
    },
  );

  it('serializes concurrent double clicks and rejects a reused command with a different payload', async () => {
    const owner = await account();
    await credit(owner.id, 800);
    const command = randomUUID();
    const same = await Promise.all([
      purchase(owner.client, 'Darius', command),
      purchase(owner.client, 'Darius', command),
    ]);
    expect(same.every((result) => !result.error)).toBe(true);
    expect(same.map((result) => (result.data as ChampionPurchaseResult).replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect((await purchase(owner.client, 'Lux', command)).error?.message).toContain(
      'idempotency_key_reused',
    );
    const other = await Promise.all([purchase(owner.client, 'Lux'), purchase(owner.client, 'Lux')]);
    expect(other.filter((result) => !result.error)).toHaveLength(1);
    expect(other.find((result) => result.error)?.error?.message).toContain(
      'champion_already_owned',
    );
    const state = await snapshot(owner.client);
    expect(state.wallet).toEqual({ shardsBalance: 0, lifetimeEarned: 800, lifetimeSpent: 800 });
    expect(state.ownedChampionIds).toEqual(['Darius', 'Lux']);
  });

  it('rejects invalid champions, free champions and stale quotes before debiting', async () => {
    const owner = await account();
    await credit(owner.id, 800);
    for (const [championId, price, version, error] of [
      ['Missing', 400, 1, 'invalid_champion'],
      ['Garen', 400, 1, 'champion_not_purchasable'],
      ['Darius', 399, 1, 'champion_price_changed'],
      ['Darius', 400, 1, 'champion_price_changed'],
    ] as const) {
      expect(
        (await purchase(owner.client, championId, randomUUID(), price, version)).error?.message,
      ).toContain(error);
    }
    expect((await snapshot(owner.client)).wallet?.shardsBalance).toBe(800);
    expect((await snapshot(owner.client)).ownedChampionIds).toEqual([]);
  });

  it('rolls back the debit and ledger when an unlock insert fails', async () => {
    const owner = await account();
    await credit(owner.id, 400);
    localSql(`CREATE FUNCTION private.reject_economy_fixture_unlock() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
      BEGIN IF NEW.user_id=${uuid(owner.id)} THEN RAISE EXCEPTION 'fixture_unlock_failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER reject_economy_fixture_unlock BEFORE INSERT ON public.account_champion_unlocks
      FOR EACH ROW EXECUTE FUNCTION private.reject_economy_fixture_unlock();`);
    try {
      expect((await purchase(owner.client, 'Darius')).error?.message).toContain(
        'fixture_unlock_failure',
      );
      expect((await snapshot(owner.client)).wallet).toEqual({
        shardsBalance: 400,
        lifetimeEarned: 400,
        lifetimeSpent: 0,
      });
      const ledger = await owner.client.from('shard_transactions').select('reason');
      expect(ledger.data).toEqual([{ reason: 'admin_adjustment' }]);
    } finally {
      localSql(
        'DROP TRIGGER reject_economy_fixture_unlock ON public.account_champion_unlocks; DROP FUNCTION private.reject_economy_fixture_unlock();',
      );
    }
  });

  it('rejects locked starters while snapshots and their retries survive flag changes', async () => {
    const owner = await account();
    const state = await snapshot(owner.client);
    const locked = state.catalog.find(
      (entry) => !entry.permanentFree && !state.rotation!.championIds.includes(entry.championId),
    )!.championId;
    const denied = await owner.client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: [locked],
      p_rune_ids: [],
      p_difficulty: 'normal',
    });
    expect(denied.error?.message).toContain('champion_access_expired');
    const command = randomUUID();
    const parameters = {
      p_command_id: command,
      p_team: [state.rotation!.championIds[0]],
      p_rune_ids: [],
      p_difficulty: 'normal',
    };
    const started = await owner.client.rpc('start_run_attempt', parameters);
    expect(started.error).toBeNull();
    expect(started.data.champion_access_snapshot.allowedChampionIds).toHaveLength(8);
    await server.rpc('set_champion_economy_enabled', { p_enabled: false });
    try {
      const retried = await owner.client.rpc('start_run_attempt', parameters);
      expect(retried.error).toBeNull();
      expect(retried.data.champion_access_snapshot).toEqual(started.data.champion_access_snapshot);
      expect(retried.data.economy_version).toBe(1);
      const fresh = await account();
      const historical = await fresh.client.rpc('start_run_attempt', {
        ...parameters,
        p_command_id: randomUUID(),
        p_team: [locked],
      });
      expect(historical.error).toBeNull();
      expect(historical.data.economy_version).toBeNull();
      expect(historical.data.champion_access_snapshot.allowedChampionIds).toHaveLength(
        state.catalog.length,
      );
      expect((await purchase(fresh.client, locked)).error?.message).toContain(
        'champion_economy_disabled',
      );
    } finally {
      const enabled = await server.rpc('set_champion_economy_enabled', { p_enabled: true });
      expect(enabled.error).toBeNull();
      expect(enabled.data.activatedAt).toBe(activationTime);
    }
  });

  it('keeps the common six-choice Daily independent of ownership', async () => {
    const owner = await account();
    const daily = await owner.client.rpc('get_daily_challenge');
    expect(daily.error).toBeNull();
    const starterIds = daily.data.starter_ids as string[];
    expect(starterIds).toHaveLength(6);
    const started = await owner.client.rpc('start_daily_run_attempt', {
      p_command_id: randomUUID(),
      p_team: [starterIds[0]],
      p_rune_ids: [],
    });
    expect(started.error).toBeNull();
    expect(started.data.champion_access_snapshot.allowedChampionIds).toEqual(starterIds);
    expect((await snapshot(owner.client)).ownedChampionIds).toEqual([]);
  });

  it('preserves 183 mastery candies through two rotations, a lock and a later permanent purchase', async () => {
    const owner = await account();
    const current = await snapshot(owner.client);
    const championId = current.rotation!.championIds[0];
    const player = await owner.client.from('players').select('id').eq('user_id', owner.id).single();
    expect(player.error).toBeNull();
    localSql(`INSERT INTO public.champion_mastery(player_id,champion_id,total_candies,mastery_level,current_level_candies,unlocked_ids)
      VALUES (${uuid(player.data!.id)}, '${championId}', 183, public.mastery_level_from_candies(183),
        public.mastery_current_level_candies(183), public.mastery_unlock_ids(183));`);
    const mastery = await owner.client
      .from('champion_mastery')
      .select('*')
      .eq('player_id', player.data!.id)
      .single();
    expect(mastery.error).toBeNull();
    const run = await attempt(owner.client, [championId]);
    const originalClock = localSql(
      "SELECT pg_get_functiondef('private.champion_economy_now()'::regprocedure);",
    );
    try {
      const nextWeek = new Date(Date.parse(current.rotation!.endsAt) + 1000).toISOString();
      localSql(`CREATE OR REPLACE FUNCTION private.champion_economy_now() RETURNS timestamptz
        LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT '${nextWeek}'::timestamptz $$;`);
      const changed = await snapshot(owner.client);
      expect(changed.rotation!.id).not.toBe(current.rotation!.id);
      expect(changed.rotation!.championIds).not.toContain(championId);
      // Finalization still uses the original period snapshot, even after it expires.
      expect((await complete(run, verifiedResult([championId], 0))).error).toBeNull();
      const denied = await owner.client.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: [championId],
        p_rune_ids: [],
        p_difficulty: 'normal',
      });
      expect(denied.error?.message).toContain('champion_access_expired');
      await credit(owner.id, 400);
      expect((await purchase(owner.client, championId)).error).toBeNull();
      const weekAfter = new Date(
        Date.parse(current.rotation!.endsAt) + 604800000 + 1000,
      ).toISOString();
      localSql(`CREATE OR REPLACE FUNCTION private.champion_economy_now() RETURNS timestamptz
        LANGUAGE sql VOLATILE SET search_path='' AS $$ SELECT '${weekAfter}'::timestamptz $$;`);
      expect((await snapshot(owner.client)).ownedChampionIds).toContain(championId);
      const selected = await owner.client.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: [championId],
        p_rune_ids: [],
        p_difficulty: 'normal',
      });
      expect(selected.error).toBeNull();
      const retained = await owner.client
        .from('champion_mastery')
        .select('*')
        .eq('player_id', player.data!.id)
        .single();
      expect(retained.error).toBeNull();
      expect(retained.data?.total_candies).toBe(183);
      expect(retained.data?.mastery_level).toBe(mastery.data?.mastery_level);
      expect(retained.data?.unlocked_ids).toEqual(mastery.data?.unlocked_ids);
    } finally {
      localSql(originalClock);
    }
  });

  it('credits one replay-verified reward under concurrent finalization and rejects metadata tampering', async () => {
    const owner = await account();
    const run = await attempt(owner.client);
    expect(run.claim.economy_version).toBe(1);
    expect(run.claim.champion_access_snapshot).toEqual(run.started.champion_access_snapshot);
    const result = verifiedResult(['Garen'], 1);
    const responses = await Promise.all([complete(run, result), complete(run, result)]);
    expect(responses.every((response) => !response.error)).toBe(true);
    expect(responses.map((response) => response.data.replayed).sort()).toEqual([false, true]);
    expect(responses.map((response) => response.data.shards_earned)).toEqual([25, 25]);
    expect((await snapshot(owner.client)).wallet).toEqual({
      shardsBalance: 25,
      lifetimeEarned: 25,
      lifetimeSpent: 0,
    });
    const forged = { ...result, economy: { ...result.economy, biomes_completed: 1 } };
    expect((await complete(run, forged)).error?.message).toContain('verified_result_conflict');
    expect((await snapshot(owner.client)).wallet?.shardsBalance).toBe(25);
    const attacker = await account();
    const unauthorized = await attacker.client.rpc('complete_run_verification', {
      p_attempt_id: run.id,
      p_lease_token: run.token,
      p_result: result,
      p_result_hash: null,
    });
    expect(unauthorized.error?.code).toBe('42501');
  });

  it('stores verified run counters without changing permanent reward formulas', async () => {
    const owner = await account();
    await credit(owner.id, 400);
    expect((await purchase(owner.client, 'Veigar')).error).toBeNull();
    const run = await attempt(owner.client, ['Veigar']);
    const base = verifiedResult(['Veigar'], 1);
    const withProgress = (progress: Record<string, number>) => ({
      ...base,
      team_members: base.team_members.map((member) => ({ ...member, run_progress: progress })),
    });
    const invalidCounters: Record<string, number>[] = [
      { 'veigar.phenomenal_power': -1 },
      { 'veigar.phenomenal_power': 0.5 },
      { 'constructor.counter': 1 },
    ];
    for (const progress of invalidCounters) {
      expect((await complete(run, withProgress(progress))).error?.message).toContain(
        'invalid_verified_run_progress',
      );
    }
    const result = withProgress({ 'veigar.phenomenal_power': 17 });
    const verified = await complete(run, result);
    expect(verified.error).toBeNull();
    expect(verified.data).toMatchObject({
      engine_version: 'run-engine-v22',
      gameplay_ruleset_version: 22,
      shards_earned: 25,
    });
    const stored = sqlJson<{ team_members: { run_progress: Record<string, number> }[] }>(
      `SELECT result FROM public.run_attempts WHERE id=${uuid(run.id)};`,
    );
    expect(stored.team_members[0].run_progress).toEqual({
      'veigar.phenomenal_power': 17,
    });
    const replayed = await complete(run, result);
    expect(replayed.error).toBeNull();
    expect(replayed.data.replayed).toBe(true);
    const control = await complete(await attempt(owner.client), verifiedResult(['Garen'], 1));
    expect(control.error).toBeNull();
    expect(verified.data.candies_earned).toBe(control.data.candies_earned);
  });

  it('awards zero for no completed wave and rolls back invalid replay metrics completely', async () => {
    const owner = await account();
    const run = await attempt(owner.client);
    const result = verifiedResult(['Garen'], 0);
    expect((await complete(run, { ...result, verified: false })).error?.message).toContain(
      'verified_result_required',
    );
    const invalid = { ...result, economy: { ...result.economy, biomes_completed: 1 } };
    expect((await complete(run, invalid)).error?.message).toContain('invalid_shard_reward_context');
    const pending = await owner.client
      .from('run_attempts')
      .select('status,result_run_id')
      .eq('id', run.id)
      .single();
    expect(pending.data).toEqual({ status: 'finished', result_run_id: null });
    const completed = await complete(run, result);
    expect(completed.error).toBeNull();
    expect(completed.data.shards_earned).toBe(0);
    expect((await snapshot(owner.client)).wallet?.shardsBalance).toBe(0);
    const ledger = await owner.client.from('shard_transactions').select('*');
    expect(ledger.data).toEqual([]);
  });

  it('awards the rotation bonus once per champion/period and preserves it after a purchase', async () => {
    const owner = await account();
    const state = await snapshot(owner.client);
    const championId = state.rotation!.championIds[0];
    await credit(owner.id, 400);
    expect((await purchase(owner.client, championId)).error).toBeNull();
    const firstRun = await attempt(owner.client, [championId]);
    const result = verifiedResult([championId], 30, 6, true);
    const first = await complete(firstRun, result);
    expect(first.error).toBeNull();
    const expected = calculateShardReward({
      wavesCompleted: 30,
      biomesCompleted: 6,
      won: true,
      teamChampionIds: [championId],
      rotationChampionIds: state.rotation!.championIds,
      claimedChampionIds: [],
    });
    expect(first.data.shards_earned).toBe(expected.totalShards);
    expect(first.data.shard_rotation_first_win_champion_ids).toEqual([championId]);
    const secondRun = await attempt(owner.client, [championId]);
    const second = await complete(secondRun, result);
    expect(second.error).toBeNull();
    expect(second.data.shards_earned).toBe(expected.baseShards);
    expect(second.data.shard_rotation_first_win_champion_ids).toEqual([]);
    expect((await snapshot(owner.client)).firstWinChampionIds).toEqual([championId]);
  });

  it('keeps every valid v1 base reward identical to the shared pure policy', () => {
    const cases = [
      { waves: 0, biomes: 0, won: false },
      ...[1, 20].flatMap((waves) =>
        Array.from({ length: 7 }, (_, biomes) =>
          [false, true].map((won) => ({ waves, biomes, won })),
        ).flat(),
      ),
    ];
    const values = cases.map(({ waves, biomes, won }) => `(${waves},${biomes},${won})`).join(',');
    const calculated = sqlJson<
      Array<{ waves: number; biomes: number; won: boolean; shards: number }>
    >(`
      SELECT json_agg(json_build_object('waves',waves,'biomes',biomes,'won',won,
        'shards',private.shard_reward_base_v1(waves,biomes,won))) FROM (VALUES ${values}) AS cases(waves,biomes,won);`);
    for (const item of calculated) {
      const expected = calculateShardReward({
        wavesCompleted: item.waves,
        biomesCompleted: item.biomes,
        won: item.won,
        teamChampionIds: [],
        rotationChampionIds: [],
        claimedChampionIds: [],
      });
      expect(item.shards).toBe(expected.baseShards);
    }
  });

  it('resolves ISO/year/DST period boundaries identically to the pure policy and freezes existing periods', () => {
    for (const instant of [
      '2026-12-27T23:59:59Z',
      '2026-12-28T00:00:00Z',
      '2027-01-03T23:59:59Z',
      '2027-01-04T00:00:00Z',
      '2026-03-23T00:00:00Z',
      '2026-03-30T00:00:00Z',
    ]) {
      const resolved = sqlJson<{
        id: string;
        startsAt: string;
        endsAt: string;
        championIds: string[];
      }>(
        `
        SET TIME ZONE 'Europe/Paris';
        DO $$ BEGIN PERFORM private.materialize_champion_rotation('${instant}'::timestamptz, 21::smallint, 1::smallint); END $$;
        SELECT json_build_object('id', rotation.id, 'startsAt', to_char(rotation.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'endsAt', to_char(rotation.ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'championIds', (SELECT json_agg(champion_id ORDER BY display_order) FROM public.champion_rotation_entries WHERE rotation_id=rotation.id))
        FROM public.champion_rotations AS rotation WHERE id=to_char('${instant}'::timestamptz AT TIME ZONE 'UTC','IYYY-"W"IW') || '-v1-r21';
      `,
      );
      const pure = getRotationForInstant(instant, 21);
      expect(resolved.id).toBe(pure.id);
      expect(new Date(resolved.startsAt).toISOString()).toBe(pure.startsAt);
      expect(new Date(resolved.endsAt).toISOString()).toBe(pure.endsAt);
      expect(resolved.championIds).toEqual(pure.championIds);
    }
    const materialized = sqlJson<string[]>(
      "SELECT json_agg(champion_id ORDER BY display_order) FROM public.champion_rotation_entries WHERE rotation_id='2026-W53-v1-r21';",
    );
    localSql(`INSERT INTO public.champion_economy_catalog SELECT 99, champion_id, 800, permanent_free FROM public.champion_economy_catalog WHERE catalog_version=1;
      DO $$ BEGIN PERFORM private.materialize_champion_rotation('2026-12-31T12:00:00Z',21::smallint,99::smallint); END $$;`);
    expect(
      sqlJson<string[]>(
        "SELECT json_agg(champion_id ORDER BY display_order) FROM public.champion_rotation_entries WHERE rotation_id='2026-W53-v1-r21';",
      ),
    ).toEqual(materialized);
    localSql('DELETE FROM public.champion_economy_catalog WHERE catalog_version=99;');
  });

  it('makes ledger history immutable and reconciliation read-only with consistent totals', async () => {
    const owner = await account();
    await credit(owner.id, 400);
    expect((await purchase(owner.client, 'Darius')).error).toBeNull();
    for (const operation of [
      `UPDATE public.shard_transactions SET amount=1 WHERE user_id=${uuid(owner.id)};`,
      `DELETE FROM public.shard_transactions WHERE user_id=${uuid(owner.id)};`,
    ]) {
      expect(() => localSql(operation)).toThrow();
    }
    const audit = await server.rpc('audit_champion_economy');
    expect(audit.error).toBeNull();
    expect(audit.data).toMatchObject({ dryRun: true, consistent: true, divergentWalletCount: 0 });
    expect((await owner.client.rpc('audit_champion_economy')).error?.code).toBe('42501');
    const ledger = await owner.client.from('shard_transactions').select('amount');
    const balance = (await snapshot(owner.client)).wallet!.shardsBalance;
    expect(ledger.data?.reduce((sum, transaction) => sum + transaction.amount, 0)).toBe(balance);
    localSql(`UPDATE public.account_wallets SET shards_balance=shards_balance+1,
      lifetime_shards_earned=lifetime_shards_earned+1 WHERE user_id=${uuid(owner.id)};`);
    try {
      const divergence = await server.rpc('audit_champion_economy');
      expect(divergence.error).toBeNull();
      expect(divergence.data).toMatchObject({
        dryRun: true,
        consistent: false,
        divergentWalletCount: 1,
      });
      expect((await snapshot(owner.client)).wallet?.shardsBalance).toBe(balance + 1);
    } finally {
      localSql(`UPDATE public.account_wallets SET shards_balance=shards_balance-1,
        lifetime_shards_earned=lifetime_shards_earned-1 WHERE user_id=${uuid(owner.id)};`);
    }
  });
});
