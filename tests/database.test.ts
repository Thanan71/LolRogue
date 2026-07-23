import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const migrationSql = readFileSync(
  new URL('../supabase/migrations/00000000000000_schema.sql', import.meta.url),
  'utf8',
);
const signupUpgradeSql = readFileSync(
  new URL('../supabase/migrations/20260723000000_fix_signup_trigger.sql', import.meta.url),
  'utf8',
);
const adminUpgradeSql = readFileSync(
  new URL('../supabase/migrations/20260723010000_harden_admin_access.sql', import.meta.url),
  'utf8',
);
const atomicRunUpgradeSql = readFileSync(
  new URL('../supabase/migrations/20260723020000_atomic_run_save.sql', import.meta.url),
  'utf8',
);
const serviceRoleUpgradeSql = readFileSync(
  new URL('../supabase/migrations/20260723030000_grant_service_role.sql', import.meta.url),
  'utf8',
);
const dailyLeaderboardUpgradeSql = readFileSync(
  new URL('../supabase/migrations/20260723040000_daily_leaderboard_read.sql', import.meta.url),
  'utf8',
);

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseCredentials = Boolean(supabaseUrl && anonKey && serviceRoleKey);

if (process.env.DB_TEST_REQUIRED === '1' && !hasSupabaseCredentials) {
  throw new Error(
    'VITE_PUBLIC_SUPABASE_URL, VITE_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required for npm run test:db',
  );
}

describe('Supabase init migration', () => {
  it('keeps one clean init followed by the signup upgrade', () => {
    const migrationFiles = import.meta.glob('../supabase/migrations/*.sql');
    expect(Object.keys(migrationFiles).sort()).toEqual([
      '../supabase/migrations/00000000000000_schema.sql',
      '../supabase/migrations/20260723000000_fix_signup_trigger.sql',
      '../supabase/migrations/20260723010000_harden_admin_access.sql',
      '../supabase/migrations/20260723020000_atomic_run_save.sql',
      '../supabase/migrations/20260723030000_grant_service_role.sql',
      '../supabase/migrations/20260723040000_daily_leaderboard_read.sql',
    ]);
  });

  it('creates every table used by the application', () => {
    const requiredTables = [
      'players',
      'champion_mastery',
      'player_unlocks',
      'runs',
      'run_team_members',
      'daily_runs',
      'champion_enhancements',
      'logs',
    ];

    for (const table of requiredTables) {
      expect(migrationSql).toMatch(new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`));
    }
  });

  it('enables RLS and creates the signup profile trigger', () => {
    const protectedTables = [
      'players',
      'champion_mastery',
      'player_unlocks',
      'runs',
      'run_team_members',
      'daily_runs',
      'champion_enhancements',
      'logs',
    ];

    for (const table of protectedTables) {
      expect(migrationSql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
    expect(migrationSql).toContain('auth.uid()');
    expect(migrationSql).toContain('AFTER INSERT ON auth.users');
    expect(migrationSql).not.toContain('email_confirmed_at');
    expect(migrationSql).toContain('WHEN unique_violation THEN');
    expect(migrationSql).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  it('does not grant clients access to the is_admin column', () => {
    const playerGrant = migrationSql.match(
      /GRANT UPDATE \(([\s\S]*?)\) ON public\.players TO authenticated;/,
    );
    expect(playerGrant).not.toBeNull();
    expect(playerGrant?.[1]).not.toContain('is_admin');
    expect(migrationSql).toContain('REVOKE UPDATE (is_admin) ON public.players FROM authenticated');
  });

  it('filters admin views by the server-side admin check', () => {
    const adminViews = migrationSql.slice(
      migrationSql.indexOf('CREATE VIEW public.admin_stats'),
      migrationSql.indexOf('REVOKE ALL ON public.players'),
    );
    expect(adminViews.match(/WHERE public\.is_current_user_admin\(\)/g)).toHaveLength(2);
  });

  it('shares daily scores without opening writes to other players', () => {
    expect(migrationSql).toContain(
      'ON public.daily_runs FOR SELECT TO authenticated\n  USING (true)',
    );
    expect(dailyLeaderboardUpgradeSql).toContain(
      'DROP POLICY IF EXISTS "Daily runs read" ON public.daily_runs',
    );
    expect(dailyLeaderboardUpgradeSql).toContain('USING (true)');
    expect(dailyLeaderboardUpgradeSql).not.toContain('FOR INSERT');
    expect(dailyLeaderboardUpgradeSql).not.toContain('FOR UPDATE');
  });
});

describe('Supabase existing database upgrade', () => {
  it('replaces the signup function without deleting existing data', () => {
    expect(signupUpgradeSql).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()');
    expect(signupUpgradeSql).toContain('DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users');
    expect(signupUpgradeSql).toContain('WHEN unique_violation THEN');
    expect(signupUpgradeSql).toContain('ON CONFLICT (user_id) DO NOTHING');
    expect(signupUpgradeSql).not.toMatch(/\b(?:DROP|TRUNCATE)\s+TABLE\b/i);
    expect(signupUpgradeSql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('hardens admin permissions without deleting data', () => {
    expect(adminUpgradeSql).toContain(
      'REVOKE UPDATE (is_admin) ON public.players FROM anon, authenticated',
    );
    expect(adminUpgradeSql.match(/WHERE public\.is_current_user_admin\(\)/g)).toHaveLength(2);
    expect(adminUpgradeSql).toContain('WITH (security_invoker = true)');
    expect(adminUpgradeSql).not.toMatch(/\b(?:DROP|TRUNCATE)\s+TABLE\b/i);
    expect(adminUpgradeSql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('saves completed runs atomically and idempotently', () => {
    expect(atomicRunUpgradeSql).toContain('CREATE OR REPLACE FUNCTION public.save_completed_run');
    expect(atomicRunUpgradeSql).toContain('ON CONFLICT (run_uuid) DO NOTHING');
    expect(atomicRunUpgradeSql).toContain('GRANT EXECUTE ON FUNCTION public.save_completed_run');
    expect(atomicRunUpgradeSql).toContain(
      'games_played = public.champion_mastery.games_played + 1',
    );
    expect(atomicRunUpgradeSql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it('grants server-side access without exposing service credentials', () => {
    expect(serviceRoleUpgradeSql).toContain(
      'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role',
    );
    expect(serviceRoleUpgradeSql).toContain(
      'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role',
    );
    expect(serviceRoleUpgradeSql).not.toContain('anon');
    expect(serviceRoleUpgradeSql).not.toContain('authenticated');
  });
});

const describeLive = hasSupabaseCredentials ? describe : describe.skip;

describeLive('Supabase live integration', () => {
  const supabase = createClient(
    supabaseUrl ?? 'http://127.0.0.1:54321',
    serviceRoleKey ?? 'integration-test-not-configured',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  const testUserIds: string[] = [];

  afterEach(async () => {
    for (const userId of testUserIds.splice(0)) {
      await supabase.auth.admin.deleteUser(userId);
    }
  });

  it('can access all initialized tables', async () => {
    const tables = [
      'players',
      'champion_mastery',
      'player_unlocks',
      'runs',
      'run_team_members',
      'daily_runs',
      'champion_enhancements',
      'logs',
    ] as const;

    for (const table of tables) {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  });

  it('creates a player and stores a complete daily run', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: `lolrogue-db-test-${suffix}@example.invalid`,
      email_confirm: true,
      user_metadata: {
        username: `db-test-${suffix}`,
        display_name: 'Database Test',
      },
    });

    expect(authError).toBeNull();
    const testUserId = authData.user?.id;
    if (testUserId) testUserIds.push(testUserId);
    expect(testUserId).toBeTruthy();

    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('id, user_id, display_name')
      .eq('user_id', testUserId!)
      .single();
    expect(playerError).toBeNull();
    expect(player).toMatchObject({
      user_id: testUserId,
      display_name: 'Database Test',
    });

    const { data: run, error: runError } = await supabase
      .from('runs')
      .insert({
        player_id: player!.id,
        run_uuid: `run-${suffix}`,
        won: true,
        run_level: 6,
        waves_completed: 24,
        biomes_visited: ['top_lane', 'jungle', 'base'],
        gold_earned: 850,
        total_kills: 8,
        total_damage_dealt: 12500,
        seed: 20260723,
      })
      .select('id')
      .single();
    expect(runError).toBeNull();
    expect(run?.id).toBeTruthy();

    const { error: teamError } = await supabase.from('run_team_members').insert({
      run_id: run!.id,
      champion_id: 'Garen',
      final_level: 6,
      final_hp: 340,
      survived: true,
      kills: 8,
      damage_dealt: 12500,
    });
    expect(teamError).toBeNull();

    const { error: dailyError } = await supabase.from('daily_runs').insert({
      player_id: player!.id,
      daily_date: '2026-07-23',
      daily_seed: 20260723,
      score: 4200,
      won: true,
      run_level_reached: 6,
      waves_completed: 24,
      completed_at: new Date().toISOString(),
    });
    expect(dailyError).toBeNull();

    const { data: result, error: resultError } = await supabase
      .from('daily_runs')
      .select('score, waves_completed, run_level_reached')
      .eq('player_id', player!.id)
      .single();
    expect(resultError).toBeNull();
    expect(result).toEqual({
      score: 4200,
      waves_completed: 24,
      run_level_reached: 6,
    });
  });

  it('supports immediate signup, session restoration, logout and admin RLS', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const email = `lolrogue-auth-${suffix}@example.test`;
    const password = 'Test-password-42!';
    const username = `auth-test-${suffix}`.slice(0, 50);
    const userClient = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signup, error: signupError } = await userClient.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: 'Auth Integration Test' },
      },
    });

    expect(signupError).toBeNull();
    expect(signup.session).not.toBeNull();
    expect(signup.user?.email_confirmed_at).toBeTruthy();
    if (signup.user) testUserIds.push(signup.user.id);

    const { data: profile, error: profileError } = await userClient
      .from('players')
      .select('id, username, is_admin')
      .eq('user_id', signup.user!.id)
      .single();
    expect(profileError).toBeNull();
    expect(profile).toMatchObject({ username, is_admin: false });

    const { error: escalationError } = await userClient
      .from('players')
      .update({ is_admin: true })
      .eq('user_id', signup.user!.id);
    expect(escalationError).not.toBeNull();

    const { data: hiddenStats, error: hiddenStatsError } = await userClient
      .from('admin_stats')
      .select('*');
    const { data: hiddenPlayers, error: hiddenPlayersError } = await userClient
      .from('admin_player_stats')
      .select('*');
    expect(hiddenStatsError).toBeNull();
    expect(hiddenPlayersError).toBeNull();
    expect(hiddenStats).toEqual([]);
    expect(hiddenPlayers).toEqual([]);

    await userClient.auth.signOut();
    const loginClient = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: login, error: loginError } = await loginClient.auth.signInWithPassword({
      email,
      password,
    });
    expect(loginError).toBeNull();
    expect(login.session?.user.id).toBe(signup.user!.id);

    const restoredClient = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: restoreError } = await restoredClient.auth.setSession({
      access_token: login.session!.access_token,
      refresh_token: login.session!.refresh_token,
    });
    expect(restoreError).toBeNull();
    const { data: restored } = await restoredClient.auth.getSession();
    expect(restored.session?.user.id).toBe(signup.user!.id);

    const { error: promoteError } = await supabase
      .from('players')
      .update({ is_admin: true })
      .eq('user_id', signup.user!.id);
    expect(promoteError).toBeNull();

    const { data: adminStats, error: adminStatsError } = await restoredClient
      .from('admin_stats')
      .select('*');
    expect(adminStatsError).toBeNull();
    expect(adminStats?.length).toBeGreaterThan(0);

    const { error: logoutError } = await restoredClient.auth.signOut();
    expect(logoutError).toBeNull();
    const { data: loggedOut } = await restoredClient.auth.getSession();
    expect(loggedOut.session).toBeNull();
  });
});
