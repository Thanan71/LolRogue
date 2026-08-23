import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260820163214_gameplay_ruleset_v15_authority_cohorts.sql',
    import.meta.url,
  ),
  'utf8',
);
const migrationCorpus = readdirSync(migrationsUrl)
  .filter((file) => file.endsWith('.sql'))
  .map((file) => readFileSync(new URL(file, migrationsUrl), 'utf8'))
  .join('\n');

describe('authority cohort ruleset v15 migration', () => {
  it('copies the immutable v14 content catalog into gameplay v15', () => {
    expect(migrationSql).toContain("15,\n  '2026-08-authority-cohorts-v15'");
    expect(migrationSql).toContain("'run-engine-v15'");
    expect(migrationSql).toContain('SELECT 15, content_type, content_id, active, max_stacks');
    expect(migrationSql).toContain('WHERE gameplay_ruleset_version = 14');
    expect(migrationSql).toContain('gameplay_ruleset_v15_contract_mismatch');
  });

  it('advances the Daily seed contract while retaining score formula v14', () => {
    expect(migrationSql).toContain("foreign_key.contype = 'f'");
    expect(migrationSql).toContain("referenced_column.attname = 'score_version'");
    expect(migrationSql).toContain("RAISE EXCEPTION 'daily_score_version_fk_dependency'");
    expect(migrationSql).toContain(
      'DROP CONSTRAINT IF EXISTS daily_challenge_rulesets_score_version_key',
    );
    expect(migrationSql).not.toMatch(
      /DROP CONSTRAINT IF EXISTS daily_challenge_rulesets_score_version_key\s+CASCADE/,
    );
    expect(migrationSql).toContain("score_check.contype = 'c'");
    expect(migrationSql).toContain("POSITION('score_version > 0'");
    expect(migrationSql).toContain("RAISE EXCEPTION 'daily_score_version_check_missing'");
    expect(migrationCorpus).not.toMatch(
      /REFERENCES\s+(?:public\.)?daily_challenge_rulesets\s*\(\s*score_version\s*\)/i,
    );
    expect(migrationSql).toContain("'2026-08-authoritative-daily-v15'");
    expect(migrationSql).toContain("'lolrogue.daily.v15'");
    expect(migrationSql).toMatch(/'lolrogue\.daily\.v15',\s*14,\s*wave_points,/);
    expect(migrationSql).toContain('FROM public.daily_challenge_rulesets');
    expect(migrationSql).toContain('WHERE version = 14');
    expect(migrationSql).toContain('daily_ruleset_v15_contract_mismatch');
  });

  it('wraps the v14 completion contract and preserves its service-role boundary', () => {
    expect(migrationSql).toContain('RENAME TO complete_run_verification_v14_contract');
    expect(migrationSql).toContain("IF v_engine_version <> 'run-engine-v15' THEN");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v14'");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v15'");
    expect(migrationSql).toContain("SET search_path = ''");
    expect(migrationSql).toContain(
      'REVOKE ALL ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)',
    );
    expect(migrationSql).toContain(
      'GRANT EXECUTE ON FUNCTION public.complete_run_verification(UUID, UUID, JSONB, TEXT)',
    );
  });
});
