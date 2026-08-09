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

  it('allows only an authenticated admin to invalidate one existing completed score', async () => {
    const administrator = await createAccount('score-admin');
    const regular = await createAccount('score-player');
    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const promotion = await service
      .from('players')
      .update({ is_admin: true })
      .eq('id', administrator.playerId);
    expect(promotion.error).toBeNull();
    expect(await administrator.client.rpc('is_current_user_admin')).toMatchObject({
      data: true,
      error: null,
    });

    const dailyRunId = randomUUID();
    createdDailyRunIds.push(dailyRunId);
    const insertedDaily = await service.from('daily_runs').insert({
      id: dailyRunId,
      player_id: regular.playerId,
      daily_date: '2026-08-09',
      daily_seed: 20260809,
      score: 12_345,
      won: true,
      run_level_reached: 6,
      waves_completed: 24,
      completed_at: new Date().toISOString(),
    });
    expect(insertedDaily.error).toBeNull();
    const insertedReport = await service.from('daily_score_reports').insert({
      daily_run_id: dailyRunId,
      reporter_user_id: regular.userId,
      reason: 'Le score observé ne correspond pas au replay.',
    });
    expect(insertedReport.error).toBeNull();

    const anonymousInvalidation = await anonymous.rpc('invalidate_daily_score', {
      p_daily_run_id: dailyRunId,
      p_reason: 'Tentative anonyme avec un motif assez long',
    });
    expect(anonymousInvalidation.error).not.toBeNull();

    const regularInvalidation = await regular.client.rpc('invalidate_daily_score', {
      p_daily_run_id: dailyRunId,
      p_reason: 'Tentative utilisateur avec un motif assez long',
    });
    expect(regularInvalidation.error?.message).toContain('admin_required');

    const missingScore = await administrator.client.rpc('invalidate_daily_score', {
      p_daily_run_id: randomUUID(),
      p_reason: 'Score inexistant contrôlé pendant la revue',
    });
    expect(missingScore.error?.message).toContain('daily_score_not_invalidateable');

    const shortReason = await administrator.client.rpc('invalidate_daily_score', {
      p_daily_run_id: dailyRunId,
      p_reason: 'Court',
    });
    expect(shortReason.error?.message).toContain('invalid_invalidation_reason');

    const validInvalidation = await administrator.client.rpc('invalidate_daily_score', {
      p_daily_run_id: dailyRunId,
      p_reason: '  Score manipulé\n\tconfirmé par la revue  ',
    });
    expect(validInvalidation.error).toBeNull();

    const [daily, audit, report, hiddenAudit] = await Promise.all([
      service
        .from('daily_runs')
        .select('invalidated_at, invalidated_by, invalidation_reason')
        .eq('id', dailyRunId)
        .single(),
      administrator.client
        .from('daily_score_invalidation_audit')
        .select('actor_user_id, daily_run_id, reason')
        .eq('daily_run_id', dailyRunId)
        .single(),
      service
        .from('daily_score_reports')
        .select('status, reviewed_by, reviewed_at')
        .eq('daily_run_id', dailyRunId)
        .single(),
      regular.client.from('daily_score_invalidation_audit').select('id'),
    ]);
    expect(daily.error).toBeNull();
    expect(daily.data).toMatchObject({
      invalidated_by: administrator.userId,
      invalidation_reason: 'Score manipulé confirmé par la revue',
    });
    expect(daily.data?.invalidated_at).toBeTruthy();
    expect(audit).toMatchObject({
      data: {
        actor_user_id: administrator.userId,
        daily_run_id: dailyRunId,
        reason: 'Score manipulé confirmé par la revue',
      },
      error: null,
    });
    expect(report.data).toMatchObject({
      status: 'actioned',
      reviewed_by: administrator.userId,
    });
    expect(report.data?.reviewed_at).toBeTruthy();
    expect(hiddenAudit).toMatchObject({ data: [], error: null });

    const auditMutation = await administrator.client
      .from('daily_score_invalidation_audit')
      .update({ reason: 'Une trace modifiée ne doit jamais être acceptée' })
      .eq('daily_run_id', dailyRunId);
    expect(auditMutation.error).not.toBeNull();

    const repeatedInvalidation = await administrator.client.rpc('invalidate_daily_score', {
      p_daily_run_id: dailyRunId,
      p_reason: 'Deuxième invalidation volontairement refusée',
    });
    expect(repeatedInvalidation.error?.message).toContain('daily_score_not_invalidateable');
  });
});
