import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseCredentials = Boolean(supabaseUrl && anonKey && serviceRoleKey);

type DailyChallengeWire = {
  daily_date: string;
  seed: number;
  starts_at: string;
  expires_at: string;
  difficulty: string;
  daily_ruleset_version: number;
  gameplay_ruleset_version: number;
  score_version: number;
  starter_ids: string[];
  attempt_policy: string;
  has_attempted: boolean;
  attempt_id: string | null;
  attempt_status: string | null;
  published: boolean;
  score: number | null;
};

type StartedAttemptWire = {
  attempt_id: string;
  seed: number;
  difficulty: string;
  mode: string;
  daily_date: string;
  daily_ruleset_version: number;
  daily_score_version: number;
  enhancement_snapshot: Record<string, unknown>;
  expires_at: string;
};

async function signUpUser(suffix: string) {
  const client = createClient<Database>(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signup = await client.auth.signUp({
    email: `daily-authority-${suffix}@example.test`,
    password: 'Test-password-42!',
    options: {
      data: {
        username: `daily-${suffix}`.slice(0, 50),
        display_name: `Daily ${suffix}`.slice(0, 100),
      },
    },
  });
  if (signup.error || !signup.data.user || !signup.data.session) {
    throw signup.error ?? new Error('Daily test user did not receive a session');
  }
  return { client, userId: signup.data.user.id };
}

async function sealAttempt(
  client: SupabaseClient<Database>,
  attemptId: string,
  kind: 'resolve_node' | 'abandon_run',
) {
  const appended = await client.rpc('append_run_attempt_commands', {
    p_attempt_id: attemptId,
    p_commands: [
      {
        command_id: randomUUID(),
        sequence: 1,
        kind,
        payload: kind === 'resolve_node' ? { node_id: 'trusted-edge-result' } : {},
      },
    ],
  });
  expect(appended.error).toBeNull();

  const sealed = await client.rpc('seal_run_attempt', {
    p_attempt_id: attemptId,
    p_finish_command_id: randomUUID(),
    p_expected_sequence: 1,
  });
  expect(sealed.error).toBeNull();
  expect(sealed.data).toMatchObject({ status: 'finished' });
}

const describeLive = hasSupabaseCredentials ? describe : describe.skip;

describeLive('authoritative daily leaderboard live security', () => {
  let admin: SupabaseClient<Database>;
  const createdUserIds: string[] = [];

  beforeAll(() => {
    admin = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterEach(async () => {
    for (const userId of createdUserIds.splice(0)) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it('derives the day and seed from UTC independently of caller timezone', async () => {
    const sameInstant = await Promise.all(
      ['2026-07-26T23:30:00-04:00', '2026-07-27T05:30:00+02:00', '2026-07-27T12:30:00+09:00'].map(
        (p_instant) => admin.rpc('daily_utc_date', { p_instant }),
      ),
    );
    expect(sameInstant.every(({ error }) => error === null)).toBe(true);
    expect(new Set(sameInstant.map(({ data }) => data))).toEqual(new Set(['2026-07-27']));

    const beforeMidnight = await admin.rpc('daily_utc_date', {
      p_instant: '2026-07-26T23:59:59.999Z',
    });
    const atMidnight = await admin.rpc('daily_utc_date', {
      p_instant: '2026-07-27T00:00:00.000Z',
    });
    expect(beforeMidnight.data).toBe('2026-07-26');
    expect(atMidnight.data).toBe('2026-07-27');

    const firstSeed = await admin.rpc('daily_seed_for_date', {
      p_daily_date: '2026-07-26',
      p_seed_namespace: 'lolrogue.daily.v1',
    });
    const sameSeed = await admin.rpc('daily_seed_for_date', {
      p_daily_date: '2026-07-26',
      p_seed_namespace: 'lolrogue.daily.v1',
    });
    const nextSeed = await admin.rpc('daily_seed_for_date', {
      p_daily_date: '2026-07-27',
      p_seed_namespace: 'lolrogue.daily.v1',
    });
    expect(firstSeed.error).toBeNull();
    expect(firstSeed.data).toBe(sameSeed.data);
    expect(firstSeed.data).not.toBe(nextSeed.data);
  });

  it('allows one canonical attempt, publishes one verified score and hides abandonments', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const first = await signUpUser(`${suffix}-first`);
    const second = await signUpUser(`${suffix}-second`);
    createdUserIds.push(first.userId, second.userId);

    const firstChallengeResult = await first.client.rpc('get_daily_challenge');
    const secondChallengeResult = await second.client.rpc('get_daily_challenge');
    expect(firstChallengeResult.error).toBeNull();
    expect(secondChallengeResult.error).toBeNull();
    const challenge = firstChallengeResult.data as DailyChallengeWire;
    const secondChallenge = secondChallengeResult.data as DailyChallengeWire;
    expect(challenge).toMatchObject({
      daily_date: new Date().toISOString().slice(0, 10),
      difficulty: 'normal',
      score_version: 1,
      attempt_policy: 'one_official_attempt_per_utc_day',
      has_attempted: false,
    });
    expect(challenge.seed).toBe(secondChallenge.seed);
    expect(challenge.starter_ids).toHaveLength(6);
    expect(new Set(challenge.starter_ids).size).toBe(6);
    expect(Date.parse(challenge.expires_at)).toBeGreaterThan(Date.now());

    const firstStart = await first.client.rpc('start_daily_run_attempt', {
      p_command_id: randomUUID(),
      p_team: [challenge.starter_ids[0]],
      p_rune_ids: [],
    });
    expect(firstStart.error).toBeNull();
    const firstAttempt = firstStart.data as StartedAttemptWire;
    expect(firstAttempt).toMatchObject({
      seed: challenge.seed,
      difficulty: 'normal',
      mode: 'daily',
      daily_date: challenge.daily_date,
      daily_ruleset_version: challenge.daily_ruleset_version,
      daily_score_version: challenge.score_version,
      enhancement_snapshot: {},
    });
    expect(firstAttempt.expires_at).toBe(challenge.expires_at);

    // Even the legacy generic start path is canonicalized by the table trigger.
    const secondStart = await second.client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: [challenge.starter_ids[0]],
      p_rune_ids: [],
      p_difficulty: 'hard',
      p_mode: 'daily',
    });
    expect(secondStart.error).toBeNull();
    const secondAttemptId = (secondStart.data as { attempt_id: string }).attempt_id;
    const secondStatus = await second.client.rpc('get_run_attempt_status', {
      p_attempt_id: secondAttemptId,
    });
    expect(secondStatus.error).toBeNull();
    expect(secondStatus.data).toMatchObject({
      seed: challenge.seed,
      mode: 'daily',
      difficulty: 'normal',
      enhancement_snapshot: {},
    });

    const duplicateStart = await first.client.rpc('start_daily_run_attempt', {
      p_command_id: randomUUID(),
      p_team: [challenge.starter_ids[1]],
      p_rune_ids: [],
    });
    expect(duplicateStart.error?.message).toContain('run_attempt_already_open');

    const unofferedStart = await signUpUser(`${suffix}-unoffered`);
    createdUserIds.push(unofferedStart.userId);
    const supportedButUnoffered = [
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
    ].find((championId) => !challenge.starter_ids.includes(championId));
    expect(supportedButUnoffered).toBeDefined();
    const rejectedStarter = await unofferedStart.client.rpc('start_daily_run_attempt', {
      p_command_id: randomUUID(),
      p_team: [supportedButUnoffered!],
      p_rune_ids: [],
    });
    expect(rejectedStarter.error?.message).toContain('daily_starter_not_offered');

    const retiredSubmission = await first.client.rpc(
      'submit_daily_run' as never,
      {
        p_daily_date: challenge.daily_date,
        p_daily_seed: 1,
        p_won: true,
        p_run_level: 100,
        p_waves_completed: 1000,
        p_gold: 1000000,
        p_item_count: 100,
      } as never,
    );
    expect(retiredSubmission.error).not.toBeNull();

    const directRead = await first.client.from('daily_runs').select('*');
    const directInsert = await first.client.from('daily_runs').insert({
      player_id: randomUUID(),
      daily_date: challenge.daily_date,
      daily_seed: 1,
      score: 2147483647,
    });
    expect(directRead.error).toBeNull();
    expect(directRead.data).toEqual([]);
    expect(directInsert.error).not.toBeNull();

    const forgedCompletion = await first.client.rpc(
      'complete_run_verification' as never,
      {
        p_attempt_id: firstAttempt.attempt_id,
        p_lease_token: randomUUID(),
        p_result: {},
        p_result_hash: null,
      } as never,
    );
    expect(forgedCompletion.error).not.toBeNull();

    await sealAttempt(first.client, firstAttempt.attempt_id, 'resolve_node');
    const firstClaim = await admin.rpc('claim_run_verification', {
      p_attempt_id: firstAttempt.attempt_id,
      p_worker_id: randomUUID(),
    });
    expect(firstClaim.error).toBeNull();
    const firstLease = (firstClaim.data as { lease_token: string }).lease_token;
    const verifiedResult = {
      won: false,
      run_level: 1,
      waves_completed: 1,
      biomes_visited: ['top_lane'],
      gold_earned: 10,
      augment_ids: [],
      team_members: [
        {
          champion_id: challenge.starter_ids[0],
          final_level: 1,
          final_hp: 100,
          kills: 1,
          damage_dealt: 50,
          items_collected: [],
        },
      ],
    };
    const firstCompletion = await admin.rpc(
      'complete_run_verification' as never,
      {
        p_attempt_id: firstAttempt.attempt_id,
        p_lease_token: firstLease,
        p_result: verifiedResult,
        p_result_hash: null,
      } as never,
    );
    expect(firstCompletion.error).toBeNull();

    const replayedCompletion = await admin.rpc(
      'complete_run_verification' as never,
      {
        p_attempt_id: firstAttempt.attempt_id,
        p_lease_token: firstLease,
        p_result: verifiedResult,
        p_result_hash: null,
      } as never,
    );
    expect(replayedCompletion.error).toBeNull();
    expect(replayedCompletion.data).toMatchObject({ replayed: true });

    const usedAttempt = await first.client.rpc('start_daily_run_attempt', {
      p_command_id: randomUUID(),
      p_team: [challenge.starter_ids[1]],
      p_rune_ids: [],
    });
    expect(usedAttempt.error?.message).toContain('daily_attempt_already_used');

    const published = await admin
      .from('daily_runs')
      .select('daily_date, daily_seed, score, run_attempt_id, daily_ruleset_version, score_version')
      .eq('run_attempt_id', firstAttempt.attempt_id)
      .single();
    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({
      daily_date: challenge.daily_date,
      daily_seed: challenge.seed,
      score: 1360,
      run_attempt_id: firstAttempt.attempt_id,
      daily_ruleset_version: 1,
      score_version: 1,
    });

    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anonymousChallenge = await anonymous.rpc('get_daily_challenge');
    expect(anonymousChallenge.error).toBeNull();
    expect(anonymousChallenge.data).toMatchObject({
      daily_date: challenge.daily_date,
      seed: challenge.seed,
      has_attempted: false,
      attempt_id: null,
    });

    const publicBoard = await anonymous
      .from('daily_leaderboard')
      .select('*')
      .eq('daily_date', challenge.daily_date)
      .eq('player_name', `Daily ${suffix}-first`.slice(0, 100))
      .single();
    expect(publicBoard.error).toBeNull();
    expect(publicBoard.data).toMatchObject({
      rank: expect.any(Number),
      score: 1360,
      waves_completed: 1,
      run_level_reached: 1,
      score_version: 1,
    });
    expect(publicBoard.data).not.toHaveProperty('player_id');
    expect(publicBoard.data).not.toHaveProperty('completed_at');
    expect(publicBoard.data).not.toHaveProperty('daily_seed');

    await sealAttempt(second.client, secondAttemptId, 'abandon_run');
    const secondClaim = await admin.rpc('claim_run_verification', {
      p_attempt_id: secondAttemptId,
      p_worker_id: randomUUID(),
    });
    expect(secondClaim.error).toBeNull();
    const abandonedResult = {
      won: false,
      run_level: 1,
      waves_completed: 0,
      biomes_visited: [],
      gold_earned: 0,
      augment_ids: [],
      team_members: [
        {
          champion_id: challenge.starter_ids[0],
          final_level: 1,
          final_hp: 100,
          kills: 0,
          damage_dealt: 0,
          items_collected: [],
        },
      ],
    };
    const abandonedCompletion = await admin.rpc(
      'complete_run_verification' as never,
      {
        p_attempt_id: secondAttemptId,
        p_lease_token: (secondClaim.data as { lease_token: string }).lease_token,
        p_result: abandonedResult,
        p_result_hash: null,
      } as never,
    );
    expect(abandonedCompletion.error).toBeNull();

    const abandonedRows = await admin
      .from('daily_runs')
      .select('id', { count: 'exact', head: true })
      .eq('run_attempt_id', secondAttemptId);
    expect(abandonedRows.error).toBeNull();
    expect(abandonedRows.count).toBe(0);

    const abandonedChallenge = await second.client.rpc('get_daily_challenge');
    expect(abandonedChallenge.error).toBeNull();
    expect(abandonedChallenge.data).toMatchObject({
      has_attempted: true,
      attempt_status: 'verified',
      published: false,
      score: null,
    });
  }, 20_000);
});
