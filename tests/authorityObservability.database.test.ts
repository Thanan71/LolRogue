import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionRegistry';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeDatabase = supabaseUrl && anonKey && serviceRoleKey ? describe : describe.skip;

describeDatabase('authority observability contract', () => {
  const createdUserIds: string[] = [];
  let service: SupabaseClient<Database>;

  beforeAll(() => {
    service = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    for (const userId of createdUserIds) await service.auth.admin.deleteUser(userId);
  });

  async function createAccount(prefix: string) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signup = await client.auth.signUp({
      email: `${prefix}-${suffix}@example.test`,
      password: 'Test-password-42!',
      options: { data: { username: `${prefix}-${suffix}`.slice(0, 50) } },
    });
    if (signup.error || !signup.data.user || !signup.data.session) {
      throw signup.error ?? new Error('Authority observability account has no session');
    }
    createdUserIds.push(signup.data.user.id);
    const player = await service
      .from('players')
      .select('id')
      .eq('user_id', signup.data.user.id)
      .single();
    if (player.error || !player.data) throw player.error ?? new Error('Player profile missing');
    return { client, userId: signup.data.user.id, playerId: player.data.id };
  }

  it('aggregates lifecycle counts by version without exposing player journals', async () => {
    const administrator = await createAccount('authority-observer');
    const player = await createAccount('authority-subject');
    const promoted = await service
      .from('players')
      .update({ is_admin: true })
      .eq('id', administrator.playerId);
    expect(promoted.error).toBeNull();

    const readAggregates = () =>
      administrator.client
        .from('authority_attempt_aggregates')
        .select('*')
        .eq('engine_version', CURRENT_AUTHORITY_VERSION.engine)
        .eq('gameplay_ruleset_version', CURRENT_AUTHORITY_VERSION.gameplay)
        .eq('rejection_code', 'pending_choice');
    const previousAggregates = await readAggregates();
    expect(previousAggregates.error).toBeNull();

    const started = await player.client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(started.error).toBeNull();
    const attemptId = (started.data as { attempt_id: string }).attempt_id;
    const sealed = await player.client.rpc('seal_run_attempt', {
      p_attempt_id: attemptId,
      p_expected_sequence: 0,
      p_finish_command_id: randomUUID(),
    });
    expect(sealed.error).toBeNull();
    const claimed = await service.rpc('claim_run_verification', {
      p_attempt_id: attemptId,
      p_worker_id: randomUUID(),
    });
    expect(claimed.error).toBeNull();
    const leaseToken = (claimed.data as { lease_token: string }).lease_token;
    const rejected = await service.rpc('reject_run_verification', {
      p_attempt_id: attemptId,
      p_lease_token: leaseToken,
      p_rejection_code: 'pending_choice',
    });
    expect(rejected.error).toBeNull();

    const [hiddenFromPlayer, hiddenRejections, aggregates, recentRejections] = await Promise.all([
      player.client.from('authority_attempt_aggregates').select('*'),
      player.client.from('authority_recent_rejections').select('*'),
      readAggregates(),
      administrator.client
        .from('authority_recent_rejections')
        .select('*')
        .eq('attempt_id', attemptId),
    ]);
    expect(hiddenFromPlayer).toMatchObject({ data: [], error: null });
    expect(hiddenRejections).toMatchObject({ data: [], error: null });
    expect(aggregates.error).toBeNull();
    expect(aggregates.data?.length).toBeGreaterThan(0);
    // Other real histories can share this engine and minute. Verify the exact
    // lifecycle delta instead of assuming an otherwise empty local database.
    for (const field of [
      'attempt_count',
      'started_count',
      'finished_count',
      'verified_count',
      'rejected_count',
      'expired_count',
    ] as const) {
      const before = (previousAggregates.data ?? []).reduce(
        (sum, row) => sum + (row[field] ?? 0),
        0,
      );
      const after = (aggregates.data ?? []).reduce((sum, row) => sum + (row[field] ?? 0), 0);
      expect(after).toBe(
        before + (field === 'attempt_count' || field === 'rejected_count' ? 1 : 0),
      );
    }
    for (const row of aggregates.data ?? []) {
      expect(row).toMatchObject({
        engine_version: CURRENT_AUTHORITY_VERSION.engine,
        gameplay_ruleset_version: CURRENT_AUTHORITY_VERSION.gameplay,
        rejection_code: 'pending_choice',
      });
      for (const field of ['commands', 'payload', 'result', 'user_id', 'player_id']) {
        expect(Object.keys(row)).not.toContain(field);
      }
    }
    expect(recentRejections).toMatchObject({
      data: [
        {
          attempt_id: attemptId,
          engine_version: CURRENT_AUTHORITY_VERSION.engine,
          gameplay_ruleset_version: CURRENT_AUTHORITY_VERSION.gameplay,
          rejection_code: 'pending_choice',
        },
      ],
      error: null,
    });
    for (const row of recentRejections.data ?? []) {
      for (const field of ['commands', 'payload', 'result', 'user_id', 'player_id']) {
        expect(Object.keys(row)).not.toContain(field);
      }
    }
  });
});
