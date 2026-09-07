import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '@/types/database';

const attemptMigration = readFileSync(
  new URL('../supabase/migrations/20260724090000_verified_run_attempts.sql', import.meta.url),
  'utf8',
);
const runAttemptService = readFileSync(
  new URL('../src/services/runAttemptService.ts', import.meta.url),
  'utf8',
);

describe('open run attempt read contract', () => {
  it('uses the existing owner-only RLS policy and selects no journal or result payload', () => {
    expect(attemptMigration).toContain('ALTER TABLE public.run_attempts ENABLE ROW LEVEL SECURITY');
    expect(attemptMigration).toContain('CREATE POLICY "Run attempts read own"');
    expect(attemptMigration).toContain('USING (user_id = (SELECT auth.uid()))');
    expect(attemptMigration).toContain(
      'GRANT SELECT ON TABLE public.run_attempts TO authenticated',
    );
    expect(runAttemptService).toContain(".select('id,start_command_id,status,expires_at')");
  });
});

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeLive = supabaseUrl && anonKey && serviceRoleKey ? describe : describe.skip;

describeLive('open run attempt live RLS', () => {
  it('returns the row to its owner while hiding it from another user and anon', async () => {
    const admin = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const createdUserIds: string[] = [];

    async function createUser(label: string): Promise<SupabaseClient<Database>> {
      const suffix = `${Date.now()}-${randomUUID()}`;
      const client = createClient<Database>(supabaseUrl!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signup = await client.auth.signUp({
        email: `open-attempt-${label}-${suffix}@example.test`,
        password: 'Test-password-42!',
        options: { data: { username: `open-${label}-${suffix}`.slice(0, 50) } },
      });
      expect(signup.error).toBeNull();
      expect(signup.data.session).not.toBeNull();
      createdUserIds.push(signup.data.user!.id);
      return client;
    }

    try {
      const owner = await createUser('owner');
      const other = await createUser('other');
      const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const started = await owner.rpc('start_run_attempt', {
        p_command_id: randomUUID(),
        p_team: ['Garen'],
        p_rune_ids: [],
        p_difficulty: 'normal',
        p_mode: 'normal',
      });
      expect(started.error).toBeNull();
      const attemptId = (started.data as { attempt_id: string }).attempt_id;

      const ownerRead = await owner
        .from('run_attempts')
        .select('id,start_command_id,status,expires_at')
        .in('status', ['started', 'finished']);
      expect(ownerRead.error).toBeNull();
      expect(ownerRead.data).toEqual([
        expect.objectContaining({ id: attemptId, status: 'started' }),
      ]);

      const otherRead = await other
        .from('run_attempts')
        .select('id,start_command_id,status,expires_at')
        .in('status', ['started', 'finished']);
      expect(otherRead).toMatchObject({ data: [], error: null });

      const anonymousRead = await anonymous
        .from('run_attempts')
        .select('id,start_command_id,status,expires_at')
        .in('status', ['started', 'finished']);
      expect(anonymousRead.error).not.toBeNull();
    } finally {
      for (const userId of createdUserIds) {
        await admin.auth.admin.deleteUser(userId);
      }
    }
  });
});
