import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeLive = supabaseUrl && anonKey && serviceRoleKey ? describe : describe.skip;

describeLive('legal privacy live contract', () => {
  it('keeps open and recent reports while purging only reviewed reports older than 24 months', async () => {
    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const service = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const denied = await anonymous.rpc('purge_expired_social_data');
    expect(denied.error).not.toBeNull();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const createdUser = await service.auth.admin.createUser({
      email: `retention-${suffix}@example.test`,
      password: 'Test-password-42!',
      email_confirm: true,
      user_metadata: { username: `retention-${suffix}`.slice(0, 50) },
    });
    if (createdUser.error || !createdUser.data.user) {
      throw createdUser.error ?? new Error('Retention test user was not created');
    }

    const userId = createdUser.data.user.id;
    const dailyRunIds = [randomUUID(), randomUUID(), randomUUID()];
    const reportIds = [randomUUID(), randomUUID(), randomUUID()];
    const monthsAgo = (months: number) => {
      const date = new Date();
      date.setUTCMonth(date.getUTCMonth() - months);
      return date.toISOString();
    };

    try {
      const profile = await service.from('players').select('id').eq('user_id', userId).single();
      if (profile.error || !profile.data) {
        throw profile.error ?? new Error('Retention test profile was not created');
      }

      const insertedRuns = await service.from('daily_runs').insert(
        dailyRunIds.map((id, index) => ({
          id,
          player_id: profile.data.id,
          daily_date: `2026-01-0${index + 1}`,
          daily_seed: 20260101 + index,
          completed_at: new Date().toISOString(),
        })),
      );
      expect(insertedRuns.error).toBeNull();

      const insertedReports = await service.from('daily_score_reports').insert([
        {
          id: reportIds[0],
          daily_run_id: dailyRunIds[0],
          reporter_user_id: userId,
          reason: 'Signalement encore ouvert à conserver',
          status: 'open',
        },
        {
          id: reportIds[1],
          daily_run_id: dailyRunIds[1],
          reporter_user_id: userId,
          reason: 'Signalement traité récemment à conserver',
          status: 'actioned',
          reviewed_at: monthsAgo(23),
          reviewed_by: userId,
        },
        {
          id: reportIds[2],
          daily_run_id: dailyRunIds[2],
          reporter_user_id: userId,
          reason: 'Signalement traité arrivé à échéance',
          status: 'dismissed',
          reviewed_at: monthsAgo(25),
          reviewed_by: userId,
        },
      ]);
      expect(insertedReports.error).toBeNull();

      const purged = await service.rpc('purge_expired_social_data');
      expect(purged).toMatchObject({ data: 1, error: null });

      const remaining = await service
        .from('daily_score_reports')
        .select('id, status')
        .in('id', reportIds);
      expect(remaining.error).toBeNull();
      expect(remaining.data).toEqual(
        expect.arrayContaining([
          { id: reportIds[0], status: 'open' },
          { id: reportIds[1], status: 'actioned' },
        ]),
      );
      expect(remaining.data).toHaveLength(2);

      const retry = await service.rpc('purge_expired_social_data');
      expect(retry).toMatchObject({ data: 0, error: null });
    } finally {
      await service.from('daily_runs').delete().in('id', dailyRunIds);
      await service.auth.admin.deleteUser(userId);
    }
  });
});
