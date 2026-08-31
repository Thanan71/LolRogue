import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260831152608_gameplay_ruleset_v20_map_economy.sql',
    import.meta.url,
  ),
  'utf8',
);
const archivedV19Bundle = readFileSync(
  new URL('../supabase/functions/verify-run/run-authority-v19.bundle.ts', import.meta.url),
);

describe('gameplay ruleset v20 publication', () => {
  it('keeps the archived v19 authority bundle byte-for-byte immutable', () => {
    expect(archivedV19Bundle.byteLength).toBe(836_449);
    expect(createHash('sha256').update(archivedV19Bundle).digest('hex')).toBe(
      '55df03729dc47417db3efb28ba534cbbf830f9cd3c771e4fdcda8d33eb9996eb',
    );
  });

  it('publishes gameplay v20 and copies the v19 content catalog exactly', () => {
    expect(migrationSql).toContain("20,\n  '2026-08-map-economy-v20',\n  'run-engine-v20',\n  2,");
    expect(migrationSql).toContain(
      "'8308ebe66c3ee45850b68560b0449b6660b24c2a0e81a5070f6d1794620cac91'",
    );
    expect(migrationSql).toContain('SELECT 20, content_type, content_id, active, max_stacks');
    expect(migrationSql).toContain('WHERE gameplay_ruleset_version = 19');
    expect(migrationSql).toContain("RAISE EXCEPTION 'gameplay_ruleset_v20_catalog_copy_mismatch'");
  });

  it('keeps Daily scoring at v15 while publishing the v20 namespace', () => {
    expect(migrationSql).toContain("'2026-08-map-economy-daily-v20'");
    expect(migrationSql).toContain("'lolrogue.daily.v20'");
    expect(migrationSql).toMatch(/'lolrogue\.daily\.v20',\s*15,/);
    expect(migrationSql).toContain('AND gold_points = 0');
    expect(migrationSql).toContain("RAISE EXCEPTION 'daily_ruleset_v20_copy_mismatch'");
  });

  it('publishes progression v3 without exposing archived completion contracts', () => {
    expect(migrationSql).toContain("'2026-08-participation-rewards-v3'");
    expect(migrationSql).toContain('complete_run_verification_v19_contract');
    expect(migrationSql).toContain("IF v_attempt.engine_version <> 'run-engine-v20' THEN");
    expect(migrationSql).toContain("p_result -> 'ledger' ->> 'version' <> '2'");
    expect(migrationSql).toContain("'candies_by_champion', v_allocation");
    expect(migrationSql).toContain('FROM PUBLIC, anon, authenticated, service_role');
    expect(migrationSql).toContain('TO service_role;');
  });
});
