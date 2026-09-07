import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { implementedChampions } from '@/data/champion';
import { enhancementTreeProvider } from '@/services/enhancementService';
import type { Database } from '@/types/database';

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
  waves_participated?: number;
  biomes_participated?: string[];
};

function withRunLedger<
  T extends {
    gold_earned: number;
    waves_completed: number;
    biomes_visited: string[];
    team_members: VerifiedMember[];
  },
>(result: T) {
  const teamMembers = result.team_members.map((member) => ({
    ...member,
    waves_participated: member.waves_participated ?? result.waves_completed,
    biomes_participated: member.biomes_participated ?? [...result.biomes_visited],
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
      version: 2,
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
            waves_participated: member.waves_participated,
            biomes_participated: member.biomes_participated,
          },
        ]),
      ),
      gold: { earned: result.gold_earned, spent: 0 },
      items: [],
      next_item_event_sequence: 1,
    },
  };
}

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
  mastery_snapshot: Record<string, unknown>;
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

  it('keeps score v14 through Daily v16 and carries gold-neutral score v15 into v21', async () => {
    const rulesets = await admin
      .from('daily_challenge_rulesets')
      .select('version, score_version, is_active')
      .in('version', [14, 15, 16, 17, 18, 19, 20, 21])
      .order('version');

    expect(rulesets.error).toBeNull();
    expect(rulesets.data).toEqual([
      { version: 14, score_version: 14, is_active: false },
      { version: 15, score_version: 14, is_active: false },
      { version: 16, score_version: 14, is_active: false },
      { version: 17, score_version: 15, is_active: false },
      { version: 18, score_version: 15, is_active: false },
      { version: 19, score_version: 15, is_active: false },
      { version: 20, score_version: 15, is_active: false },
      { version: 21, score_version: 15, is_active: true },
    ]);
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
    const publicName = `Daily-${suffix.slice(-12)}`;
    const privacy = await first.client.rpc('set_leaderboard_privacy', {
      p_public_display_name: publicName,
      p_opt_out: false,
    });
    expect(privacy.error).toBeNull();

    const firstChallengeResult = await first.client.rpc('get_daily_challenge');
    const secondChallengeResult = await second.client.rpc('get_daily_challenge');
    expect(firstChallengeResult.error).toBeNull();
    expect(secondChallengeResult.error).toBeNull();
    const challenge = firstChallengeResult.data as DailyChallengeWire;
    const secondChallenge = secondChallengeResult.data as DailyChallengeWire;
    expect(challenge).toMatchObject({
      daily_date: new Date().toISOString().slice(0, 10),
      difficulty: 'normal',
      score_version: 15,
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
      mastery_snapshot: {},
    });
    expect(firstAttempt.expires_at).toBe(challenge.expires_at);

    const secondProfile = await admin
      .from('players')
      .select('id')
      .eq('user_id', second.userId)
      .single();
    expect(secondProfile.error).toBeNull();
    const maxedMastery = await admin.from('champion_mastery').insert(
      implementedChampions.map((champion) => ({
        player_id: secondProfile.data!.id,
        champion_id: champion.id,
        total_candies: 700,
        mastery_level: 4,
        current_level_candies: 0,
      })),
    );
    expect(maxedMastery.error).toBeNull();
    const maxedEnhancements = await admin.from('champion_enhancements').insert(
      implementedChampions.map((champion) => {
        const tree = enhancementTreeProvider.getTreeForChampion(champion);
        const nodes = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
        return {
          user_id: second.userId,
          champion_id: champion.id,
          total_candies_spent: 10_000,
          unlocked_nodes: Object.fromEntries(nodes.map((node) => [node.id, node.maxRanks ?? 1])),
        };
      }),
    );
    expect(maxedEnhancements.error).toBeNull();

    // Even the legacy generic start path is canonicalized by the table trigger.
    const secondStart = await second.client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: [challenge.starter_ids[0]],
      p_rune_ids: [],
      p_difficulty: 'hard',
      p_mode: 'daily',
    });
    expect(secondStart.error).toBeNull();
    const secondAttempt = secondStart.data as StartedAttemptWire;
    expect(secondAttempt).toMatchObject({
      mode: 'daily',
      enhancement_snapshot: {},
      mastery_snapshot: {},
    });
    const secondAttemptId = secondAttempt.attempt_id;
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
    const verifiedResult = withRunLedger({
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
    });
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
      score: 1350,
      run_attempt_id: firstAttempt.attempt_id,
      daily_ruleset_version: 21,
      score_version: 15,
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
      .eq('player_name', publicName)
      .single();
    expect(publicBoard.error).toBeNull();
    expect(publicBoard.data).toMatchObject({
      rank: expect.any(Number),
      score: 1350,
      waves_completed: 1,
      run_level_reached: 1,
      score_version: 15,
    });
    expect(publicBoard.data).not.toHaveProperty('player_id');
    expect(publicBoard.data).not.toHaveProperty('completed_at');
    expect(publicBoard.data).not.toHaveProperty('daily_seed');

    const authenticatedBoard = await first.client
      .from('daily_leaderboard')
      .select('*')
      .eq('daily_date', challenge.daily_date)
      .eq('player_name', publicName)
      .single();
    expect(authenticatedBoard.error).toBeNull();
    expect(authenticatedBoard.data?.rank).toBe(publicBoard.data?.rank);

    const ownerBoard = await admin
      .from('daily_leaderboard')
      .select('*')
      .eq('daily_date', challenge.daily_date)
      .eq('player_name', publicName)
      .single();
    expect(ownerBoard.error).toBeNull();
    expect(ownerBoard.data).toMatchObject({ score: 1350, player_name: publicName });

    await sealAttempt(second.client, secondAttemptId, 'abandon_run');
    const secondClaim = await admin.rpc('claim_run_verification', {
      p_attempt_id: secondAttemptId,
      p_worker_id: randomUUID(),
    });
    expect(secondClaim.error).toBeNull();
    const abandonedResult = withRunLedger({
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
    });
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
