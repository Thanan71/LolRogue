import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL(
    '../supabase/migrations/20260825192223_aggregate_verified_field_calibration.sql',
    import.meta.url,
  ),
  'utf8',
);

const EXACT_DIMENSION_GROUP = `GROUP BY
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level`;

describe('field calibration cell isolation', () => {
  it('keeps authority, composition, team size and meta dimensions in every aggregate cell', () => {
    expect(migrationSql.split(EXACT_DIMENSION_GROUP)).toHaveLength(6);
    expect(migrationSql).toContain(
      'STRING_AGG(initial.champion_id, CHR(31) ORDER BY initial.champion_id)',
    );
    expect(migrationSql).toContain('COUNT(*)::SMALLINT AS initial_team_size');
    expect(migrationSql).toContain('AS meta_level');
  });

  it('joins conditional rows back to the complete parent cell identity', () => {
    const exactJoin = `USING (
    observed_on,
    gameplay_ruleset_version,
    engine_version,
    gameplay_content_hash,
    difficulty,
    mode,
    initial_team_size,
    initial_composition_hash,
    meta_level
  )`;
    expect(migrationSql.split(exactJoin)).toHaveLength(4);
  });
});
