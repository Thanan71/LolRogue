import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260808150000_social_leaderboard_contract.sql', import.meta.url),
  'utf8',
);
const hardenedViewsSql = readFileSync(
  new URL('../supabase/migrations/20260809090000_harden_leaderboard_views.sql', import.meta.url),
  'utf8',
);

describe('social leaderboard contract', () => {
  it('never falls back to an account username and supports opt-out', () => {
    expect(sql).toContain('leaderboard_opt_out BOOLEAN NOT NULL DEFAULT FALSE');
    expect(sql).toContain('player.public_display_name');
    expect(sql).toContain("'Joueur ' || UPPER(SUBSTRING(MD5(player.id::TEXT), 1, 6))");
    expect(sql).not.toMatch(/COALESCE\([^;]+player\.username/s);
    expect(sql).toContain('AND NOT player.leaderboard_opt_out');
    expect(sql).toContain('DROP VIEW public.leaderboard;');
    expect(sql).toContain('WHERE NOT player.leaderboard_opt_out');
  });

  it('partitions comparable scores by date and ruleset versions', () => {
    expect(sql).toContain('PARTITION BY daily.daily_date, daily.score_version');
    expect(sql).toContain('daily.gameplay_ruleset_version');
    expect(sql).toContain('season.code AS season_code');
  });

  it('provides a private report queue and admin-only invalidation', () => {
    expect(sql).toContain('CREATE TABLE public.daily_score_reports');
    expect(sql).toContain('IF NOT public.is_current_user_admin()');
    expect(sql).toContain('daily.invalidated_at IS NULL');
    expect(sql).toContain("status = 'actioned'");
  });

  it('does not introduce a social graph, sharing or spectator storage', () => {
    expect(sql).not.toMatch(/CREATE TABLE public\.(friends|friendships|shares|spectators)/i);
  });

  it('runs both public leaderboard views with invoker rights over sanitized projections', () => {
    expect(hardenedViewsSql).toMatch(
      /CREATE VIEW public\.leaderboard\s+WITH \(security_invoker = true, security_barrier = true\)/,
    );
    expect(hardenedViewsSql).toMatch(
      /CREATE VIEW public\.daily_leaderboard\s+WITH \(security_invoker = true, security_barrier = true\)/,
    );
    expect(hardenedViewsSql).toContain('FROM private.leaderboard_public_entries AS entry');
    expect(hardenedViewsSql).toContain('FROM private.daily_leaderboard_public_entries AS entry');
    expect(hardenedViewsSql).not.toMatch(/GRANT SELECT ON (?:TABLE )?public\.(players|daily_runs)/);
  });

  it('keeps internal keys out of the exact public view contracts', () => {
    const leaderboardView = hardenedViewsSql.slice(
      hardenedViewsSql.indexOf('CREATE VIEW public.leaderboard'),
      hardenedViewsSql.indexOf('CREATE OR REPLACE FUNCTION public.get_my_leaderboard_rank'),
    );
    const dailyView = hardenedViewsSql.slice(
      hardenedViewsSql.indexOf('CREATE VIEW public.daily_leaderboard'),
      hardenedViewsSql.indexOf('REVOKE ALL ON TABLE public.leaderboard'),
    );

    expect(leaderboardView).not.toMatch(
      /\b(player_key|player_id|user_id|username|total_candies|last_login_at|created_at)\b/,
    );
    expect(dailyView).not.toMatch(
      /\b(player_key|player_id|user_id|username|daily_seed|completed_at|invalidated_at|invalidation_reason)\b/,
    );
  });

  it('asserts catalog reloptions and gives no client execute grant to sync functions', () => {
    expect(hardenedViewsSql).toContain("'security_invoker=true' = ANY");
    expect(hardenedViewsSql).toContain("RAISE EXCEPTION 'security_definer_view: %'");
    expect(hardenedViewsSql).toMatch(
      /REVOKE ALL ON FUNCTION[\s\S]+private\.sync_all_public_daily_leaderboard_entries\(\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(hardenedViewsSql).not.toMatch(/GRANT EXECUTE ON FUNCTION private\.(?:refresh|sync)_/);
  });
});
