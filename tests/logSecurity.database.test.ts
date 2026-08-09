import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseCredentials = Boolean(supabaseUrl && anonKey && serviceRoleKey);
const describeLive = hasSupabaseCredentials ? describe : describe.skip;

async function signUpUser(suffix: string) {
  const client = createClient<Database>(supabaseUrl!, anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signup = await client.auth.signUp({
    email: `log-security-${suffix}@example.test`,
    password: 'Test-password-42!',
    options: {
      data: {
        username: `logs-${suffix}`.slice(0, 50),
        display_name: `Logs ${suffix}`.slice(0, 100),
      },
    },
  });
  if (signup.error || !signup.data.user || !signup.data.session) {
    throw signup.error ?? new Error('Log security test user did not receive a session');
  }
  return { client, userId: signup.data.user.id };
}

function logPayload(overrides: Record<string, Json | undefined> = {}): Json {
  return {
    level: 'error',
    repository: 'SecurityTestRepository',
    method: 'write',
    table_name: 'players',
    operation: 'update',
    duration_ms: 12,
    error_message: 'Bearer private-token player@example.test',
    error_stack: 'token=stack-secret',
    details: {
      nested: {
        password: 'nested-secret',
        note: 'api_key=metadata-secret',
      },
    },
    session_id: randomUUID(),
    ...overrides,
  };
}

describeLive('public data and client log live security', () => {
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

  it('publishes only the minimal leaderboard and resolves the caller rank privately', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const player = await signUpUser(`${suffix}-rank`);
    const otherPlayer = await signUpUser(`${suffix}-other`);
    createdUserIds.push(player.userId, otherPlayer.userId);
    const publicName = `Rank-${suffix.slice(-12)}`;

    const privacy = await player.client.rpc('set_leaderboard_privacy', {
      p_public_display_name: publicName,
      p_opt_out: false,
    });
    expect(privacy.error).toBeNull();

    const update = await admin
      .from('players')
      .update({
        total_wins: 4,
        total_runs_completed: 5,
        total_waves_completed: 42,
        total_candies: 999,
        last_login_at: new Date().toISOString(),
      })
      .eq('user_id', player.userId);
    expect(update.error).toBeNull();

    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const leaderboard = await anonymous
      .from('leaderboard')
      .select('*')
      .eq('player_name', publicName)
      .single();
    expect(leaderboard.error).toBeNull();
    expect(leaderboard.data).toMatchObject({
      total_wins: 4,
      total_runs_completed: 5,
      total_waves_completed: 42,
    });
    expect(leaderboard.data).not.toHaveProperty('player_id');
    expect(leaderboard.data).not.toHaveProperty('user_id');
    expect(leaderboard.data).not.toHaveProperty('username');
    expect(leaderboard.data).not.toHaveProperty('total_candies');
    expect(leaderboard.data).not.toHaveProperty('last_login_at');
    expect(leaderboard.data?.player_name).not.toBe(`Logs ${suffix}-rank`.slice(0, 100));

    const authenticatedRead = await player.client
      .from('leaderboard')
      .select('*')
      .eq('player_name', publicName)
      .single();
    expect(authenticatedRead.error).toBeNull();
    expect(authenticatedRead.data?.rank).toBe(leaderboard.data?.rank);

    const ownerRead = await admin
      .from('leaderboard')
      .select('*')
      .eq('player_name', publicName)
      .single();
    expect(ownerRead.error).toBeNull();
    expect(ownerRead.data).toMatchObject({ total_wins: 4, total_waves_completed: 42 });

    const anonymousPlayers = await anonymous.from('players').select('*');
    const anonymousDailyRuns = await anonymous.from('daily_runs').select('*');
    expect(anonymousPlayers.error).not.toBeNull();
    expect(anonymousDailyRuns.error).not.toBeNull();

    const otherProfile = await player.client
      .from('players')
      .select('id')
      .eq('user_id', otherPlayer.userId);
    expect(otherProfile.error).toBeNull();
    expect(otherProfile.data).toEqual([]);

    const optOut = await player.client.rpc('set_leaderboard_privacy', {
      p_public_display_name: publicName,
      p_opt_out: true,
    });
    expect(optOut.error).toBeNull();
    const hidden = await anonymous.from('leaderboard').select('rank').eq('player_name', publicName);
    expect(hidden).toMatchObject({ data: [], error: null });

    const optBackIn = await player.client.rpc('set_leaderboard_privacy', {
      p_public_display_name: publicName,
      p_opt_out: false,
    });
    expect(optBackIn.error).toBeNull();

    const ownRank = await player.client.rpc('get_my_leaderboard_rank');
    expect(ownRank.error).toBeNull();
    expect(ownRank.data).toBe(leaderboard.data?.rank);
  });

  it('rejects direct writes and derives identity while sanitizing recursively', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const first = await signUpUser(`${suffix}-first`);
    const second = await signUpUser(`${suffix}-second`);
    createdUserIds.push(first.userId, second.userId);

    const direct = await first.client.from('logs').insert({
      level: 'info',
      repository: 'DirectWrite',
      method: 'insert',
      operation: 'insert',
      details: {},
      user_id: second.userId,
      session_id: randomUUID(),
    });
    expect(direct.error).not.toBeNull();

    const marker = `SecurityTest${Date.now()}`;
    const submitted = await first.client.rpc('submit_client_logs', {
      p_logs: [
        logPayload({
          repository: marker,
          user_id: second.userId,
          player_id: randomUUID(),
          created_at: '2000-01-01T00:00:00.000Z',
        }),
      ],
    });
    expect(submitted).toMatchObject({ data: 1, error: null });

    const stored = await admin.from('logs').select('*').eq('repository', marker).single();
    const firstPlayer = await admin
      .from('players')
      .select('id')
      .eq('user_id', first.userId)
      .single();
    expect(stored.error).toBeNull();
    expect(stored.data?.user_id).toBe(first.userId);
    expect(stored.data?.player_id).toBe(firstPlayer.data?.id);
    expect(Date.parse(stored.data?.created_at ?? '')).toBeGreaterThan(Date.now() - 30_000);
    const serialized = JSON.stringify(stored.data);
    for (const secret of [
      'private-token',
      'player@example.test',
      'stack-secret',
      'nested-secret',
      'metadata-secret',
      second.userId,
    ]) {
      expect(serialized).not.toContain(secret);
    }

    const ownRead = await first.client.from('logs').select('id').eq('id', stored.data!.id);
    const otherRead = await second.client.from('logs').select('id').eq('id', stored.data!.id);
    expect(ownRead.data).toHaveLength(1);
    expect(otherRead.data).toHaveLength(0);

    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anonymousSubmission = await anonymous.rpc('submit_client_logs', {
      p_logs: [logPayload()],
    });
    expect(anonymousSubmission.error).not.toBeNull();
  });

  it('rejects oversized batches and enforces an atomic per-user rate limit', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const player = await signUpUser(`${suffix}-quota`);
    createdUserIds.push(player.userId);

    const tooMany = await player.client.rpc('submit_client_logs', {
      p_logs: Array.from({ length: 11 }, () => logPayload()),
    });
    const tooLarge = await player.client.rpc('submit_client_logs', {
      p_logs: [logPayload({ details: { value: 'x'.repeat(70_000) } })],
    });
    expect(tooMany.error?.message).toContain('invalid_log_batch');
    expect(tooLarge.error?.message).toContain('invalid_log_batch');

    for (let batch = 0; batch < 3; batch += 1) {
      const accepted = await player.client.rpc('submit_client_logs', {
        p_logs: Array.from({ length: 10 }, () => logPayload({ level: 'info' })),
      });
      expect(accepted.error).toBeNull();
      expect(accepted.data).toBe(10);
    }
    const throttled = await player.client.rpc('submit_client_logs', {
      p_logs: [logPayload({ level: 'info' })],
    });
    expect(throttled.error?.message).toContain('log_rate_limit_exceeded');

    const count = await admin
      .from('logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', player.userId);
    expect(count.count).toBe(30);
  });

  it('purges diagnostics older than fourteen days', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const player = await signUpUser(`${suffix}-retention`);
    createdUserIds.push(player.userId);
    const profile = await admin.from('players').select('id').eq('user_id', player.userId).single();
    const oldId = randomUUID();
    const inserted = await admin.from('logs').insert({
      id: oldId,
      created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1_000).toISOString(),
      level: 'info',
      repository: 'RetentionTest',
      method: 'purge',
      operation: 'delete',
      details: {},
      user_id: player.userId,
      player_id: profile.data!.id,
      session_id: randomUUID(),
    });
    expect(inserted.error).toBeNull();

    const purged = await admin.rpc('purge_expired_logs');
    expect(purged.error).toBeNull();
    expect(purged.data).toBeGreaterThanOrEqual(1);
    const remaining = await admin.from('logs').select('id').eq('id', oldId);
    expect(remaining.data).toHaveLength(0);
  });
});
