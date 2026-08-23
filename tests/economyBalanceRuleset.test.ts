import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260823081828_gameplay_ruleset_v17_economy_balance.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('economy balance ruleset v17 migration', () => {
  it('publishes append-only gameplay v17 from immutable v16 with bounded economy', () => {
    expect(migrationSql).toContain("17,\n  '2026-08-economy-balance-v17'");
    expect(migrationSql).toContain("'run-engine-v17'");
    expect(migrationSql).toContain('SELECT 17, content_type, content_id, active, max_stacks');
    expect(migrationSql).toContain('WHERE gameplay_ruleset_version = 16');
    expect(migrationSql).toContain("content_id IN ('golden_touch', 'fortune', 'golden_age')");
    expect(migrationSql).toContain('gameplay_ruleset_v17_economy_catalog_mismatch');
  });

  it('publishes score v15 with no earned-gold points', () => {
    expect(migrationSql).toContain("'2026-08-economy-balance-daily-v17'");
    expect(migrationSql).toContain("'lolrogue.daily.v17'");
    expect(migrationSql).toMatch(/'lolrogue\.daily\.v17',\s*15,\s*wave_points,/);
    expect(migrationSql).toMatch(/run_level_points,\s*0,\s*victory_bonus,/);
    expect(migrationSql).toContain('AND gold_points = 0');
    expect(migrationSql).toContain('daily_ruleset_v17_contract_mismatch');
  });

  it('wraps the v16 completion contract behind the service-role boundary', () => {
    expect(migrationSql).toContain('RENAME TO complete_run_verification_v16_contract');
    expect(migrationSql).toContain("IF v_engine_version <> 'run-engine-v17' THEN");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v16'");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v17'");
    expect(migrationSql).toContain("SET search_path = ''");
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)',
    );
  });
});
