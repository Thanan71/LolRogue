import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeDatabase = supabaseUrl && anonKey && serviceRoleKey ? describe : describe.skip;

type TestAccount = {
  client: SupabaseClient<Database>;
  userId: string;
  playerId: string;
};

describeDatabase('admin privilege contract', () => {
  const createdUserIds: string[] = [];
  const createdDailyRunIds: string[] = [];
  let service: SupabaseClient<Database>;

  beforeAll(() => {
    service = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    if (createdDailyRunIds.length > 0) {
      await service.from('daily_runs').delete().in('id', createdDailyRunIds);
    }
    for (const userId of createdUserIds) await service.auth.admin.deleteUser(userId);
  });

  const createAccount = async (prefix: string, metadata: Record<string, unknown> = {}) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signup = await client.auth.signUp({
      email: `${prefix}-${suffix}@example.test`,
      password: 'Test-password-42!',
      options: {
        data: { username: `${prefix}-${suffix}`.slice(0, 50), ...metadata },
      },
    });
    if (signup.error || !signup.data.user || !signup.data.session) {
      throw signup.error ?? new Error('Admin privilege test account did not receive a session');
    }
    createdUserIds.push(signup.data.user.id);
    const profile = await service
      .from('players')
      .select('id')
      .eq('user_id', signup.data.user.id)
      .single();
    if (profile.error || !profile.data) throw profile.error ?? new Error('Player profile missing');
    return {
      client,
      userId: signup.data.user.id,
      playerId: profile.data.id,
    } satisfies TestAccount;
  };

  it('keeps admin identity server-owned and returns no anonymous admin signal', async () => {
    const regular = await createAccount('admin-metadata', {
      is_admin: true,
      role: 'admin',
    });
    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const anonymousCheck = await anonymous.rpc('is_current_user_admin');
    expect(anonymousCheck.data).toBeNull();
    expect(anonymousCheck.error).not.toBeNull();

    const initialCheck = await regular.client.rpc('is_current_user_admin');
    expect(initialCheck).toMatchObject({ data: false, error: null });

    const metadataUpdate = await regular.client.auth.updateUser({
      data: { is_admin: true, role: 'admin' },
    });
    expect(metadataUpdate.error).toBeNull();

    const directPromotion = await regular.client
      .from('players')
      .update({ is_admin: true })
      .eq('id', regular.playerId);
    expect(directPromotion.error).not.toBeNull();

    const profile = await service
      .from('players')
      .select('is_admin')
      .eq('id', regular.playerId)
      .single();
    expect(profile).toMatchObject({ data: { is_admin: false }, error: null });
    expect(await regular.client.rpc('is_current_user_admin')).toMatchObject({
      data: false,
      error: null,
    });
  });

  it('retires the two-argument invalidation bypass for every client role', async () => {
    const administrator = await createAccount('score-admin');
    const regular = await createAccount('score-player');
    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    expect(
      (await service.from('players').update({ is_admin: true }).eq('id', administrator.playerId))
        .error,
    ).toBeNull();
    for (const client of [anonymous, regular.client, administrator.client, service]) {
      const result = await client.rpc('invalidate_daily_score', {
        p_daily_run_id: randomUUID(),
        p_reason: 'Invalidation requires the confirmed audited moderation command.',
      });
      expect(result.error?.code).toBe('42501');
    }
  });
});
