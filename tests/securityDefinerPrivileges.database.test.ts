import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260809120000_harden_security_definer_privileges.sql',
    import.meta.url,
  ),
  'utf8',
);
const manifest = JSON.parse(
  readFileSync(new URL('../config/security-definer-privileges.json', import.meta.url), 'utf8'),
) as {
  functions: Array<{ signature: string; roles: string[]; justification: string }>;
};
const runAttemptService = readFileSync(
  new URL('../src/services/runAttemptService.ts', import.meta.url),
  'utf8',
);
const verifyRunEdge = readFileSync(
  new URL('../supabase/functions/verify-run/index.ts', import.meta.url),
  'utf8',
);

describe('SECURITY DEFINER privilege contract', () => {
  it('revokes every privileged function before granting the manifest surface', () => {
    expect(migration).toContain('AND function_proc.prosecdef');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
    );
    expect(migration).toContain('ALTER DEFAULT PRIVILEGES IN SCHEMA public');
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC');
  });

  it('keeps trigger, compatibility and maintenance functions out of browser roles', () => {
    const clientCallable = manifest.functions
      .filter((entry) => entry.roles.some((role) => role === 'anon' || role === 'authenticated'))
      .map((entry) => entry.signature);
    for (const forbidden of [
      'handle_new_user',
      'expire_stale_run_attempts',
      'purge_expired_social_data',
      'complete_run_verification_v',
      'save_completed_run',
    ]) {
      expect(clientCallable.join('\n')).not.toContain(forbidden);
    }
    expect(
      manifest.functions.find((entry) => entry.signature === 'public.is_current_user_admin()')
        ?.roles,
    ).toEqual(['authenticated']);
    expect(
      manifest.functions.find(
        (entry) => entry.signature === 'public.invalidate_daily_score(uuid, text)',
      )?.roles,
    ).toEqual(['authenticated']);
    expect(
      manifest.functions.find((entry) => entry.signature === 'public.purge_expired_social_data()')
        ?.roles,
    ).toEqual(['service_role']);
  });

  it('documents every grant and never authorizes from mutable auth metadata', () => {
    expect(manifest.functions.every((entry) => entry.justification.length >= 20)).toBe(true);
    expect(migration).not.toMatch(
      /raw_user_meta_data|user_metadata|raw_app_meta_data|app_metadata/,
    );
    expect(migration).toContain('v_user_id UUID := (SELECT auth.uid())');
    expect(migration).toContain('AND user_id = v_user_id');
  });

  it('moves expiry into trusted lifecycle commands and removes direct client calls', () => {
    expect(migration.match(/PERFORM public\.expire_stale_run_attempts\(\);/g)).toHaveLength(2);
    expect(migration).toContain("AND status IN ('started', 'finished')");
    expect(runAttemptService).not.toContain("'expire_stale_run_attempts'");
    expect(verifyRunEdge).not.toContain("caller.rpc('expire_stale_run_attempts'");
    expect(verifyRunEdge).toContain("claim.status === 'expired'");
  });
});

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeLive = supabaseUrl && anonKey && serviceRoleKey ? describe : describe.skip;

describeLive('SECURITY DEFINER live privilege contract', () => {
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

  it('allows only the documented anonymous and authenticated surface', async () => {
    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const challenge = await anonymous.rpc('get_daily_challenge');
    const anonymousAdmin = await anonymous.rpc('is_current_user_admin');
    expect(challenge.error).toBeNull();
    expect(anonymousAdmin.error).not.toBeNull();

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signup = await client.auth.signUp({
      email: `security-definer-${suffix}@example.test`,
      password: 'Test-password-42!',
      options: { data: { username: `security-${suffix}`.slice(0, 50) } },
    });
    if (signup.error || !signup.data.user || !signup.data.session) {
      throw signup.error ?? new Error('Security privilege test user did not receive a session');
    }
    createdUserIds.push(signup.data.user.id);

    const adminCheck = await client.rpc('is_current_user_admin');
    const touched = await client.rpc('touch_player_last_login');
    const directExpiry = await client.rpc('expire_stale_run_attempts');
    const directPurge = await client.rpc('purge_expired_social_data');
    const directInvalidation = await client.rpc('invalidate_daily_score', {
      p_daily_run_id: randomUUID(),
      p_reason: 'Tentative de modération directe interdite',
    });
    expect(adminCheck).toMatchObject({ data: false, error: null });
    expect(touched.error).toBeNull();
    expect(directExpiry.error).not.toBeNull();
    expect(directPurge.error).not.toBeNull();
    expect(directInvalidation.error?.message).toContain('admin_required');
  });

  it('keeps start concurrency and maintenance privileges server-controlled', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const client = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signup = await client.auth.signUp({
      email: `security-expiry-${suffix}@example.test`,
      password: 'Test-password-42!',
      options: { data: { username: `expiry-${suffix}`.slice(0, 50) } },
    });
    if (signup.error || !signup.data.user || !signup.data.session) {
      throw signup.error ?? new Error('Security expiry test user did not receive a session');
    }
    createdUserIds.push(signup.data.user.id);

    const firstStart = await client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(firstStart.error).toBeNull();

    const secondStart = await client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(secondStart.error?.message).toContain('run_attempt_already_open');

    const servicePurge = await admin.rpc('purge_expired_social_data');
    const legacyHelper = await admin.rpc('daily_starter_ids', {
      p_daily_date: new Date().toISOString().slice(0, 10),
      p_ruleset_version: 13,
    });
    expect(servicePurge.error).toBeNull();
    expect(legacyHelper.error).not.toBeNull();
  });
});
