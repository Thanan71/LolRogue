import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/20260904151818_gameplay_ruleset_v21_balance_acceptance.sql',
    import.meta.url,
  ),
  'utf8',
);
const archivedV20 = readFileSync(
  new URL('../supabase/functions/verify-run/run-authority-v20.bundle.ts', import.meta.url),
);
const verifyRunSource = readFileSync(
  new URL('../supabase/functions/verify-run/index.ts', import.meta.url),
  'utf8',
);
const backendDeploySource = readFileSync(
  new URL('../scripts/deploy-backend.mjs', import.meta.url),
  'utf8',
);

describe('P0 balance authority ruleset', () => {
  it('preserves the exact v20 authority bundle', () => {
    expect(archivedV20.byteLength).toBe(840_942);
    expect(createHash('sha256').update(archivedV20).digest('hex')).toBe(
      '6c276bb64e81bd3117600b05d983b0018085d341c21c51960c964b7c551a34a7',
    );
  });

  it('publishes gameplay and Daily v21 by copying the complete v20 contracts', () => {
    expect(migration).toMatch(
      /21,\s*'2026-09-balance-acceptance-v21',\s*'run-engine-v21',\s*2,\s*'c0b776b628006a779a618fb2abfa00a3ff99fd27d27980dfdec54378fc4d81a3'/,
    );
    expect(migration).toContain('SELECT 21, content_type, content_id, active, max_stacks');
    expect(migration).toContain('WHERE gameplay_ruleset_version = 20');
    expect(migration).toContain('gameplay_ruleset_v21_catalog_copy_mismatch');
    expect(migration).toMatch(
      /'2026-09-balance-acceptance-daily-v21',\s*21,\s*difficulty,\s*'lolrogue\.daily\.v21',\s*15/,
    );
    expect(migration).toContain('daily_ruleset_v21_copy_mismatch');
    expect(migration).toContain('AND gold_points = 0');
  });

  it('keeps historical finalization private and exposes only the v21 contract', () => {
    expect(migration).toContain('RENAME TO complete_run_verification_v20_contract');
    expect(migration).toMatch(
      /IF v_attempt\.engine_version <> 'run-engine-v21' THEN\s*RETURN public\.complete_run_verification_v20_contract/,
    );
    expect(migration).toContain('public.complete_run_verification_v19_contract(');
    expect(migration).toContain('v_attempt.gameplay_ruleset_version <> 21');
    expect(migration).toContain("p_result -> 'ledger' ->> 'version' <> '2'");
    expect(migration).toContain("'gameplay_ruleset_version', 21");
    expect(migration).toContain("'engine_version', 'run-engine-v21'");
    expect(migration).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.complete_run_verification_v20_contract\(UUID, UUID, JSONB, TEXT\)\s+FROM PUBLIC, anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.complete_run_verification\(UUID, UUID, JSONB, TEXT\)\s+TO service_role/,
    );
  });

  it('serializes the participation ledger for both progression-v3 engines', () => {
    expect(verifyRunSource).toContain("engineVersion === 'run-engine-v20'");
    expect(verifyRunSource).toContain("engineVersion === 'run-engine-v21'");
  });

  it('stages the compatible Edge resolver without activating the database ruleset', () => {
    const edgeDeployment = backendDeploySource.indexOf("'functions', 'deploy', 'verify-run'");
    const databasePush = backendDeploySource.indexOf("'db', 'push'");
    expect(edgeDeployment).toBeGreaterThan(-1);
    expect(databasePush).toBe(-1);
    expect(backendDeploySource).toContain(
      'Deploy the compatible frontend before running npm run migrate.',
    );
  });
});
