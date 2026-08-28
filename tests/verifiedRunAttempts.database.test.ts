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

type VerifiedMember = {
  champion_id: string;
  final_level: number;
  final_hp: number;
  kills: number;
  damage_dealt: number;
  items_collected: string[];
};

type LedgerItem = {
  sequence: number;
  action: string;
  source: string;
  item_id: string;
  instance_id: string;
  champion_id: string | null;
  gold_amount: number;
  node_id: string | null;
  wave: number;
};

function withRunLedger<T extends { gold_earned: number; team_members: VerifiedMember[] }>(
  result: T,
) {
  const teamMembers = result.team_members.map((member) => ({
    ...member,
    assists: 0,
    damage_to_shields: 0,
    damage_received: 0,
    healing_done: 0,
    healing_received: 0,
    overhealing: 0,
    shielding_done: 0,
    shielding_absorbed: 0,
    deaths: member.final_hp > 0 ? 0 : 1,
  }));
  return {
    ...result,
    gold_spent: 0,
    gold_balance: result.gold_earned,
    team_members: teamMembers,
    ledger: {
      version: 1,
      champions: Object.fromEntries(
        teamMembers.map((member) => [
          member.champion_id,
          {
            kills: member.kills,
            assists: member.assists,
            damage_dealt: member.damage_dealt,
            damage_to_shields: member.damage_to_shields,
            damage_received: member.damage_received,
            healing_done: member.healing_done,
            healing_received: member.healing_received,
            overhealing: member.overhealing,
            shielding_done: member.shielding_done,
            shielding_absorbed: member.shielding_absorbed,
            deaths: member.deaths,
          },
        ]),
      ),
      gold: { earned: result.gold_earned, spent: 0 },
      items: [] as LedgerItem[],
      next_item_event_sequence: 1,
    },
  };
}

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
    expect(migrationSql).toContain('IF v_waves_completed > 0 THEN');
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
        p_team: ['Garen', 'Annie', 'Ashe', 'Lux'],
        p_rune_ids: [],
        p_difficulty: 'normal',
        p_mode: 'normal',
      });
      expect(oversizedStarter.error?.message).toContain('invalid_starter_count');

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
        mastery_snapshot: Record<string, number>;
      };
      expect(start).toMatchObject({
        status: 'started',
        engine_version: 'run-engine-v18',
      });
      expect(start.seed).toBeGreaterThan(0);
      expect(start.enhancement_snapshot).toHaveProperty('Garen');
      expect(start.enhancement_snapshot).toHaveProperty('Warwick');
      expect(start.mastery_snapshot).toMatchObject({ Garen: 0, Warwick: 0 });

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
        engine_version: 'run-engine-v18',
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

      const verifiedResult = withRunLedger({
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
            items_collected: ['long_sword'],
          },
        ],
      });
      Object.assign(verifiedResult.team_members[0], {
        assists: 2,
        damage_to_shields: 7,
        damage_received: 31,
        healing_done: 12,
        healing_received: 9,
        overhealing: 4,
        shielding_done: 18,
        shielding_absorbed: 11,
      });
      Object.assign(verifiedResult.ledger.champions.Garen, {
        assists: 2,
        damage_to_shields: 7,
        damage_received: 31,
        healing_done: 12,
        healing_received: 9,
        overhealing: 4,
        shielding_done: 18,
        shielding_absorbed: 11,
      });
      verifiedResult.gold_spent = 3;
      verifiedResult.gold_balance = 7;
      verifiedResult.ledger.gold.spent = 3;
      verifiedResult.ledger.items = [
        {
          sequence: 1,
          action: 'bought',
          source: 'shop',
          item_id: 'long_sword',
          instance_id: 'item-1',
          champion_id: null,
          gold_amount: 3,
          node_id: 'shop-1',
          wave: 1,
        },
      ];
      verifiedResult.ledger.next_item_event_sequence = 2;
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
      expect(completions.map(({ error }) => error?.message ?? null)).toEqual([null, null]);
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
          gold_earned: 10,
          gold_spent: 3,
          gold_balance: 7,
          champion_stats: [
            {
              champion_id: 'Garen',
              assists: 2,
              damage_to_shields: 7,
              damage_received: 31,
              healing_done: 12,
              overhealing: 4,
              shielding_done: 18,
              shielding_absorbed: 11,
              items_collected: ['long_sword'],
            },
          ],
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
        .select(
          'progression_source, candies_earned, run_attempt_id, gold_earned, total_gold_spent, gold_balance, items_purchased, total_assists, total_damage_to_shields, total_damage_received, total_healing_done, total_overhealing, total_shielding_done, total_shielding_absorbed, run_ledger',
        )
        .eq('run_attempt_id', start.attempt_id)
        .single();
      expect(persistedRun.error).toBeNull();
      expect(persistedRun.data).toMatchObject({
        progression_source: 'verified',
        candies_earned: 13,
        run_attempt_id: start.attempt_id,
        gold_earned: 10,
        total_gold_spent: 3,
        gold_balance: 7,
        items_purchased: 1,
        total_assists: 2,
        total_damage_to_shields: 7,
        total_damage_received: 31,
        total_healing_done: 12,
        total_overhealing: 4,
        total_shielding_done: 18,
        total_shielding_absorbed: 11,
        run_ledger: verifiedResult.ledger,
      });

      const persistedMember = await admin
        .from('run_team_members')
        .select(
          'final_hp, assists, damage_to_shields, damage_received, healing_done, healing_received, overhealing, shielding_done, shielding_absorbed, items_collected',
        )
        .eq('run_id', (completionReplay.data as { run_id: string }).run_id)
        .single();
      expect(persistedMember.error).toBeNull();
      expect(persistedMember.data).toEqual({
        final_hp: 100,
        assists: 2,
        damage_to_shields: 7,
        damage_received: 31,
        healing_done: 12,
        healing_received: 9,
        overhealing: 4,
        shielding_done: 18,
        shielding_absorbed: 11,
        items_collected: ['long_sword'],
      });

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

      const zeroWaveStart = await userClient.rpc('start_run_attempt', {
        ...startArgs,
        p_command_id: randomUUID(),
        p_team: ['Annie'],
      });
      expect(zeroWaveStart.error).toBeNull();
      const zeroWaveAttemptId = (zeroWaveStart.data as { attempt_id: string }).attempt_id;
      expect(
        (
          await userClient.rpc('append_run_attempt_commands', {
            p_attempt_id: zeroWaveAttemptId,
            p_commands: [
              {
                command_id: randomUUID(),
                sequence: 1,
                kind: 'abandon_run',
                payload: {},
              },
            ],
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await userClient.rpc('seal_run_attempt', {
            p_attempt_id: zeroWaveAttemptId,
            p_finish_command_id: randomUUID(),
            p_expected_sequence: 1,
          })
        ).error,
      ).toBeNull();
      const zeroWaveClaim = await admin.rpc('claim_run_verification', {
        p_attempt_id: zeroWaveAttemptId,
        p_worker_id: randomUUID(),
      });
      expect(zeroWaveClaim.error).toBeNull();
      const zeroWaveCompletion = await admin.rpc('complete_run_verification', {
        p_attempt_id: zeroWaveAttemptId,
        p_lease_token: (zeroWaveClaim.data as { lease_token: string }).lease_token,
        p_result: withRunLedger({
          won: false,
          run_level: 1,
          waves_completed: 0,
          biomes_visited: [],
          gold_earned: 0,
          augment_ids: [],
          team_members: [
            {
              champion_id: 'Annie',
              final_level: 1,
              final_hp: 100,
              kills: 0,
              damage_dealt: 0,
              items_collected: [],
            },
          ],
        }),
        p_result_hash: null,
      });
      expect(zeroWaveCompletion.error).toBeNull();
      expect(zeroWaveCompletion.data).toMatchObject({
        candies_earned: 0,
        summary: { waves_completed: 0 },
      });

      const lateDefeatStart = await userClient.rpc('start_run_attempt', {
        ...startArgs,
        p_command_id: randomUUID(),
        p_team: ['Warwick'],
      });
      expect(lateDefeatStart.error).toBeNull();
      const lateDefeatAttemptId = (lateDefeatStart.data as { attempt_id: string }).attempt_id;
      expect(
        (
          await userClient.rpc('append_run_attempt_commands', {
            p_attempt_id: lateDefeatAttemptId,
            p_commands: [
              {
                command_id: randomUUID(),
                sequence: 1,
                kind: 'abandon_run',
                payload: {},
              },
            ],
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await userClient.rpc('seal_run_attempt', {
            p_attempt_id: lateDefeatAttemptId,
            p_finish_command_id: randomUUID(),
            p_expected_sequence: 1,
          })
        ).error,
      ).toBeNull();
      const lateDefeatClaim = await admin.rpc('claim_run_verification', {
        p_attempt_id: lateDefeatAttemptId,
        p_worker_id: randomUUID(),
      });
      expect(lateDefeatClaim.error).toBeNull();
      const lateDefeatCompletion = await admin.rpc('complete_run_verification', {
        p_attempt_id: lateDefeatAttemptId,
        p_lease_token: (lateDefeatClaim.data as { lease_token: string }).lease_token,
        p_result: withRunLedger({
          won: false,
          run_level: 2,
          waves_completed: 2,
          biomes_visited: ['top_lane', 'jungle'],
          gold_earned: 125,
          augment_ids: [],
          team_members: [
            {
              champion_id: 'Warwick',
              final_level: 2,
              final_hp: 0,
              kills: 2,
              damage_dealt: 500,
              items_collected: [],
            },
          ],
        }),
        p_result_hash: null,
      });
      expect(lateDefeatCompletion.error).toBeNull();
      expect(lateDefeatCompletion.data).toMatchObject({
        status: 'verified',
        progression_version: 2,
        summary: {
          won: false,
          run_level: 2,
          biomes_visited: ['top_lane', 'jungle'],
        },
      });
      const lateDefeatRun = await admin
        .from('runs')
        .select('run_level, progression_version, progression_payload_hash')
        .eq('run_attempt_id', lateDefeatAttemptId)
        .single();
      expect(lateDefeatRun.error).toBeNull();
      expect(lateDefeatRun.data).toMatchObject({
        run_level: 2,
        progression_version: 2,
        progression_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      });

      const stackedVictoryStart = await userClient.rpc('start_run_attempt', {
        ...startArgs,
        p_command_id: randomUUID(),
        p_team: ['Warwick'],
      });
      expect(stackedVictoryStart.error).toBeNull();
      const stackedVictoryAttemptId = (stackedVictoryStart.data as { attempt_id: string })
        .attempt_id;
      expect(
        (
          await userClient.rpc('append_run_attempt_commands', {
            p_attempt_id: stackedVictoryAttemptId,
            p_commands: [
              {
                command_id: randomUUID(),
                sequence: 1,
                kind: 'abandon_run',
                payload: {},
              },
            ],
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await userClient.rpc('seal_run_attempt', {
            p_attempt_id: stackedVictoryAttemptId,
            p_finish_command_id: randomUUID(),
            p_expected_sequence: 1,
          })
        ).error,
      ).toBeNull();
      const stackedVictoryClaim = await admin.rpc('claim_run_verification', {
        p_attempt_id: stackedVictoryAttemptId,
        p_worker_id: randomUUID(),
      });
      expect(stackedVictoryClaim.error).toBeNull();
      const stackedVictoryCompletion = await admin.rpc('complete_run_verification', {
        p_attempt_id: stackedVictoryAttemptId,
        p_lease_token: (stackedVictoryClaim.data as { lease_token: string }).lease_token,
        p_result: withRunLedger({
          verified: true,
          won: true,
          run_level: 6,
          waves_completed: 20,
          biomes_visited: ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'],
          gold_earned: 1160,
          augment_ids: ['warlord', 'iron_skin', 'battle_hardened', 'warlord', 'swift_feet'],
          team_members: [
            {
              champion_id: 'Warwick',
              final_level: 9,
              final_hp: 511,
              kills: 22,
              damage_dealt: 13071,
              items_collected: ['sunfire_aegis', 'dagger', 'cloth_armor', 'long_sword'],
            },
          ],
        }),
        p_result_hash: null,
      });
      expect(stackedVictoryCompletion.error).toBeNull();
      expect(stackedVictoryCompletion.data).toMatchObject({
        status: 'verified',
        progression_version: 2,
        summary: {
          won: true,
          run_level: 6,
          waves_completed: 20,
        },
      });
      const stackedVictoryRun = await admin
        .from('runs')
        .select('augment_ids, progression_payload_hash')
        .eq('run_attempt_id', stackedVictoryAttemptId)
        .single();
      expect(stackedVictoryRun.error).toBeNull();
      expect(stackedVictoryRun.data).toMatchObject({
        augment_ids: ['warlord', 'iron_skin', 'battle_hardened', 'warlord', 'swift_feet'],
        progression_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
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
        total_runs_completed: 4,
        total_waves_completed: 23,
        total_candies: 76,
      });
    } finally {
      if (userId) await admin.auth.admin.deleteUser(userId);
      await userClient.auth.signOut();
    }
  }, 25000);
});
