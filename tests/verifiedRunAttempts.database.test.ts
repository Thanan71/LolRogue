import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const migrationSql = readFileSync(
  new URL('../supabase/migrations/20260724090000_verified_run_attempts.sql', import.meta.url),
  'utf8',
);
const hardeningSql = readFileSync(
  new URL(
    '../supabase/migrations/20260724190000_harden_verified_attempt_contract.sql',
    import.meta.url,
  ),
  'utf8',
);
const protectedRunStartSql = readFileSync(
  new URL('../supabase/migrations/20260726220000_protect_active_run_start.sql', import.meta.url),
  'utf8',
);

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseCredentials = Boolean(supabaseUrl && anonKey && serviceRoleKey);

describe('verified run attempt migration', () => {
  it('is append-only and records the non-destructive historical baseline', () => {
    expect(migrationSql).toContain('BEGIN;');
    expect(migrationSql).toContain('COMMIT;');
    expect(migrationSql).not.toMatch(/\b(?:DROP|TRUNCATE)\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migrationSql).toContain('CREATE TABLE public.progression_security_baselines');
    expect(migrationSql).toContain('grandfather_legacy_no_retroactive_reset');
    expect(migrationSql).toContain('No retroactive reset is performed');
  });

  it('pins the gameplay runtime and only admits engine-supported content', () => {
    expect(migrationSql).toContain('CREATE TABLE public.gameplay_rulesets');
    expect(migrationSql).toContain("'run-engine-v1'");
    expect(migrationSql).toContain('gameplay_content_hash');
    for (const champion of [
      'Garen',
      'Annie',
      'Ashe',
      'Darius',
      'Lux',
      'Soraka',
      'Jinx',
      'Leona',
      'Malphite',
      'Warwick',
    ]) {
      expect(migrationSql).toContain(`(1, 'champion', '${champion}')`);
    }
    expect(migrationSql).toContain("'unsupported_initial_champion'");
  });

  it('exposes only narrow authenticated commands and service-only verification', () => {
    for (const signature of [
      'public.start_run_attempt(UUID, TEXT[], TEXT[], TEXT, TEXT)',
      'public.append_run_attempt_commands(UUID, JSONB)',
      'public.seal_run_attempt(UUID, UUID, INTEGER)',
      'public.get_run_attempt_status(UUID)',
    ]) {
      expect(migrationSql).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
      expect(migrationSql).toContain('TO authenticated;');
    }
    for (const signature of [
      'public.claim_run_verification(UUID, UUID)',
      'public.complete_run_verification(UUID, UUID, JSONB, TEXT)',
      'public.reject_run_verification(UUID, UUID, TEXT)',
    ]) {
      expect(migrationSql).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
    }
    expect(migrationSql).toContain(
      'REVOKE ALL ON FUNCTION public.save_completed_run_v2(JSONB, JSONB, TEXT[], TEXT[])',
    );
    expect(migrationSql).toContain('FROM PUBLIC, anon, authenticated, service_role');
    expect(migrationSql).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL).*run_attempts.*authenticated/is,
    );
  });

  it('keeps an immutable ordered journal and credits only verified results', () => {
    expect(migrationSql).toContain('CREATE TABLE public.run_attempt_commands');
    expect(migrationSql).toContain('PRIMARY KEY (attempt_id, sequence)');
    expect(migrationSql).toContain('UNIQUE (attempt_id, command_id)');
    expect(migrationSql).toContain("'non_contiguous_command_batch'");
    expect(migrationSql).toContain("'run_command_sequence_expected:%'");
    expect(migrationSql).toContain("'journal_integrity_error'");
    expect(migrationSql).toContain("'progression_source', 'verified'");
    expect(migrationSql).toContain("'verified',");
    expect(migrationSql).toContain('total_candies = total_candies + v_total_candies');
    expect(migrationSql).toContain('ON CONFLICT (player_id, champion_id) DO UPDATE SET');
    expect(migrationSql).toContain('result_run_id = v_run_id');
  });

  it('enforces the reachable starter contract and quarantines unattested enhancements', () => {
    expect(hardeningSql).toContain('verified_run_requires_one_starter');
    expect(hardeningSql).toContain('invalid_verified_starter_runes');
    expect(hardeningSql).toContain('progression_enhancement_security_baselines');
    expect(hardeningSql).toContain('quarantine_unattested_ranks_preserve_audit_copy');
    expect(hardeningSql).toContain("command.command_type = 'enhancement_unlock'");
    expect(hardeningSql).toContain('CREATE FUNCTION public.expire_stale_run_attempts()');
    expect(hardeningSql).not.toMatch(/\b(?:DROP|TRUNCATE)\s+TABLE\b/i);
    expect(hardeningSql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('keeps one attempt open through verification and derives starter slots from mastery', () => {
    expect(protectedRunStartSql).toContain("'started', 'finished', 'verifying'");
    expect(protectedRunStartSql).toContain('reject_concurrent_run_attempt_start');
    expect(protectedRunStartSql).toContain("'starter_slot_2'");
    expect(protectedRunStartSql).toContain("'starter_slot_3'");
    expect(protectedRunStartSql).toContain("'starter_slots_locked'");
  });
});

const describeWithSupabase = hasSupabaseCredentials ? describe : describe.skip;

describeWithSupabase('verified run attempt live security', () => {
  it('allows earned starter slots while keeping concurrent starts closed', async () => {
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
        email: `starter-slots-${suffix}@example.test`,
        password: 'Test-password-42!',
        options: { data: { username: `slots-${suffix}`.slice(0, 50) } },
      });
      expect(signup.error).toBeNull();
      userId = signup.data.user!.id;

      const profile = await admin.from('players').select('id').eq('user_id', userId).single();
      expect(profile.error).toBeNull();
      const mastery = await admin.from('champion_mastery').insert({
        player_id: profile.data!.id,
        champion_id: 'Garen',
        total_candies: 50,
        mastery_level: 1,
        current_level_candies: 0,
        unlocked_ids: ['starter_slot_2'],
      });
      expect(mastery.error).toBeNull();

      const started = await userClient.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: ['Garen', 'Annie'],
        p_rune_ids: [],
        p_difficulty: 'normal',
        p_mode: 'normal',
      });
      expect(started.error).toBeNull();

      const concurrent = await userClient.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: ['Lux'],
        p_rune_ids: [],
        p_difficulty: 'normal',
        p_mode: 'normal',
      });
      expect(concurrent.error?.message).toContain('run_attempt_already_open');
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
    }
  });

  it('denies client forgery and credits one claimed result exactly once', async () => {
    const admin = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const userClient = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `verified-attempt-${suffix}@example.test`;
    let userId: string | null = null;

    try {
      const signup = await userClient.auth.signUp({
        email,
        password: 'Test-password-42!',
        options: {
          data: {
            username: `verified-${suffix}`.slice(0, 50),
            display_name: 'Verified Attempt Test',
          },
        },
      });
      expect(signup.error).toBeNull();
      expect(signup.data.session).not.toBeNull();
      userId = signup.data.user!.id;

      const legacy = await userClient.rpc('save_completed_run_v2', {
        p_run: {},
        p_team_members: [],
        p_rune_ids: [],
        p_augment_ids: [],
      });
      expect(legacy.error).not.toBeNull();

      const unsupported = await userClient.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: ['Aatrox'],
        p_rune_ids: [],
        p_difficulty: 'normal',
        p_mode: 'normal',
      });
      expect(unsupported.error?.message).toContain('unsupported_initial_champion');

      const oversizedStarter = await userClient.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: ['Garen', 'Annie'],
        p_rune_ids: [],
        p_difficulty: 'normal',
        p_mode: 'normal',
      });
      expect(oversizedStarter.error?.message).toContain('starter_slots_locked');

      const nonKeystoneRune = await userClient.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: ['Garen'],
        p_rune_ids: ['triumph'],
        p_difficulty: 'normal',
        p_mode: 'normal',
      });
      expect(nonKeystoneRune.error?.message).toContain('invalid_verified_starter_runes');

      const startCommandId = randomUUID();
      const startArgs = {
        p_command_id: startCommandId,
        p_team: ['Garen'],
        p_rune_ids: ['press_the_attack'],
        p_difficulty: 'normal',
        p_mode: 'normal',
      };
      const started = await userClient.rpc('start_run_attempt', startArgs);
      expect(started.error).toBeNull();
      const start = started.data as {
        attempt_id: string;
        seed: number;
        status: string;
        engine_version: string;
        enhancement_snapshot: Record<string, Record<string, number>>;
      };
      expect(start).toMatchObject({
        status: 'started',
        engine_version: 'run-engine-v1',
      });
      expect(start.seed).toBeGreaterThan(0);
      expect(start.enhancement_snapshot).toHaveProperty('Garen');
      expect(start.enhancement_snapshot).toHaveProperty('Warwick');

      const startReplay = await userClient.rpc('start_run_attempt', startArgs);
      expect(startReplay.error).toBeNull();
      expect(startReplay.data).toMatchObject({
        attempt_id: start.attempt_id,
        seed: start.seed,
        replayed: true,
      });

      const directMutation = await userClient
        .from('run_attempts')
        .update({ seed: 1 })
        .eq('id', start.attempt_id);
      expect(directMutation.error).not.toBeNull();

      const commandId = randomUUID();
      const commands = [
        {
          command_id: commandId,
          sequence: 1,
          kind: 'move_node',
          payload: { node_id: 'top_lane_1' },
        },
      ];
      const appended = await userClient.rpc('append_run_attempt_commands', {
        p_attempt_id: start.attempt_id,
        p_commands: commands,
      });
      expect(appended.error).toBeNull();
      expect(appended.data).toMatchObject({ accepted: 1, last_sequence: 1, replayed: false });

      const appendReplay = await userClient.rpc('append_run_attempt_commands', {
        p_attempt_id: start.attempt_id,
        p_commands: commands,
      });
      expect(appendReplay.error).toBeNull();
      expect(appendReplay.data).toMatchObject({ accepted: 0, last_sequence: 1, replayed: true });

      const finishCommandId = randomUUID();
      const sealed = await userClient.rpc('seal_run_attempt', {
        p_attempt_id: start.attempt_id,
        p_finish_command_id: finishCommandId,
        p_expected_sequence: 1,
      });
      expect(sealed.error).toBeNull();
      expect(sealed.data).toMatchObject({ status: 'finished', accepted: true });

      const forbiddenClaim = await userClient.rpc('claim_run_verification', {
        p_attempt_id: start.attempt_id,
        p_worker_id: randomUUID(),
      });
      expect(forbiddenClaim.error).not.toBeNull();

      const firstWorkerId = randomUUID();
      const claim = await admin.rpc('claim_run_verification', {
        p_attempt_id: start.attempt_id,
        p_worker_id: firstWorkerId,
      });
      expect(claim.error).toBeNull();
      expect(claim.data).toMatchObject({
        attempt_id: start.attempt_id,
        claimed: true,
        engine_version: 'run-engine-v1',
      });
      const leaseToken = (claim.data as { lease_token: string }).lease_token;

      const concurrentClaim = await admin.rpc('claim_run_verification', {
        p_attempt_id: start.attempt_id,
        p_worker_id: randomUUID(),
      });
      expect(concurrentClaim.error).toBeNull();
      expect(concurrentClaim.data).toMatchObject({
        status: 'finished',
        claimed: false,
        in_progress: true,
      });

      const verifiedResult = {
        won: false,
        run_level: 1,
        waves_completed: 1,
        biomes_visited: ['top_lane'],
        gold_earned: 10,
        augment_ids: [],
        team_members: [
          {
            champion_id: 'Garen',
            final_level: 1,
            final_hp: 100,
            kills: 1,
            damage_dealt: 50,
            items_collected: [],
          },
        ],
      };
      const completions = await Promise.all(
        [null, null].map(() =>
          admin.rpc('complete_run_verification', {
            p_attempt_id: start.attempt_id,
            p_lease_token: leaseToken,
            p_result: verifiedResult,
            p_result_hash: null,
          }),
        ),
      );
      expect(completions.every(({ error }) => error === null)).toBe(true);
      expect(
        completions
          .map(({ data }) => (data as { replayed: boolean }).replayed)
          .sort((left, right) => Number(left) - Number(right)),
      ).toEqual([false, true]);
      const completed = completions.find(({ data }) => !(data as { replayed: boolean }).replayed)!;
      expect(completed.data).toMatchObject({
        status: 'verified',
        candies_earned: 13,
        progression_source: 'verified',
        replayed: false,
        summary: {
          won: false,
          waves_completed: 1,
          total_kills: 1,
          total_damage: 50,
        },
      });

      const completionReplay = await admin.rpc('complete_run_verification', {
        p_attempt_id: start.attempt_id,
        p_lease_token: leaseToken,
        p_result: verifiedResult,
        p_result_hash: null,
      });
      expect(completionReplay.error).toBeNull();
      expect(completionReplay.data).toMatchObject({
        candies_earned: 13,
        replayed: true,
      });

      const persistedRun = await admin
        .from('runs')
        .select('progression_source, candies_earned, run_attempt_id')
        .eq('run_attempt_id', start.attempt_id)
        .single();
      expect(persistedRun.error).toBeNull();
      expect(persistedRun.data).toMatchObject({
        progression_source: 'verified',
        candies_earned: 13,
        run_attempt_id: start.attempt_id,
      });

      const persistedMember = await admin
        .from('run_team_members')
        .select('final_hp')
        .eq('run_id', (completionReplay.data as { run_id: string }).run_id)
        .single();
      expect(persistedMember.error).toBeNull();
      expect(persistedMember.data).toEqual({ final_hp: 100 });

      const player = await admin
        .from('players')
        .select('total_runs_completed, total_waves_completed, total_candies')
        .eq('user_id', userId)
        .single();
      expect(player.error).toBeNull();
      expect(player.data).toMatchObject({
        total_runs_completed: 1,
        total_waves_completed: 1,
        total_candies: 13,
      });

      const rejectedStart = await userClient.rpc('start_run_attempt', {
        ...startArgs,
        p_command_id: randomUUID(),
        p_team: ['Annie'],
      });
      expect(rejectedStart.error).toBeNull();
      const rejectedAttemptId = (rejectedStart.data as { attempt_id: string }).attempt_id;
      const rejectedAppend = await userClient.rpc('append_run_attempt_commands', {
        p_attempt_id: rejectedAttemptId,
        p_commands: [
          {
            command_id: randomUUID(),
            sequence: 1,
            kind: 'abandon_run',
            payload: {},
          },
        ],
      });
      expect(rejectedAppend.error).toBeNull();
      const rejectedSeal = await userClient.rpc('seal_run_attempt', {
        p_attempt_id: rejectedAttemptId,
        p_finish_command_id: randomUUID(),
        p_expected_sequence: 1,
      });
      expect(rejectedSeal.error).toBeNull();
      const rejectedClaim = await admin.rpc('claim_run_verification', {
        p_attempt_id: rejectedAttemptId,
        p_worker_id: randomUUID(),
      });
      expect(rejectedClaim.error).toBeNull();
      const rejectedLease = (rejectedClaim.data as { lease_token: string }).lease_token;
      const rejected = await admin.rpc('reject_run_verification', {
        p_attempt_id: rejectedAttemptId,
        p_lease_token: rejectedLease,
        p_rejection_code: 'invalid_trace',
      });
      expect(rejected.error).toBeNull();
      expect(rejected.data).toMatchObject({
        status: 'rejected',
        rejection_code: 'invalid_trace',
        replayed: false,
      });
      const rejectedReplay = await admin.rpc('reject_run_verification', {
        p_attempt_id: rejectedAttemptId,
        p_lease_token: rejectedLease,
        p_rejection_code: 'invalid_trace',
      });
      expect(rejectedReplay.error).toBeNull();
      expect(rejectedReplay.data).toMatchObject({ status: 'rejected', replayed: true });

      const afterRejection = await admin
        .from('players')
        .select('total_runs_completed, total_waves_completed, total_candies')
        .eq('user_id', userId)
        .single();
      expect(afterRejection.data).toMatchObject({
        total_runs_completed: 1,
        total_waves_completed: 1,
        total_candies: 13,
      });
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
      await userClient.auth.signOut();
    }
  }, 15000);
});
