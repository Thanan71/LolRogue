import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import registry from '../config/authority-versions.json';

const previousSql = readFileSync(
  new URL(
    '../supabase/migrations/20261010120531_gameplay_ruleset_0_2_0_veigar_assists.sql',
    import.meta.url,
  ),
  'utf8',
);
// This audit proves the published structural 0.2.5 refactor, independently of later gameplay releases.
const current = registry.versions.find(({engine}) => engine === 'run-engine-0.2.5')!;
const migrationSql = readFileSync(new URL(`../${current.migration}`, import.meta.url), 'utf8');

function finalizationContract(source: string): string {
  const start = source.indexOf('FUNCTION public.complete_run_verification_pre_champion_economy(\n');
  const end = source.indexOf('-- Publish the gameplay', start);
  if (start === -1 || end === -1) throw new Error('Missing authoritative finalization contract.');
  return source.slice(start, end);
}

describe('frozen structural engine 0.2.5 database contract', () => {
  it('changes only admitted and restored registry identities in the previous rewards, lease and idempotency implementation', () => {
    const allowedChanges = [
      [
        "IF v_attempt.engine_version <> 'run-engine-0.2.0' THEN",
        "IF v_attempt.engine_version NOT IN ('run-engine-0.2.0', 'run-engine-0.2.5') THEN",
      ],
      [
        'IF v_attempt.gameplay_ruleset_version <> 23',
        'IF v_attempt.gameplay_ruleset_version NOT IN (23, 24)',
      ],
      [
        "WHERE version = 23\n        AND engine_version = 'run-engine-0.2.0'",
        'WHERE version = v_attempt.gameplay_ruleset_version\n        AND engine_version = v_attempt.engine_version',
      ],
      [
        "UPDATE public.run_attempts SET engine_version = 'run-engine-0.2.0'",
        'UPDATE public.run_attempts SET engine_version = v_attempt.engine_version',
      ],
      [
        "'gameplay_ruleset_version', 23,",
        "'gameplay_ruleset_version', v_attempt.gameplay_ruleset_version,",
      ],
      ["'engine_version', 'run-engine-0.2.0',", "'engine_version', v_attempt.engine_version,"],
      [
        "    engine_version = 'run-engine-0.2.0',",
        '    engine_version = v_attempt.engine_version,',
      ],
    ] as const;
    let expected = finalizationContract(previousSql);
    for (const [before, after] of allowedChanges) {
      expect(expected.split(before)).toHaveLength(2);
      expected = expected.replace(before, after);
    }
    expect(finalizationContract(migrationSql)).toBe(expected);
  });

  it('publishes the exact new content and Daily/catalogue copies before activating them, without changing grants or schemas', () => {
    expect(migrationSql).toContain(current.contentHash);
    expect(migrationSql).toContain('gameplay_ruleset_0_2_5_catalog_copy_mismatch');
    expect(migrationSql).toContain('daily_ruleset_0_2_5_copy_mismatch');
    expect(migrationSql).toContain('FROM PUBLIC, anon, authenticated, service_role');
    expect(migrationSql).not.toMatch(/\b(?:ALTER|CREATE|DROP)\s+TABLE\b/i);
    expect(migrationSql).not.toMatch(/\bGRANT\b/i);
    expect(migrationSql.trimEnd()).toMatch(/COMMIT;$/);
  });
});
