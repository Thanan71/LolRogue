import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_AUTHORITY_VERSION,
  hasAuthorityFeature,
  isKnownAuthorityEngine,
} from '@/game/authority/versionRegistry';
import {
  SupabaseDailyRunRepository,
  SupabaseLeaderboardRepository,
} from '@/services/repositories/SupabaseDailyRunRepository';
import { SupabaseEnhancementRepository } from '@/services/repositories/SupabaseEnhancementRepository';
import { SupabaseMasteryRepository } from '@/services/repositories/SupabaseMasteryRepository';
import { SupabasePlayerRepository } from '@/services/repositories/SupabasePlayerRepository';
import { SupabaseRunRepository } from '@/services/repositories/SupabaseRunRepository';
import type { Database, Json } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseCredentials = Boolean(supabaseUrl && anonKey && serviceRoleKey);
const describeLive = hasSupabaseCredentials ? describe.sequential : describe.skip;

type AuthenticatedFixture = {
  client: SupabaseClient<Database>;
  engineVersion: string;
  gameplayRulesetVersion: number;
  playerId: string;
  progressionRulesetVersion: number;
  runId: string;
  suffix: string;
  userId: string;
};

async function createAuthenticatedFixture(
  admin: SupabaseClient<Database>,
): Promise<AuthenticatedFixture> {
  const suffix = randomUUID().replace(/-/g, '');
  const client = createClient<Database>(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signup = await client.auth.signUp({
    email: `repository-${suffix}@example.test`,
    password: 'Test-password-42!',
    options: {
      data: {
        username: `repository-${suffix}`.slice(0, 50),
        display_name: `Repository ${suffix}`.slice(0, 100),
      },
    },
  });
  if (signup.error || !signup.data.user || !signup.data.session) {
    throw signup.error ?? new Error('Repository integration user did not receive a session');
  }

  const userId = signup.data.user.id;
  const player = await admin
    .from('players')
    .update({
      total_candies: 250,
      total_runs_completed: 5,
      total_waves_completed: 24,
      total_wins: 4,
    })
    .eq('user_id', userId)
    .select('id')
    .single();
  if (player.error || !player.data) throw player.error ?? new Error('Player fixture is missing');

  const started = await client.rpc('start_run_attempt', {
    p_command_id: randomUUID(),
    p_difficulty: 'hard',
    p_mode: 'normal',
    p_rune_ids: [],
    p_team: ['Garen'],
  });
  if (started.error || !started.data || typeof started.data !== 'object') {
    throw started.error ?? new Error('Run attempt fixture did not start');
  }
  const attemptId = (started.data as Record<string, unknown>).attempt_id;
  if (typeof attemptId !== 'string') throw new Error('Run attempt fixture has no attempt_id');

  const attempt = await client
    .from('run_attempts')
    .select('id, engine_version, gameplay_ruleset_version, ruleset_version')
    .eq('id', attemptId)
    .single();
  if (attempt.error || !attempt.data) {
    throw attempt.error ?? new Error('Run attempt fixture is missing');
  }

  const run = await admin
    .from('runs')
    .insert({
      candies_earned: 42,
      gold_earned: 500,
      player_id: player.data.id,
      progression_source: 'legacy',
      run_attempt_id: attemptId,
      run_level: 4,
      run_uuid: `repository_${randomUUID()}`,
      seed: 8675309,
      total_damage_dealt: 12345,
      total_kills: 17,
      waves_completed: 7,
      won: true,
    })
    .select('id')
    .single();
  if (run.error || !run.data) throw run.error ?? new Error('Run fixture is missing');

  const fixtures = await Promise.all([
    admin.from('run_team_members').insert({
      champion_id: 'Garen',
      damage_dealt: 12345,
      final_hp: 900,
      final_level: 6,
      kills: 17,
      run_id: run.data.id,
      survived: true,
    }),
    admin.from('champion_mastery').insert({
      champion_id: 'Garen',
      current_level_candies: 25,
      games_played: 3,
      games_won: 2,
      mastery_level: 2,
      player_id: player.data.id,
      total_candies: 125,
    }),
    admin.from('champion_enhancements').insert({
      champion_id: 'Garen',
      total_candies_spent: 20,
      unlocked_nodes: { fighter_core_1: 1 },
      user_id: userId,
    }),
  ]);
  const fixtureError = fixtures.find((result) => result.error)?.error;
  if (fixtureError) throw fixtureError;

  return {
    client,
    engineVersion: attempt.data.engine_version,
    gameplayRulesetVersion: attempt.data.gameplay_ruleset_version,
    playerId: player.data.id,
    progressionRulesetVersion: attempt.data.ruleset_version,
    runId: run.data.id,
    suffix,
    userId,
  };
}

function clientLogPayload(repository: string): Json {
  return {
    details: { contract: 'repository-integration' },
    duration_ms: 12,
    level: 'info',
    method: 'load',
    operation: 'select',
    repository,
    session_id: randomUUID(),
    table_name: 'runs',
  };
}

describeLive('repositories against migrated local Supabase', () => {
  let admin: SupabaseClient<Database>;
  let anonymous: SupabaseClient<Database>;
  let fixture: AuthenticatedFixture;

  beforeAll(async () => {
    admin = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    fixture = await createAuthenticatedFixture(admin);
  });

  afterAll(async () => {
    if (fixture?.userId) await admin.auth.admin.deleteUser(fixture.userId);
  });

  it('recognizes the active database authority contract in the rollback client', async () => {
    expect(fixture.gameplayRulesetVersion).toBe(CURRENT_AUTHORITY_VERSION.gameplay);
    expect(fixture.engineVersion).toBe(CURRENT_AUTHORITY_VERSION.engine);
    expect(isKnownAuthorityEngine(fixture.engineVersion)).toBe(true);
    expect(hasAuthorityFeature(fixture.engineVersion, 'manualCombat')).toBe(true);
    expect(hasAuthorityFeature(fixture.engineVersion, 'canonicalEncounters')).toBe(true);
  });

  it('reads and updates a real authenticated profile while preserving real null semantics', async () => {
    const repository = new SupabasePlayerRepository(fixture.client);

    const initial = await repository.getPlayer(fixture.userId);
    expect(initial.error).toBeNull();
    expect(initial.data).toMatchObject({ id: fixture.playerId, total_candies: 250 });

    const updated = await repository.updateProfile(fixture.userId, {
      display_name: `Integrated ${fixture.suffix}`.slice(0, 100),
    });
    expect(updated.error).toBeNull();
    expect(updated.data?.display_name).toBe(`Integrated ${fixture.suffix}`.slice(0, 100));

    const missing = await repository.getPlayer(randomUUID());
    expect(missing).toEqual({ data: null, error: null });
  });

  it('executes run history with the real nested FK names and attempt columns', async () => {
    const repository = new SupabaseRunRepository(fixture.client);
    const history = await repository.getPlayerRunHistory(fixture.playerId);

    expect(history.error).toBeNull();
    expect(history.data).toHaveLength(1);
    expect(history.data?.[0]).toMatchObject({
      attempt: {
        difficulty: 'hard',
        gameplayRulesetVersion: fixture.gameplayRulesetVersion,
        progressionRulesetVersion: fixture.progressionRulesetVersion,
      },
      run: { id: fixture.runId, run_attempt_id: expect.any(String) },
      teamMembers: [{ champion_id: 'Garen', final_level: 6 }],
    });

    const team = await repository.getRunTeamMembers(fixture.runId);
    expect(team.error).toBeNull();
    expect(team.data).toMatchObject([{ champion_id: 'Garen', run_id: fixture.runId }]);
  });

  it('calls getPlayerRunHistory against local Supabase with real pagination semantics', async () => {
    const repository = new SupabaseRunRepository(fixture.client);

    const firstPage = await repository.getPlayerRunHistory(fixture.playerId, 1, 0);
    expect(firstPage.error).toBeNull();
    expect(firstPage.data).toHaveLength(1);
    expect(firstPage.data?.[0]).toMatchObject({
      run: { id: fixture.runId, player_id: fixture.playerId },
      attempt: {
        mode: 'normal',
        difficulty: 'hard',
        engineVersion: fixture.engineVersion,
      },
      teamMembers: [{ champion_id: 'Garen', run_id: fixture.runId }],
    });

    const emptyPage = await repository.getPlayerRunHistory(randomUUID(), 1, 0);
    expect(emptyPage).toEqual({ data: [], error: null });
  });

  it('uses real anonymous leaderboard and Daily contracts', async () => {
    const daily = new SupabaseDailyRunRepository(anonymous);
    const leaderboard = new SupabaseLeaderboardRepository(anonymous);
    const publicName = `Repository-${fixture.suffix.slice(0, 12)}`;

    const privacy = await new SupabaseDailyRunRepository(fixture.client).setLeaderboardPrivacy(
      publicName,
      false,
    );
    expect(privacy.error).toBeNull();

    const globalResult = await leaderboard.getLeaderboard(100);
    expect(globalResult.error).toBeNull();
    expect(globalResult.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ player_name: publicName })]),
    );

    const challenge = await daily.getDailyChallenge();
    expect(challenge.error).toBeNull();
    expect(challenge.data).toMatchObject({
      attemptPolicy: 'one_official_attempt_per_utc_day',
      gameplayRulesetVersion: fixture.gameplayRulesetVersion,
      hasAttempted: false,
    });

    const rankedDaily = await daily.getDailyLeaderboard({
      date: challenge.data!.dailyDate,
      gameplayRulesetVersion: challenge.data!.gameplayRulesetVersion,
      scoreVersion: challenge.data!.scoreVersion,
    });
    expect(rankedDaily.error).toBeNull();
    expect(Array.isArray(rankedDaily.data)).toBe(true);

    const authenticatedRank = await new SupabaseLeaderboardRepository(
      fixture.client,
    ).getPlayerRank();
    expect(authenticatedRank).toEqual(expect.any(Number));
  });

  it('loads real mastery and enhancement rows through authenticated RLS', async () => {
    const mastery = new SupabaseMasteryRepository(fixture.client);
    const enhancements = new SupabaseEnhancementRepository(fixture.client);

    const masteryResult = await mastery.getChampionMastery(fixture.userId);
    expect(masteryResult.error).toBeNull();
    expect(masteryResult.data).toMatchObject([
      { champion_id: 'Garen', mastery_level: 2, player_id: fixture.playerId },
    ]);

    await expect(enhancements.getEnhancementState(fixture.userId, 'Garen')).resolves.toEqual({
      totalCandiesSpent: 20,
      unlockedNodes: { fighter_core_1: 1 },
    });
    await expect(enhancements.getEnhancementState(fixture.userId, 'Lux')).resolves.toBeNull();
    const allEnhancements = await enhancements.getAllEnhancementStates(fixture.userId);
    expect(allEnhancements.get('Garen')).toEqual({
      totalCandiesSpent: 20,
      unlockedNodes: { fighter_core_1: 1 },
    });
  });

  it('exercises the real admin nested relations and bounded client-log RPC', async () => {
    const marker = `RepositoryIntegration${fixture.suffix.slice(0, 12)}`;
    const submitted = await fixture.client.rpc('submit_client_logs', {
      p_logs: [clientLogPayload(marker)],
    });
    expect(submitted).toMatchObject({ data: 1, error: null });

    const promoted = await admin
      .from('players')
      .update({ is_admin: true })
      .eq('id', fixture.playerId);
    expect(promoted.error).toBeNull();

    const [stats, players, runs, logs] = await Promise.all([
      fixture.client.from('admin_stats').select('*'),
      fixture.client.from('admin_player_stats').select('*').eq('id', fixture.playerId).single(),
      fixture.client
        .from('runs')
        .select(
          '*, player_username:player_id(username), player_display_name:player_id(display_name)',
        )
        .eq('id', fixture.runId)
        .single(),
      fixture.client.from('logs').select('*').eq('repository', marker).single(),
    ]);

    expect(stats.error).toBeNull();
    expect(stats.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ stat_name: 'total_players' })]),
    );
    expect(players.error).toBeNull();
    expect(players.data).toMatchObject({ id: fixture.playerId, total_candies: 250 });
    expect(runs.error).toBeNull();
    expect(runs.data).toMatchObject({
      id: fixture.runId,
      player_display_name: { display_name: expect.stringContaining('Integrated') },
      player_username: { username: expect.stringContaining('repository-') },
    });
    expect(logs.error).toBeNull();
    expect(logs.data).toMatchObject({
      player_id: fixture.playerId,
      repository: marker,
      user_id: fixture.userId,
    });
  });

  it('surfaces real PostgREST and PostgreSQL errors instead of mock-shaped responses', async () => {
    const missingRun = await new SupabaseRunRepository(fixture.client).getRun(randomUUID());
    expect(missingRun.data).toBeNull();
    expect(missingRun.error).toMatchObject({ code: 'PGRST116' });

    const invalidColumn = await fixture.client
      .from('run_attempts')
      .select('progression_ruleset_version')
      .limit(1);
    expect(invalidColumn.data).toBeNull();
    expect(invalidColumn.error?.code).toBe('42703');
  });
});
