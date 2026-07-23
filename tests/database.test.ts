import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const migrationSql = readFileSync(
  new URL('../supabase/migrations/00000000000000_init.sql', import.meta.url),
  'utf8',
);

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseCredentials = Boolean(supabaseUrl && serviceRoleKey);

if (process.env.DB_TEST_REQUIRED === '1' && !hasSupabaseCredentials) {
  throw new Error(
    'VITE_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for npm run test:db',
  );
}

describe('Supabase init migration', () => {
  it('is the only SQL migration', () => {
    const migrationFiles = import.meta.glob('../supabase/migrations/*.sql');
    expect(Object.keys(migrationFiles)).toHaveLength(1);
    expect(Object.keys(migrationFiles)[0]).toContain('00000000000000_init.sql');
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
      expect(migrationSql).toMatch(
        new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`),
      );
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
      expect(migrationSql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
      );
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
  let testUserId: string | undefined;

  afterEach(async () => {
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId);
      testUserId = undefined;
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
      const { error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  });

  it('creates a player and stores a complete daily run', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: `lolrogue-db-test-${suffix}@example.invalid`,
        email_confirm: true,
        user_metadata: {
          username: `db-test-${suffix}`,
          display_name: 'Database Test',
        },
      });

    expect(authError).toBeNull();
    testUserId = authData.user?.id;
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

    const { error: teamError } = await supabase
      .from('run_team_members')
      .insert({
        run_id: run!.id,
        champion_id: 'Garen',
        final_level: 6,
        final_hp: 340,
        survived: true,
        kills: 8,
        damage_dealt: 12500,
      });
    expect(teamError).toBeNull();

    const { error: dailyError } = await supabase
      .from('daily_runs')
      .insert({
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
});
