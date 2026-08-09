import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

    const started = await player.client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(started.error).toBeNull();

    const [hiddenFromPlayer, aggregates] = await Promise.all([
      player.client.from('authority_attempt_aggregates').select('*'),
      administrator.client
        .from('authority_attempt_aggregates')
        .select('*')
        .eq('engine_version', 'run-engine-v13'),
    ]);
    expect(hiddenFromPlayer).toMatchObject({ data: [], error: null });
    expect(aggregates.error).toBeNull();
    expect(aggregates.data).toHaveLength(1);
    expect(aggregates.data?.[0]).toMatchObject({
      engine_version: 'run-engine-v13',
      gameplay_ruleset_version: 13,
      attempt_count: 1,
      started_count: 1,
      verified_count: 0,
      rejected_count: 0,
      expired_count: 0,
      rejection_code: null,
    });
    expect(Object.keys(aggregates.data?.[0] ?? {})).not.toEqual(
      expect.arrayContaining(['commands', 'payload', 'result', 'user_id']),
    );
  });
});
