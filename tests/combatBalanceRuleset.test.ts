import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260830093859_gameplay_ruleset_v19_combat_balance.sql',
    import.meta.url,
  ),
  'utf8',
);
const archivedV18Bundle = readFileSync(
  new URL('../supabase/functions/verify-run/run-authority-v18.bundle.ts', import.meta.url),
);

describe('combat balance ruleset v19 migration', () => {
  it('publishes append-only gameplay v19 from immutable v18 content', () => {
    expect(migrationSql).toContain("19,\n  '2026-08-combat-balance-v19'");
    expect(migrationSql).toContain("'run-engine-v19'");
    expect(migrationSql).toContain('SELECT 19, content_type, content_id, active, max_stacks');
    expect(migrationSql).toContain('WHERE gameplay_ruleset_version = 18');
    expect(migrationSql).toContain('gameplay_ruleset_v19_catalog_copy_mismatch');
    expect(createHash('sha256').update(archivedV18Bundle).digest('hex')).toBe(
      '48ac21b1aeea3690dc6792cf273e33991a7180d4f8f01f234f3054f560205293',
    );
  });

  it('publishes Daily v19 without changing score v15 or adding gold points', () => {
    expect(migrationSql).toContain("'2026-08-combat-balance-daily-v19'");
    expect(migrationSql).toContain("'lolrogue.daily.v19'");
    expect(migrationSql).toMatch(/'lolrogue\.daily\.v19',\s*15,\s*wave_points,/);
    expect(migrationSql).toContain('AND gold_points = 0');
    expect(migrationSql).toContain('daily_ruleset_v19_contract_mismatch');
  });

  it('wraps the v18 completion contract behind a least-privilege service boundary', () => {
    expect(migrationSql).toContain('RENAME TO complete_run_verification_v18_contract');
    expect(migrationSql).toContain("IF v_engine_version <> 'run-engine-v19' THEN");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v18'");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v19'");
    expect(migrationSql).toContain("SET search_path = ''");
    expect(migrationSql).toContain(
      'REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)',
    );
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)',
    );
  });
});
