import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260828150025_gameplay_ruleset_v18_early_top.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('early Top gameplay ruleset v18', () => {
  it('publishes the measured engine identity without mutating historical rulesets', () => {
    expect(migrationSql).toContain("18,\n  '2026-08-early-top-v18',\n  'run-engine-v18'");
    expect(migrationSql).toContain(
      "'9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17'",
    );
    expect(migrationSql).toContain('SELECT 18, content_type, content_id, active, max_stacks');
    expect(migrationSql).toContain('WHERE gameplay_ruleset_version = 17');
    expect(migrationSql.match(/\bEXCEPT\b/g)).toHaveLength(4);
    expect(migrationSql).toContain('gameplay_ruleset_v18_catalog_copy_mismatch');
    expect(migrationSql).not.toMatch(/\b(?:DELETE\s+FROM|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i);
  });

  it('copies the gold-neutral Daily v17 contract into the v18 namespace', () => {
    expect(migrationSql).toContain("'2026-08-early-top-daily-v18'");
    expect(migrationSql).toContain("'lolrogue.daily.v18'");
    expect(migrationSql).toMatch(
      /SELECT\s+18,\s*'2026-08-early-top-daily-v18',\s*18,\s*difficulty,\s*'lolrogue\.daily\.v18',\s*15,/,
    );
    expect(migrationSql).toContain('WHERE version = 17');
    expect(migrationSql).toContain('AND score_version = 15');
    expect(migrationSql).toContain('AND gold_points = 0');
    expect(migrationSql).toContain('daily_ruleset_v18_copy_mismatch');
  });

  it('keeps verification private while delegating v18 to the secured v17 contract', () => {
    expect(migrationSql).toContain('RENAME TO complete_run_verification_v17_contract');
    expect(migrationSql).toContain("IF v_engine_version <> 'run-engine-v18' THEN");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v17'");
    expect(migrationSql).toContain("SET engine_version = 'run-engine-v18'");
    expect(migrationSql).toContain("SET search_path = ''");
    expect(migrationSql).toContain(
      'FROM PUBLIC, anon, authenticated, service_role;\nGRANT EXECUTE ON FUNCTION',
    );
    expect(migrationSql).toContain('TO service_role;');
    expect(migrationSql).not.toMatch(/GRANT EXECUTE[\s\S]*?TO (?:PUBLIC|anon|authenticated)/i);
  });

  it('archives the exact v17 bundle bytes before publishing v18', () => {
    const archive = readFileSync(
      new URL('../supabase/functions/verify-run/run-authority-v17.bundle.ts', import.meta.url),
    );

    expect(archive.byteLength).toBe(824_777);
    expect(createHash('sha256').update(archive).digest('hex')).toBe(
      'bfcc01a5d7c02c21fc22700819a6f2f9380661b3d5f035ff9a926dc47fa5e78c',
    );
  });
});
