import { readFileSync } from 'node:fs';

const sql = readFileSync(
  new URL('../supabase/migrations/20260808150000_social_leaderboard_contract.sql', import.meta.url),
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
});
