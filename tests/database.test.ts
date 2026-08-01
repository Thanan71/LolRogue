import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { championDB } from '@/data/championDatabase';
import { ENHANCEMENT_TREES_BY_ROLE } from '@/data/enhancementTrees';

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
const atomicDailyUpgradeSql = readFileSync(
  new URL('../supabase/migrations/20260723050000_atomic_daily_submission.sql', import.meta.url),
  'utf8',
);
const atomicMasteryEnhancementsSql = readFileSync(
  new URL('../supabase/migrations/20260723060000_atomic_mastery_enhancements.sql', import.meta.url),
  'utf8',
);
const runLoadoutSql = readFileSync(
  new URL('../supabase/migrations/20260723070000_run_loadout.sql', import.meta.url),
  'utf8',
);
const normalizedRunPayloadSql = readFileSync(
  new URL(
    '../supabase/migrations/20260723080000_normalize_run_integer_payload.sql',
    import.meta.url,
  ),
  'utf8',
);
const authoritativeProgressionSql = readFileSync(
  new URL(
    '../supabase/migrations/20260723090000_server_authoritative_progression.sql',
    import.meta.url,
  ),
  'utf8',
);
const verifiedRunAttemptsSql = readFileSync(
  new URL('../supabase/migrations/20260724090000_verified_run_attempts.sql', import.meta.url),
  'utf8',
);
const authoritativeDailySql = readFileSync(
  new URL(
    '../supabase/migrations/20260726090000_authoritative_daily_leaderboard.sql',
    import.meta.url,
  ),
  'utf8',
);
const hardenedPublicDataSql = readFileSync(
  new URL(
    '../supabase/migrations/20260726180000_minimize_public_data_and_harden_logs.sql',
    import.meta.url,
  ),
  'utf8',
);
const atomicRunFinalizationSql = readFileSync(
  new URL('../supabase/migrations/20260726210000_atomic_run_finalization.sql', import.meta.url),
  'utf8',
);
const protectedRunStartSql = readFileSync(
  new URL('../supabase/migrations/20260726220000_protect_active_run_start.sql', import.meta.url),
  'utf8',
);

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasSupabaseCredentials = Boolean(supabaseUrl && anonKey && serviceRoleKey);

type CatalogChampion = {
  championId: string;
  primaryRole: string;
};

type CatalogEnhancementNode = {
  nodeId: string;
  championRole: string;
  candyCost: number;
  maxRank: number;
  requiredMasteryLevel: number;
  prerequisiteNodeIds: string[];
};

function parseChampionCatalog(sql: string): CatalogChampion[] {
  const start = sql.indexOf(
    'INSERT INTO public.progression_champion_catalog (champion_id, primary_role)',
  );
  const end = sql.indexOf('INSERT INTO public.enhancement_node_catalog', start);
  if (start < 0 || end < 0) return [];

  return [...sql.slice(start, end).matchAll(/\('([^']+)', '([^']+)'\)/g)].map((match) => ({
    championId: match[1],
    primaryRole: match[2],
  }));
}

function parseEnhancementCatalog(sql: string): CatalogEnhancementNode[] {
  const start = sql.indexOf('INSERT INTO public.enhancement_node_catalog');
  const end = sql.indexOf('CREATE TRIGGER progression_champion_catalog_set_updated_at', start);
  if (start < 0 || end < 0) return [];

  const rowPattern =
    /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*ARRAY\[(.*?)\]::TEXT\[\]\s*\)/gs;

  return [...sql.slice(start, end).matchAll(rowPattern)].map((match) => ({
    nodeId: match[1],
    championRole: match[2],
    candyCost: Number(match[3]),
    maxRank: Number(match[4]),
    requiredMasteryLevel: Number(match[5]),
    prerequisiteNodeIds: [...match[6].matchAll(/'([^']+)'/g)].map(
      (prerequisite) => prerequisite[1],
    ),
  }));
}

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
      '../supabase/migrations/20260723050000_atomic_daily_submission.sql',
      '../supabase/migrations/20260723060000_atomic_mastery_enhancements.sql',
      '../supabase/migrations/20260723070000_run_loadout.sql',
      '../supabase/migrations/20260723080000_normalize_run_integer_payload.sql',
      '../supabase/migrations/20260723090000_server_authoritative_progression.sql',
      '../supabase/migrations/20260724090000_verified_run_attempts.sql',
      '../supabase/migrations/20260724190000_harden_verified_attempt_contract.sql',
      '../supabase/migrations/20260726090000_authoritative_daily_leaderboard.sql',
      '../supabase/migrations/20260726180000_minimize_public_data_and_harden_logs.sql',
      '../supabase/migrations/20260726210000_atomic_run_finalization.sql',
      '../supabase/migrations/20260726220000_protect_active_run_start.sql',
      '../supabase/migrations/20260727170000_gameplay_ruleset_v2.sql',
      '../supabase/migrations/20260727180000_daily_challenge_ruleset_v2.sql',
      '../supabase/migrations/20260730170000_gameplay_ruleset_v3_manual_combat.sql',
      '../supabase/migrations/20260730190000_gameplay_ruleset_v4_run_progression.sql',
      '../supabase/migrations/20260730210000_gameplay_ruleset_v5_combat_trace_replay.sql',
      '../supabase/migrations/20260730220000_progression_v2_late_run_completion.sql',
      '../supabase/migrations/20260730230000_stackable_augment_completion.sql',
      '../supabase/migrations/20260730240000_gameplay_ruleset_v6_encounter_balance.sql',
      '../supabase/migrations/20260730250000_progression_v2_engine_v6.sql',
      '../supabase/migrations/20260730260000_gameplay_ruleset_v7_run_ledger.sql',
      '../supabase/migrations/20260730270000_verified_run_ledger.sql',
      '../supabase/migrations/20260730280000_mastery_contract.sql',
      '../supabase/migrations/20260730290000_gameplay_ruleset_v8_mastery.sql',
      '../supabase/migrations/20260730300000_gameplay_ruleset_v9_domain_invariants.sql',
      '../supabase/migrations/20260731120000_gameplay_ruleset_v10_client_authority_parity.sql',
      '../supabase/migrations/20260731150000_gameplay_ruleset_v11_automatic_trace_suffix.sql',
      '../supabase/migrations/20260801090000_gameplay_ruleset_v12_canonical_stats.sql',
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

  it('normalizes decimal combat statistics before integer database casts', () => {
    expect(normalizedRunPayloadSql).toContain('RENAME TO save_completed_run_integer_payload');
    expect(normalizedRunPayloadSql).toContain(
      "ROUND(COALESCE((v_run ->> 'total_damage_dealt')::NUMERIC, 0))",
    );
    expect(normalizedRunPayloadSql).toContain(
      "ROUND(COALESCE((value ->> 'damage_dealt')::NUMERIC, 0))",
    );
    expect(normalizedRunPayloadSql).toContain(
      "ROUND(COALESCE((value ->> 'total_damage')::NUMERIC, 0))",
    );
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

  it('calculates one immutable daily score on the server', () => {
    expect(atomicDailyUpgradeSql).toContain('CREATE OR REPLACE FUNCTION public.submit_daily_run');
    expect(atomicDailyUpgradeSql).toContain('ON CONFLICT (player_id, daily_date) DO NOTHING');
    expect(atomicDailyUpgradeSql).toContain('daily_run_already_submitted');
    expect(atomicDailyUpgradeSql).toContain(
      'REVOKE INSERT, UPDATE, DELETE ON public.daily_runs FROM authenticated',
    );
    expect(atomicDailyUpgradeSql).toContain('(p_waves_completed * 100)');
    expect(atomicDailyUpgradeSql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it('retires metric submission and derives the leaderboard from verified attempts', () => {
    expect(authoritativeDailySql).toContain('CREATE TABLE public.daily_challenge_rulesets');
    expect(authoritativeDailySql).toContain('CREATE FUNCTION public.get_daily_challenge()');
    expect(authoritativeDailySql).toContain('CREATE FUNCTION public.start_daily_run_attempt');
    expect(authoritativeDailySql).toContain('CREATE FUNCTION public.record_verified_daily_run()');
    expect(authoritativeDailySql).toContain("NEW.mode <> 'daily'");
    expect(authoritativeDailySql).toContain("'one_official_attempt_per_utc_day'");
    expect(authoritativeDailySql).toContain("v_last_command_kind = 'abandon_run'");
    expect(authoritativeDailySql).toContain('CREATE VIEW public.daily_leaderboard');
    expect(authoritativeDailySql).toContain('DROP FUNCTION public.submit_daily_run');
    expect(authoritativeDailySql).toContain('REVOKE ALL ON TABLE public.daily_runs');
    expect(authoritativeDailySql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('minimizes public leaderboard data and hardens client diagnostics', () => {
    const leaderboardSql = hardenedPublicDataSql.slice(
      hardenedPublicDataSql.indexOf('CREATE VIEW public.leaderboard'),
      hardenedPublicDataSql.indexOf('CREATE FUNCTION public.get_my_leaderboard_rank'),
    );

    expect(leaderboardSql).toContain('player_name');
    expect(leaderboardSql).toContain('total_wins');
    expect(leaderboardSql).not.toContain('last_login_at');
    expect(leaderboardSql).not.toContain('total_candies');
    expect(leaderboardSql).not.toContain('player_id');
    expect(leaderboardSql).not.toContain('user_id');
    expect(hardenedPublicDataSql).toContain('v_user_id UUID := (SELECT auth.uid())');
    expect(hardenedPublicDataSql).toContain('REVOKE INSERT ON TABLE public.logs');
    expect(hardenedPublicDataSql).toContain('CREATE FUNCTION public.submit_client_logs');
    expect(hardenedPublicDataSql).toContain('v_recent_minute + v_batch_size > 30');
    expect(hardenedPublicDataSql).toContain('OCTET_LENGTH(p_logs::TEXT) > 65536');
    expect(hardenedPublicDataSql).toContain('public.sanitize_log_jsonb');
    expect(hardenedPublicDataSql).toContain("INTERVAL '14 days'");
    expect(hardenedPublicDataSql).toContain("'lolrogue-purge-expired-client-logs'");
    expect(hardenedPublicDataSql).toContain('OFFSET 2000');
    expect(hardenedPublicDataSql).toContain('v_user_id,');
    expect(hardenedPublicDataSql).toContain('v_player_id,');
  });

  it('persists terminal resources in the verified run transaction', () => {
    expect(atomicRunFinalizationSql).toContain(
      'DROP FUNCTION public.save_run_loadout(TEXT, TEXT[], TEXT[])',
    );
    expect(atomicRunFinalizationSql).toMatch(/BEGIN;[\s\S]*COMMIT;/);

    const completionStart = verifiedRunAttemptsSql.indexOf(
      'CREATE FUNCTION public.complete_run_verification(',
    );
    const completionEnd = verifiedRunAttemptsSql.indexOf(
      'REVOKE ALL ON FUNCTION public.complete_run_verification',
      completionStart,
    );
    const completionBody = verifiedRunAttemptsSql.slice(completionStart, completionEnd);
    expect(completionBody).toContain('INSERT INTO public.runs');
    expect(completionBody).toContain('v_attempt.rune_ids');
    expect(completionBody).toContain('v_augments');
    expect(completionBody).toContain('INSERT INTO public.run_team_members');
    expect(completionBody).toContain('items_collected');
    expect(completionBody).toContain('UPDATE public.players');
    expect(completionBody).toContain('INSERT INTO public.champion_mastery');
  });

  it('serializes starts through verification and enforces unlocked starter slots', () => {
    expect(protectedRunStartSql).toContain("WHERE status IN ('started', 'finished', 'verifying')");
    expect(protectedRunStartSql).toContain('CREATE UNIQUE INDEX run_attempts_one_open_per_user');
    expect(protectedRunStartSql).toContain(
      'CREATE FUNCTION public.reject_concurrent_run_attempt_start',
    );
    expect(protectedRunStartSql).toContain("RAISE EXCEPTION 'run_attempt_already_open'");
    expect(protectedRunStartSql).toContain("'starter_slot_2' = ANY(mastery.unlocked_ids)");
    expect(protectedRunStartSql).toContain("'starter_slot_3' = ANY(mastery.unlocked_ids)");
    expect(protectedRunStartSql).toContain("RAISE EXCEPTION 'starter_slots_locked'");
    expect(protectedRunStartSql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it('increments mastery and spends enhancement candies atomically', () => {
    expect(atomicMasteryEnhancementsSql).toContain(
      'total_candies = public.champion_mastery.total_candies + EXCLUDED.total_candies',
    );
    expect(atomicMasteryEnhancementsSql).toContain(
      'games_played = public.champion_mastery.games_played + 1',
    );
    expect(atomicMasteryEnhancementsSql).toContain(
      'total_kills = public.champion_mastery.total_kills + EXCLUDED.total_kills',
    );
    expect(atomicMasteryEnhancementsSql).toContain(
      'total_damage_dealt = public.champion_mastery.total_damage_dealt + EXCLUDED.total_damage_dealt',
    );
    expect(atomicMasteryEnhancementsSql).toContain(
      'CREATE OR REPLACE FUNCTION public.unlock_champion_enhancement',
    );
    expect(atomicMasteryEnhancementsSql).toContain('FOR UPDATE');
    expect(atomicMasteryEnhancementsSql).toContain("RAISE EXCEPTION 'insufficient_candies'");
    expect(atomicMasteryEnhancementsSql).toContain(
      'REVOKE UPDATE (total_candies) ON public.players FROM authenticated',
    );
    expect(atomicMasteryEnhancementsSql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it('persists rune and augment loadouts for owned runs', () => {
    expect(runLoadoutSql).toContain('ADD COLUMN IF NOT EXISTS rune_ids');
    expect(runLoadoutSql).toContain('ADD COLUMN IF NOT EXISTS augment_ids');
    expect(runLoadoutSql).toContain('player.user_id = (SELECT auth.uid())');
    expect(runLoadoutSql).toContain('GRANT EXECUTE ON FUNCTION public.save_run_loadout');
  });

  it('adds the authoritative progression upgrade without deleting existing player data', () => {
    expect(authoritativeProgressionSql).toContain('BEGIN;');
    expect(authoritativeProgressionSql).toContain('COMMIT;');
    expect(authoritativeProgressionSql).not.toMatch(/\b(?:DROP|TRUNCATE)\s+TABLE\b/i);
    expect(authoritativeProgressionSql).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('keeps the server champion catalog unique and aligned with the application catalog', () => {
    const serverCatalog = parseChampionCatalog(authoritativeProgressionSql);
    const expectedCatalog = championDB.getAll().map((champion) => ({
      championId: champion.id,
      primaryRole: champion.tags[0].toLowerCase(),
    }));
    const byChampionId = (left: CatalogChampion, right: CatalogChampion) =>
      left.championId.localeCompare(right.championId);

    expect(serverCatalog.length).toBeGreaterThan(0);
    expect(new Set(serverCatalog.map(({ championId }) => championId)).size).toBe(
      serverCatalog.length,
    );
    expect(serverCatalog.sort(byChampionId)).toEqual(expectedCatalog.sort(byChampionId));
  });

  it('keeps authoritative enhancement costs and requirements aligned with the UI trees', () => {
    const serverCatalog = parseEnhancementCatalog(authoritativeProgressionSql);
    const expectedCatalog = Object.entries(ENHANCEMENT_TREES_BY_ROLE).flatMap(([role, tree]) =>
      [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)].map((node) => ({
        nodeId: node.id,
        championRole: role.toLowerCase(),
        candyCost: node.candyCost,
        maxRank: node.maxRanks ?? 1,
        requiredMasteryLevel: node.requiredMasteryLevel,
        prerequisiteNodeIds: node.prerequisites,
      })),
    );
    const byNodeId = (left: CatalogEnhancementNode, right: CatalogEnhancementNode) =>
      left.nodeId.localeCompare(right.nodeId);

    expect(serverCatalog.length).toBeGreaterThan(0);
    expect(new Set(serverCatalog.map(({ nodeId }) => nodeId)).size).toBe(serverCatalog.length);
    expect(serverCatalog.sort(byNodeId)).toEqual(expectedCatalog.sort(byNodeId));
  });

  it('revokes every direct authenticated mutation path for derived progression', () => {
    for (const table of [
      'champion_mastery',
      'player_unlocks',
      'runs',
      'run_team_members',
      'champion_enhancements',
    ]) {
      expect(authoritativeProgressionSql).toContain(
        `REVOKE ALL ON TABLE public.${table} FROM anon, authenticated`,
      );
      expect(authoritativeProgressionSql).toContain(
        `GRANT SELECT ON TABLE public.${table} TO authenticated`,
      );
    }

    expect(authoritativeProgressionSql).toContain(
      'GRANT UPDATE (display_name, avatar_url) ON TABLE public.players TO authenticated',
    );
    expect(authoritativeProgressionSql).toMatch(
      /REVOKE UPDATE \([\s\S]*?level,[\s\S]*?total_candies,[\s\S]*?total_runs_completed,[\s\S]*?total_wins,[\s\S]*?total_waves_completed,[\s\S]*?last_login_at[\s\S]*?\) ON TABLE public\.players FROM anon, authenticated;/,
    );
    expect(authoritativeProgressionSql).toContain(
      'DROP POLICY IF EXISTS "Mastery write own" ON public.champion_mastery',
    );
    expect(authoritativeProgressionSql).toContain(
      'DROP POLICY IF EXISTS "Unlocks insert own" ON public.player_unlocks',
    );
    expect(authoritativeProgressionSql).toContain(
      'DROP POLICY IF EXISTS "Runs insert own" ON public.runs',
    );
    expect(authoritativeProgressionSql).toContain(
      'DROP POLICY IF EXISTS "Run team insert own" ON public.run_team_members',
    );
    expect(authoritativeProgressionSql).toContain(
      'DROP POLICY IF EXISTS "Enhancements manage own" ON public.champion_enhancements',
    );
  });

  it('moves last-login writes behind a narrow authenticated command', () => {
    expect(authoritativeProgressionSql).toContain(
      'CREATE FUNCTION public.touch_player_last_login()',
    );
    expect(authoritativeProgressionSql).toContain('SET last_login_at = NOW()');
    expect(authoritativeProgressionSql).toContain('WHERE user_id = (SELECT auth.uid())');
    expect(authoritativeProgressionSql).toContain(
      'REVOKE ALL ON FUNCTION public.touch_player_last_login() FROM PUBLIC, anon, authenticated',
    );
    expect(authoritativeProgressionSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.touch_player_last_login() TO authenticated, service_role',
    );
  });

  it('derives run progression server-side and rejects the legacy client-owned payload', () => {
    const functionStart = authoritativeProgressionSql.indexOf(
      'CREATE FUNCTION public.save_completed_run_v2(',
    );
    const signatureEnd = authoritativeProgressionSql.indexOf('RETURNS JSONB', functionStart);
    const functionEnd = authoritativeProgressionSql.indexOf(
      'REVOKE ALL ON FUNCTION public.save_completed_run_v2',
      signatureEnd,
    );
    const signature = authoritativeProgressionSql.slice(functionStart, signatureEnd);
    const body = authoritativeProgressionSql.slice(signatureEnd, functionEnd);

    expect(signature).toContain('p_run JSONB');
    expect(signature).toContain('p_team_members JSONB');
    expect(signature).toContain('p_rune_ids TEXT[]');
    expect(signature).toContain('p_augment_ids TEXT[]');
    expect(signature).not.toContain('p_mastery');
    expect(signature).not.toContain('p_total_candies');
    expect(body).toContain("RAISE EXCEPTION 'unexpected_run_field:%'");
    expect(body).toContain("RAISE EXCEPTION 'unexpected_team_member_field:%'");
    expect(body).toContain('v_total_kills := v_total_kills + v_kills');
    expect(body).toContain('v_total_damage := v_total_damage + v_damage');
    expect(body).toContain('v_ruleset.base_candies');
    expect(body).toContain('v_ruleset.candies_per_wave');
    expect(body).toContain('v_ruleset.candies_per_biome');
    expect(body).toContain('v_ruleset.victory_bonus');
    expect(body).toContain("RAISE EXCEPTION 'unknown_champion:%'");
    expect(body).toContain("RAISE EXCEPTION 'invalid_biome_path'");
    expect(body).toContain("RAISE EXCEPTION 'invalid_victory_claim'");
    expect(body).toContain("jsonb_typeof(value) IS DISTINCT FROM 'string'");
    expect(body).toContain('v_waves_completed < v_ruleset.min_victory_waves');
    expect(body).toContain('v_run_level <> v_ruleset.max_run_level');
    expect(body).toContain('NOT v_won AND v_run_level <> 1');
    expect(body).toContain('v_won AND v_survivor_count = 0');
    expect(body).toContain('WHERE run.run_uuid = v_run_uuid');
    expect(body).toContain('WHERE version = v_existing_version');
    expect(body).toContain('IF NOT v_replay_candidate AND (');
    expect(body).toContain("RAISE EXCEPTION 'idempotency_key_reused'");
    expect(authoritativeProgressionSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.save_completed_run_v2(JSONB, JSONB, TEXT[], TEXT[])',
    );

    for (const legacySignature of [
      'public.save_completed_run(JSONB, JSONB, JSONB, INTEGER)',
      'public.save_completed_run_integer_payload(JSONB, JSONB, JSONB, INTEGER)',
      'public.save_run_loadout(TEXT, TEXT[], TEXT[])',
    ]) {
      expect(authoritativeProgressionSql).toContain(
        `REVOKE ALL ON FUNCTION ${legacySignature}\n  FROM PUBLIC, anon, authenticated`,
      );
    }
  });

  it('derives enhancement price, role and rank from a versioned server catalog', () => {
    const functionStart = authoritativeProgressionSql.indexOf(
      'CREATE FUNCTION public.unlock_champion_enhancement(',
    );
    const signatureEnd = authoritativeProgressionSql.indexOf('RETURNS JSONB', functionStart);
    const functionEnd = authoritativeProgressionSql.indexOf(
      'REVOKE ALL ON FUNCTION public.unlock_champion_enhancement(TEXT, TEXT, INTEGER, UUID)',
      signatureEnd,
    );
    const signature = authoritativeProgressionSql.slice(functionStart, signatureEnd);
    const body = authoritativeProgressionSql.slice(signatureEnd, functionEnd);

    expect(signature).toContain('p_champion_id TEXT');
    expect(signature).toContain('p_node_id TEXT');
    expect(signature).toContain('p_expected_rank INTEGER');
    expect(signature).toContain('p_command_id UUID');
    expect(signature).not.toContain('p_candy_cost');
    expect(signature).not.toContain('p_max_rank');
    expect(body).toContain('FROM public.enhancement_node_catalog AS node');
    expect(body).toContain('champion.primary_role = node.champion_role');
    expect(body).toContain('v_player.total_candies < v_node.candy_cost');
    expect(body).toContain('v_current_rank <> p_expected_rank');
    expect(body).toContain('v_current_rank >= v_node.max_rank');
    expect(body).toContain('FOREACH v_prerequisite IN ARRAY v_node.prerequisite_node_ids');
    expect(body.indexOf('FROM public.progression_commands')).toBeLessThan(
      body.indexOf('WHERE is_active'),
    );
    expect(body).toContain("RAISE EXCEPTION 'enhancement_rank_conflict' USING ERRCODE = '22023'");
    expect(body).not.toContain(
      "RAISE EXCEPTION 'enhancement_rank_conflict' USING ERRCODE = '40001'",
    );
    expect(body).toContain("RAISE EXCEPTION 'idempotency_key_reused'");
    expect(body).toContain("'{replayed}'");
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

  it('rejects anonymous progression commands and direct writes', async () => {
    const anonymousClient = createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const anonymousRunUuid = `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const commandAttempts = await Promise.all([
      anonymousClient.rpc('touch_player_last_login'),
      anonymousClient.rpc('save_completed_run_v2', {
        p_run: {
          run_uuid: anonymousRunUuid,
          won: false,
          run_level: 1,
          waves_completed: 0,
          biomes_visited: [],
          gold_earned: 0,
          started_at: new Date().toISOString(),
        },
        p_team_members: [
          {
            champion_id: 'Garen',
            final_level: 1,
            final_hp: 100,
            kills: 0,
            damage_dealt: 0,
            items_collected: [],
          },
        ],
        p_rune_ids: [],
        p_augment_ids: [],
      }),
      anonymousClient.rpc('unlock_champion_enhancement', {
        p_champion_id: 'Garen',
        p_node_id: 'fighter_core_1',
        p_expected_rank: 0,
        p_command_id: randomUUID(),
      }),
      anonymousClient.rpc('save_completed_run', {
        p_run: { run_uuid: `legacy-${anonymousRunUuid}` },
        p_team_members: [],
        p_mastery: [{ champion_id: 'Garen', candies_earned: 999999 }],
        p_total_candies: 999999,
      }),
    ]);
    expect(commandAttempts.every(({ error }) => error !== null)).toBe(true);

    const directWrites = await Promise.all([
      anonymousClient.from('players').insert({
        user_id: randomUUID(),
        username: `anonymous-${Date.now()}`,
        display_name: 'Anonymous',
      }),
      anonymousClient.from('champion_mastery').insert({
        player_id: randomUUID(),
        champion_id: 'Garen',
        total_candies: 999999,
      }),
      anonymousClient.from('runs').insert({
        player_id: randomUUID(),
        run_uuid: `forged-${anonymousRunUuid}`,
        won: true,
        run_level: 99,
        waves_completed: 999,
      }),
      anonymousClient.from('champion_enhancements').insert({
        user_id: randomUUID(),
        champion_id: 'Garen',
        unlocked_nodes: { fighter_core_1: 999 },
        total_candies_spent: 1,
      }),
    ]);
    expect(directWrites.every(({ error }) => error !== null)).toBe(true);
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

  it('keeps authenticated progression server-owned, canonical and idempotent', async () => {
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

    const legacySave = await userClient.rpc('save_completed_run', {
      p_run: { run_uuid: `legacy-${suffix}` },
      p_team_members: [],
      p_mastery: [{ champion_id: 'Garen', candies_earned: 999999 }],
      p_total_candies: 999999,
    });
    expect(legacySave.error).not.toBeNull();

    const directProgressionWrites = await Promise.all([
      userClient
        .from('players')
        .update({
          level: 99,
          total_candies: 999999,
          total_runs_completed: 999999,
          total_wins: 999999,
          total_waves_completed: 999999,
          last_login_at: new Date(0).toISOString(),
        })
        .eq('user_id', signup.user!.id),
      userClient.from('champion_mastery').insert({
        player_id: profile!.id,
        champion_id: 'Garen',
        total_candies: 999999,
        mastery_level: 4,
      }),
      userClient.from('player_unlocks').insert({
        player_id: profile!.id,
        unlock_type: 'starter',
        unlock_id: 'everything',
      }),
      userClient.from('runs').insert({
        player_id: profile!.id,
        run_uuid: `forged-${suffix}`,
        won: true,
        run_level: 99,
        waves_completed: 999,
      }),
      userClient.from('run_team_members').insert({
        run_id: randomUUID(),
        champion_id: 'Garen',
        final_level: 18,
      }),
      userClient.from('champion_enhancements').upsert({
        user_id: signup.user!.id,
        champion_id: 'Garen',
        unlocked_nodes: { fighter_core_1: 999 },
        total_candies_spent: 1,
      }),
    ]);
    expect(directProgressionWrites.every(({ error }) => error !== null)).toBe(true);

    const hostileStartedAt = new Date().toISOString();
    const validMember = {
      champion_id: 'Garen',
      final_level: 2,
      final_hp: 100,
      kills: 1,
      damage_dealt: 43,
      items_collected: [],
    };
    const hostilePayloads = await Promise.all([
      userClient.rpc('save_completed_run_v2', {
        p_run: {
          run_uuid: `unknown-${suffix}`,
          won: false,
          run_level: 1,
          waves_completed: 1,
          biomes_visited: ['top_lane'],
          gold_earned: 10,
          started_at: hostileStartedAt,
        },
        p_team_members: [{ ...validMember, champion_id: 'DefinitelyNotAChampion' }],
        p_rune_ids: [],
        p_augment_ids: [],
      }),
      userClient.rpc('save_completed_run_v2', {
        p_run: {
          run_uuid: `duplicate-${suffix}`,
          won: false,
          run_level: 1,
          waves_completed: 1,
          biomes_visited: ['top_lane'],
          gold_earned: 10,
          started_at: hostileStartedAt,
        },
        p_team_members: [validMember, validMember],
        p_rune_ids: [],
        p_augment_ids: [],
      }),
      userClient.rpc('save_completed_run_v2', {
        p_run: {
          run_uuid: `victory-${suffix}`,
          won: true,
          run_level: 2,
          waves_completed: 1,
          biomes_visited: ['top_lane'],
          gold_earned: 10,
          started_at: hostileStartedAt,
        },
        p_team_members: [validMember],
        p_rune_ids: [],
        p_augment_ids: [],
      }),
      userClient.rpc('save_completed_run_v2', {
        p_run: {
          run_uuid: `null-biome-${suffix}`,
          won: false,
          run_level: 1,
          waves_completed: 0,
          biomes_visited: [null],
          gold_earned: 0,
          started_at: hostileStartedAt,
        },
        p_team_members: [validMember],
        p_rune_ids: [],
        p_augment_ids: [],
      }),
      userClient.rpc('save_completed_run_v2', {
        p_run: {
          run_uuid: `invalid-items-${suffix}`,
          won: false,
          run_level: 1,
          waves_completed: 1,
          biomes_visited: ['top_lane'],
          gold_earned: 0,
          started_at: hostileStartedAt,
        },
        p_team_members: [{ ...validMember, items_collected: [1, true, null] }],
        p_rune_ids: [],
        p_augment_ids: [],
      }),
      userClient.rpc('save_completed_run_v2', {
        p_run: {
          run_uuid: `invalid-level-${suffix}`,
          won: false,
          run_level: 2,
          waves_completed: 1,
          biomes_visited: ['top_lane'],
          gold_earned: 0,
          started_at: hostileStartedAt,
        },
        p_team_members: [validMember],
        p_rune_ids: [],
        p_augment_ids: [],
      }),
      userClient.rpc('save_completed_run_v2', {
        p_run: {
          run_uuid: `dead-victory-${suffix}`,
          won: true,
          run_level: 2,
          waves_completed: 7,
          biomes_visited: ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'],
          gold_earned: 0,
          started_at: hostileStartedAt,
        },
        p_team_members: [{ ...validMember, final_hp: 0 }],
        p_rune_ids: [],
        p_augment_ids: [],
      }),
    ]);
    expect(
      hostilePayloads.every(({ error }) =>
        error?.message.includes('permission denied for function save_completed_run_v2'),
      ),
    ).toBe(true);

    const [
      { data: progressionAfterRejectedRuns, error: rejectedProgressionError },
      { count: rejectedRunCount, error: rejectedRunCountError },
      { count: rejectedMasteryCount, error: rejectedMasteryCountError },
    ] = await Promise.all([
      userClient
        .from('players')
        .select('total_runs_completed, total_waves_completed, total_candies')
        .eq('user_id', signup.user!.id)
        .single(),
      userClient
        .from('runs')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', profile!.id),
      userClient
        .from('champion_mastery')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', profile!.id),
    ]);
    expect(rejectedProgressionError).toBeNull();
    expect(rejectedRunCountError).toBeNull();
    expect(rejectedMasteryCountError).toBeNull();
    expect(progressionAfterRejectedRuns).toMatchObject({
      total_runs_completed: 0,
      total_waves_completed: 0,
      total_candies: 0,
    });
    expect(rejectedRunCount).toBe(0);
    expect(rejectedMasteryCount).toBe(0);

    const { data: touchedAt, error: touchError } = await userClient.rpc('touch_player_last_login');
    expect(touchError).toBeNull();
    expect(new Date(touchedAt!).getTime()).toBeGreaterThan(0);

    const { data: editableProfile, error: editableProfileError } = await userClient
      .from('players')
      .update({ display_name: 'Editable profile field' })
      .eq('user_id', signup.user!.id)
      .select('display_name, last_login_at')
      .single();
    expect(editableProfileError).toBeNull();
    expect(editableProfile).toMatchObject({ display_name: 'Editable profile field' });
    expect(editableProfile?.last_login_at).toBeTruthy();

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

    const { error: fundError } = await supabase
      .from('players')
      .update({ total_candies: 100 })
      .eq('user_id', signup.user!.id);
    expect(fundError).toBeNull();

    const concurrentCommandIds = [randomUUID(), randomUUID()];
    const concurrentUnlocks = await Promise.all(
      concurrentCommandIds.map((commandId) =>
        restoredClient.rpc('unlock_champion_enhancement', {
          p_champion_id: 'Garen',
          p_node_id: 'fighter_core_1',
          p_expected_rank: 0,
          p_command_id: commandId,
        }),
      ),
    );
    const successfulUnlocks = concurrentUnlocks.filter(({ error }) => error === null);
    const rejectedUnlocks = concurrentUnlocks.filter(({ error }) => error !== null);
    expect(successfulUnlocks).toHaveLength(1);
    expect(rejectedUnlocks).toHaveLength(1);
    expect(rejectedUnlocks[0].error?.message).toContain('enhancement_rank_conflict');

    const firstUnlock = successfulUnlocks[0];
    const enhancementCommandId = firstUnlock.data!.command_id as string;
    const enhancementArgs = {
      p_champion_id: 'Garen',
      p_node_id: 'fighter_core_1',
      p_expected_rank: 0,
      p_command_id: enhancementCommandId,
    };
    expect(firstUnlock.error).toBeNull();
    expect(firstUnlock.data).toMatchObject({
      command_id: enhancementCommandId,
      champion_id: 'Garen',
      node_id: 'fighter_core_1',
      current_rank: 1,
      candy_cost: 20,
      max_rank: 1,
      remaining_candies: 80,
      catalog_version: 2,
      replayed: false,
    });

    const replayedUnlock = await restoredClient.rpc('unlock_champion_enhancement', enhancementArgs);
    expect(replayedUnlock.error).toBeNull();
    expect(replayedUnlock.data).toMatchObject({
      command_id: enhancementCommandId,
      current_rank: 1,
      remaining_candies: 80,
      replayed: true,
    });

    const reusedEnhancementCommand = await restoredClient.rpc('unlock_champion_enhancement', {
      ...enhancementArgs,
      p_node_id: 'fighter_bruiser_1',
    });
    expect(reusedEnhancementCommand.error?.message).toContain('idempotency_key_reused');

    const staleRank = await restoredClient.rpc('unlock_champion_enhancement', {
      ...enhancementArgs,
      p_command_id: randomUUID(),
    });
    expect(staleRank.error?.message).toContain('enhancement_rank_conflict');

    const wrongRole = await restoredClient.rpc('unlock_champion_enhancement', {
      p_champion_id: 'Garen',
      p_node_id: 'mage_core_1',
      p_expected_rank: 0,
      p_command_id: randomUUID(),
    });
    expect(wrongRole.error?.message).toContain('enhancement_not_in_champion_catalog');

    const { data: candyBalance, error: candyBalanceError } = await supabase
      .from('players')
      .select('total_candies')
      .eq('user_id', signup.user!.id)
      .single();
    expect(candyBalanceError).toBeNull();
    expect(candyBalance?.total_candies).toBe(80);

    const { data: enhancement, error: enhancementError } = await restoredClient
      .from('champion_enhancements')
      .select('unlocked_nodes, total_candies_spent')
      .eq('champion_id', 'Garen')
      .single();
    expect(enhancementError).toBeNull();
    expect(enhancement?.total_candies_spent).toBe(20);
    expect(Object.values(enhancement?.unlocked_nodes ?? {})).toEqual([1]);

    const retiredDailySubmission = await restoredClient.rpc(
      'submit_daily_run' as never,
      {
        p_daily_date: new Date().toISOString().slice(0, 10),
        p_daily_seed: 20260723,
        p_won: true,
        p_run_level: 100,
        p_waves_completed: 1000,
        p_gold: 1000000,
        p_item_count: 100,
      } as never,
    );
    expect(retiredDailySubmission.error).not.toBeNull();

    const { error: directDailyWriteError } = await restoredClient.from('daily_runs').insert({
      player_id: randomUUID(),
      daily_date: new Date().toISOString().slice(0, 10),
      daily_seed: 1,
      score: 999999,
    });
    expect(directDailyWriteError).not.toBeNull();

    const challenge = await restoredClient.rpc('get_daily_challenge');
    expect(challenge.error).toBeNull();
    expect(challenge.data).toMatchObject({
      difficulty: 'normal',
      attempt_policy: 'one_official_attempt_per_utc_day',
    });

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
  }, 15_000);
});
