import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260823073234_gameplay_ruleset_v16_daily_parity.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('progression-neutral Daily ruleset v16 migration', () => {
  it('publishes an immutable v16 gameplay and Daily contract over score formula v14', () => {
    expect(migrationSql).toContain("16,\n  '2026-08-daily-parity-v16'");
    expect(migrationSql).toContain("'run-engine-v16'");
    expect(migrationSql).toContain('SELECT 16, content_type, content_id, active, max_stacks');
    expect(migrationSql).toContain('WHERE gameplay_ruleset_version = 15');
    expect(migrationSql).toContain("'2026-08-progression-neutral-daily-v16'");
    expect(migrationSql).toContain("'lolrogue.daily.v16'");
    expect(migrationSql).toMatch(/'lolrogue\.daily\.v16',\s*14,\s*wave_points,/);
    expect(migrationSql).toContain('WHERE version = 15');
  });

  it('versions the Grasp cap with the gameplay catalog', () => {
    expect(migrationSql).toContain("content_id = 'grasp_of_the_undying'");
    expect(migrationSql).toContain('AND max_stacks = 5');
    expect(migrationSql).toContain('gameplay_ruleset_v16_grasp_contract_mismatch');
  });

  it('forces both account progression snapshots to empty for Daily attempts', () => {
    expect(migrationSql).toMatch(
      /IF NEW\.mode = 'daily' THEN\s*NEW\.enhancement_snapshot := '\{\}'::JSONB;\s*NEW\.mastery_snapshot := '\{\}'::JSONB;/,
    );
    expect(migrationSql).toContain("'enhancement_snapshot', NEW.enhancement_snapshot");
    expect(migrationSql).toContain("'mastery_snapshot', NEW.mastery_snapshot");
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.freeze_run_attempt_mastery()');
    expect(migrationSql).toContain(
      'BEFORE INSERT OR UPDATE OF mode, enhancement_snapshot, mastery_snapshot',
    );
  });

  it('wraps v15 completion without widening its service-only boundary', () => {
    expect(migrationSql).toContain('RENAME TO complete_run_verification_v15_contract');
    expect(migrationSql).toContain("IF v_engine_version <> 'run-engine-v16' THEN");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v15'");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v16'");
    expect(migrationSql).toContain("SET search_path = ''");
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)',
    );
  });
});
