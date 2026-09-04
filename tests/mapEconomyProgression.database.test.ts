import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260831152608_gameplay_ruleset_v20_map_economy.sql',
    import.meta.url,
  ),
  'utf8',
);

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseCredentials = Boolean(supabaseUrl && anonKey && serviceRoleKey);

function championLedger(wavesParticipated: number, biomesParticipated: string[]) {
  return {
    waves_participated: wavesParticipated,
    biomes_participated: biomesParticipated,
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
}

function teamMember(championId: string, wavesParticipated: number, biomesParticipated: string[]) {
  return {
    champion_id: championId,
    waves_participated: wavesParticipated,
    biomes_participated: biomesParticipated,
    final_level: 2,
    final_hp: 100,
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

function useArchivedV20Identity(attemptId: string): void {
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl || !/^[0-9a-f-]{36}$/.test(attemptId)) {
    throw new Error('A local database URL and UUID attempt are required for the v20 fixture.');
  }
  execFileSync(
    'psql',
    [
      databaseUrl,
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      `UPDATE public.run_attempts
       SET engine_version = 'run-engine-v20',
           gameplay_ruleset_version = 20,
           gameplay_content_hash = '8308ebe66c3ee45850b68560b0449b6660b24c2a0e81a5070f6d1794620cac91'
       WHERE id = '${attemptId}'::UUID;`,
    ],
    { stdio: 'pipe' },
  );
}

describe('gameplay v20 progression migration', () => {
  it('publishes an append-only, service-only participation contract', () => {
    expect(migrationSql).toContain("'run-engine-v20'");
    expect(migrationSql).toContain("'2026-08-participation-rewards-v3'");
    expect(migrationSql).toContain('CHECK (ledger_version IN (1, 2))');
    expect(migrationSql).toContain("p_result -> 'ledger' ->> 'version' <> '2'");
    expect(migrationSql).toContain("'candies_by_champion', v_allocation");
    expect(migrationSql).toContain('ROW_NUMBER() OVER');
    expect(migrationSql).toContain('champion_id COLLATE "C"');
    expect(migrationSql).toContain('complete_run_verification_v19_contract');
    expect(migrationSql).toContain('FROM PUBLIC, anon, authenticated, service_role');
    expect(migrationSql).toContain('TO service_role;');
    expect(migrationSql).not.toMatch(/\b(?:DROP|TRUNCATE)\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});

const describeWithSupabase = hasSupabaseCredentials ? describe : describe.skip;

describeWithSupabase('gameplay v20 progression live contract', () => {
  it('allocates a fixed candy budget by participation exactly once', async () => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const userClient = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let userId: string | null = null;

    try {
      const signup = await userClient.auth.signUp({
        email: `participation-${suffix}@example.test`,
        password: 'Test-password-42!',
        options: { data: { username: `participation-${suffix}`.slice(0, 50) } },
      });
      expect(signup.error).toBeNull();
      userId = signup.data.user!.id;

      const started = await userClient.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: ['Garen'],
        p_rune_ids: [],
        p_difficulty: 'normal',
        p_mode: 'normal',
      });
      expect(started.error).toBeNull();
      expect(started.data).toMatchObject({
        engine_version: 'run-engine-v21',
        gameplay_ruleset_version: 21,
        ruleset_version: 3,
      });
      const attemptId = (started.data as { attempt_id: string }).attempt_id;

      const appended = await userClient.rpc('append_run_attempt_commands', {
        p_attempt_id: attemptId,
        p_commands: [
          {
            command_id: randomUUID(),
            sequence: 1,
            kind: 'abandon_run',
            payload: {},
          },
        ],
      });
      expect(appended.error).toBeNull();

      const sealed = await userClient.rpc('seal_run_attempt', {
        p_attempt_id: attemptId,
        p_finish_command_id: randomUUID(),
        p_expected_sequence: 1,
      });
      expect(sealed.error).toBeNull();

      const claim = await admin.rpc('claim_run_verification', {
        p_attempt_id: attemptId,
        p_worker_id: randomUUID(),
      });
      expect(claim.error).toBeNull();
      const leaseToken = (claim.data as { lease_token: string }).lease_token;

      const result = {
        verified: true,
        won: false,
        run_level: 2,
        waves_completed: 6,
        biomes_visited: ['top_lane', 'jungle'],
        gold_earned: 0,
        gold_spent: 0,
        gold_balance: 0,
        augment_ids: [],
        team_members: [
          teamMember('Garen', 6, ['top_lane', 'jungle']),
          teamMember('Lux', 1, ['jungle']),
        ],
        ledger: {
          version: 2,
          champions: {
            Garen: championLedger(6, ['top_lane', 'jungle']),
            Lux: championLedger(1, ['jungle']),
          },
          gold: { earned: 0, spent: 0 },
          items: [],
          next_item_event_sequence: 1,
        },
      };

      const completed = await admin.rpc('complete_run_verification', {
        p_attempt_id: attemptId,
        p_lease_token: leaseToken,
        p_result: result,
        p_result_hash: null,
      });
      expect(completed.error).toBeNull();
      expect(completed.data).toMatchObject({
        status: 'verified',
        replayed: false,
        candies_earned: 20,
        candies_per_champion: 0,
        candies_by_champion: { Garen: 15, Lux: 5 },
        progression_version: 3,
        gameplay_ruleset_version: 21,
        engine_version: 'run-engine-v21',
      });

      const replayed = await admin.rpc('complete_run_verification', {
        p_attempt_id: attemptId,
        p_lease_token: leaseToken,
        p_result: result,
        p_result_hash: null,
      });
      expect(replayed.error).toBeNull();
      expect(replayed.data).toMatchObject({
        replayed: true,
        candies_earned: 20,
        candies_by_champion: { Garen: 15, Lux: 5 },
      });

      const player = await admin
        .from('players')
        .select('id, total_candies')
        .eq('user_id', userId)
        .single();
      expect(player.error).toBeNull();
      expect(player.data!.total_candies).toBe(20);

      const run = await admin
        .from('runs')
        .select('id, candies_earned, ledger_version, run_ledger, progression_version')
        .eq('run_attempt_id', attemptId)
        .single();
      expect(run.error).toBeNull();
      expect(run.data).toMatchObject({
        candies_earned: 20,
        ledger_version: 2,
        run_ledger: result.ledger,
        progression_version: 3,
      });

      const members = await admin
        .from('run_team_members')
        .select('champion_id, waves_participated, biomes_participated')
        .eq('run_id', run.data!.id)
        .order('champion_id');
      expect(members.error).toBeNull();
      expect(members.data).toEqual([
        {
          champion_id: 'Garen',
          waves_participated: 6,
          biomes_participated: ['top_lane', 'jungle'],
        },
        { champion_id: 'Lux', waves_participated: 1, biomes_participated: ['jungle'] },
      ]);

      const mastery = await admin
        .from('champion_mastery')
        .select('champion_id, total_candies')
        .eq('player_id', player.data!.id)
        .in('champion_id', ['Garen', 'Lux'])
        .order('champion_id');
      expect(mastery.error).toBeNull();
      expect(mastery.data).toEqual([
        { champion_id: 'Garen', total_candies: 15 },
        { champion_id: 'Lux', total_candies: 5 },
      ]);
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  });

  it('keeps v20 attempts replayable through the private historical contract', async () => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const userClient = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let userId: string | null = null;

    try {
      const signup = await userClient.auth.signUp({
        email: `participation-v20-${suffix}@example.test`,
        password: 'Test-password-42!',
        options: { data: { username: `participation-v20-${suffix}`.slice(0, 50) } },
      });
      expect(signup.error).toBeNull();
      userId = signup.data.user!.id;

      const started = await userClient.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: ['Garen'],
        p_rune_ids: [],
        p_difficulty: 'normal',
        p_mode: 'normal',
      });
      expect(started.error).toBeNull();
      const attemptId = (started.data as { attempt_id: string }).attempt_id;

      useArchivedV20Identity(attemptId);

      const appended = await userClient.rpc('append_run_attempt_commands', {
        p_attempt_id: attemptId,
        p_commands: [{ command_id: randomUUID(), sequence: 1, kind: 'abandon_run', payload: {} }],
      });
      expect(appended.error).toBeNull();
      const sealed = await userClient.rpc('seal_run_attempt', {
        p_attempt_id: attemptId,
        p_finish_command_id: randomUUID(),
        p_expected_sequence: 1,
      });
      expect(sealed.error).toBeNull();
      const claim = await admin.rpc('claim_run_verification', {
        p_attempt_id: attemptId,
        p_worker_id: randomUUID(),
      });
      expect(claim.error).toBeNull();
      const leaseToken = (claim.data as { lease_token: string }).lease_token;
      const result = {
        verified: true,
        won: false,
        run_level: 2,
        waves_completed: 6,
        biomes_visited: ['top_lane', 'jungle'],
        gold_earned: 0,
        gold_spent: 0,
        gold_balance: 0,
        augment_ids: [],
        team_members: [teamMember('Garen', 6, ['top_lane', 'jungle'])],
        ledger: {
          version: 2,
          champions: { Garen: championLedger(6, ['top_lane', 'jungle']) },
          gold: { earned: 0, spent: 0 },
          items: [],
          next_item_event_sequence: 1,
        },
      };

      const completed = await admin.rpc('complete_run_verification', {
        p_attempt_id: attemptId,
        p_lease_token: leaseToken,
        p_result: result,
        p_result_hash: null,
      });
      expect(completed.error).toBeNull();
      expect(completed.data).toMatchObject({
        status: 'verified',
        replayed: false,
        candies_earned: 20,
        candies_by_champion: { Garen: 20 },
        progression_version: 3,
        gameplay_ruleset_version: 20,
        engine_version: 'run-engine-v20',
      });

      const replayed = await admin.rpc('complete_run_verification', {
        p_attempt_id: attemptId,
        p_lease_token: leaseToken,
        p_result: result,
        p_result_hash: null,
      });
      expect(replayed.error).toBeNull();
      expect(replayed.data).toMatchObject({
        replayed: true,
        gameplay_ruleset_version: 20,
        engine_version: 'run-engine-v20',
      });

      for (const client of [userClient, admin]) {
        const forbidden = await client.rpc('complete_run_verification_v20_contract', {
          p_attempt_id: attemptId,
          p_lease_token: leaseToken,
          p_result: result,
          p_result_hash: null,
        });
        expect(forbidden.error).not.toBeNull();
      }

      const persistedAttempt = await userClient
        .from('run_attempts')
        .select('engine_version, gameplay_ruleset_version, response')
        .eq('id', attemptId)
        .single();
      expect(persistedAttempt.error).toBeNull();
      expect(persistedAttempt.data).toMatchObject({
        engine_version: 'run-engine-v20',
        gameplay_ruleset_version: 20,
        response: {
          gameplay_ruleset_version: 20,
          engine_version: 'run-engine-v20',
        },
      });
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  });
});
