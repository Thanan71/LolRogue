import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260723190000_initial_schema.sql',
    import.meta.url,
  ),
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

describe('Supabase migration', () => {
  it('creates every required game table', () => {
    const requiredTables = [
      'profiles',
      'runs',
      'run_champions',
      'run_inventory',
      'champion_mastery',
      'daily_leaderboard',
    ];

    for (const table of requiredTables) {
      expect(migrationSql).toMatch(
        new RegExp(`CREATE TABLE public\\.${table}\\s*\\(`),
      );
    }
  });

  it('enables RLS and auth.uid policies for every exposed table', () => {
    const protectedTables = [
      'profiles',
      'runs',
      'run_champions',
      'run_inventory',
      'champion_mastery',
      'daily_leaderboard',
    ];

    for (const table of protectedTables) {
      expect(migrationSql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`,
      );
    }
    expect(migrationSql).toContain('auth.uid()');
    expect(migrationSql).toContain('AFTER INSERT ON auth.users');
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
      'profiles',
      'runs',
      'run_champions',
      'run_inventory',
      'champion_mastery',
      'daily_leaderboard',
    ] as const;

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      if (error) {
        throw new Error(`${table}: ${error.message}`);
      }
      expect(error).toBeNull();
    }
  });

  it('creates a user profile and stores a complete daily run', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: `lolrogue-db-test-${suffix}@example.invalid`,
        email_confirm: true,
        user_metadata: { display_name: 'Database Test' },
      });

    expect(authError).toBeNull();
    testUserId = authData.user?.id;
    expect(testUserId).toBeTruthy();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', testUserId!)
      .single();
    expect(profileError).toBeNull();
    expect(profile).toMatchObject({
      id: testUserId,
      display_name: 'Database Test',
    });

    const { data: run, error: runError } = await supabase
      .from('runs')
      .insert({
        user_id: testUserId,
        mode: 'daily',
        daily_key: '2026-07-23',
        seed: 20260723,
        status: 'completed',
        won: true,
        run_level: 6,
        waves_completed: 24,
        gold_earned: 850,
        score: 4200,
        biomes_visited: ['top_lane', 'jungle', 'base'],
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(runError).toBeNull();
    expect(run?.id).toBeTruthy();

    const { error: championError } = await supabase
      .from('run_champions')
      .insert({
        run_id: run!.id,
        champion_id: 'Garen',
        team_position: 1,
        champion_level: 6,
        current_hp: 340,
        kills: 8,
        total_damage: 12500,
      });
    expect(championError).toBeNull();

    const { error: inventoryError } = await supabase
      .from('run_inventory')
      .insert({
        run_id: run!.id,
        instance_id: `item-${suffix}`,
        item_id: 'BF_SWORD',
        equipped_to_champion_id: 'Garen',
      });
    expect(inventoryError).toBeNull();

    const { error: leaderboardError } = await supabase
      .from('daily_leaderboard')
      .insert({
        daily_key: '2026-07-23',
        user_id: testUserId,
        run_id: run!.id,
        score: 4200,
        waves_completed: 24,
        run_level: 6,
      });
    expect(leaderboardError).toBeNull();

    const { data: result, error: resultError } = await supabase
      .from('daily_leaderboard')
      .select('score, waves_completed, run_level')
      .eq('run_id', run!.id)
      .single();
    expect(resultError).toBeNull();
    expect(result).toEqual({
      score: 4200,
      waves_completed: 24,
      run_level: 6,
    });
  });
});
