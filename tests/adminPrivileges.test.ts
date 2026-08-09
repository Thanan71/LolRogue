import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/20260809150000_audit_admin_privileges.sql', import.meta.url),
  'utf8',
);
const administration = readFileSync(new URL('../docs/administration.md', import.meta.url), 'utf8');

describe('admin privilege hardening contract', () => {
  it('keeps client-controlled metadata and direct admin-column writes out of authorization', () => {
    expect(migration).not.toMatch(/raw_user_meta_data|user_metadata|app_metadata/);
    expect(administration).toContain('jamais depuis les métadonnées Auth');
    expect(administration).toContain('REVOKE UPDATE (is_admin)');
  });

  it('validates one completed target and records an API-immutable audit row', () => {
    expect(migration).toContain('IF v_actor_user_id IS NULL OR NOT public.is_current_user_admin()');
    expect(migration).toContain('AND completed_at IS NOT NULL');
    expect(migration).toContain('AND invalidated_at IS NULL');
    expect(migration).toContain("RAISE EXCEPTION 'daily_score_not_invalidateable'");
    expect(migration).toContain('REGEXP_REPLACE');
    expect(migration).toContain("reason !~ '[[:cntrl:]]'");
    expect(migration).toContain('INSERT INTO public.daily_score_invalidation_audit');
    expect(migration).toContain('DROP CONSTRAINT daily_runs_invalidation_complete');
    expect(migration).toContain('REVOKE ALL ON TABLE public.daily_score_invalidation_audit');
    expect(migration).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[\s\S]*daily_score_invalidation_audit/i,
    );
  });
});
