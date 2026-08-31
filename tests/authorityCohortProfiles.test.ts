import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import { simulateAuthorityCohortMatrix } from '@/game/balance/authorityCohort';
import {
  AUTHORITY_COHORT_EXECUTION_PROFILES,
  AUTHORITY_COHORT_SENTINEL_CHAMPION_IDS,
  createAuthorityCohortExecutionCells,
  createAuthorityCohortSeeds,
} from '@/game/balance/authorityCohortProfiles';

describe('authority cohort execution profiles', () => {
  it('uses the required PR, nightly and release volumes', () => {
    expect(AUTHORITY_COHORT_EXECUTION_PROFILES).toEqual({
      pr: { seedCount: 30 },
      nightly: { seedCount: 500 },
      release: { seedCount: 1_000 },
    });
    expect(AUTHORITY_COHORT_EXECUTION_PROFILES.pr.seedCount).toBeGreaterThanOrEqual(30);
    expect(AUTHORITY_COHORT_EXECUTION_PROFILES.pr.seedCount).toBeLessThanOrEqual(50);
  });

  it('keeps smaller profiles as an exact prefix of larger paired seed sets', () => {
    const pr = createAuthorityCohortSeeds(AUTHORITY_COHORT_EXECUTION_PROFILES.pr.seedCount);
    const nightly = createAuthorityCohortSeeds(
      AUTHORITY_COHORT_EXECUTION_PROFILES.nightly.seedCount,
    );
    const release = createAuthorityCohortSeeds(
      AUTHORITY_COHORT_EXECUTION_PROFILES.release.seedCount,
    );

    expect(new Set(release).size).toBe(release.length);
    expect(nightly.slice(0, pr.length)).toEqual(pr);
    expect(release.slice(0, nightly.length)).toEqual(nightly);
  });

  it('pairs every sentinel stratum across all difficulties without aggregation', () => {
    const cells = createAuthorityCohortExecutionCells();
    const bySemanticProfile = new Map<string, (typeof cells)[number][]>();
    for (const cell of cells) {
      const key = `${cell.profiles.team}|${cell.profiles.mastery}|${cell.profiles.runes}|${cell.profiles.enhancements}`;
      bySemanticProfile.set(key, [...(bySemanticProfile.get(key) ?? []), cell]);
    }

    expect(cells).toHaveLength(45);
    expect(new Set(cells.map((cell) => cell.stratum.fingerprint)).size).toBe(cells.length);
    expect([...bySemanticProfile.values()]).toHaveLength(15);
    for (const pairedCells of bySemanticProfile.values()) {
      expect(pairedCells.map((cell) => cell.scenario.difficulty)).toEqual([
        'easy',
        'normal',
        'hard',
      ]);
    }
    expect(new Set(cells.map((cell) => cell.stratum.team.size))).toEqual(new Set([1, 2, 3]));
    expect(
      new Set(
        cells
          .filter((cell) => cell.stratum.team.size === 1)
          .map((cell) => cell.stratum.team.composition[0]!.championId),
      ),
    ).toEqual(new Set(AUTHORITY_COHORT_SENTINEL_CHAMPION_IDS));
    expect(cells.some((cell) => Object.keys(cell.stratum.masterySnapshot).length > 0)).toBe(true);
    expect(cells.some((cell) => cell.stratum.runeIds.length > 0)).toBe(true);
    expect(cells.some((cell) => Object.keys(cell.stratum.enhancementSnapshot).length > 0)).toBe(
      true,
    );
  });

  it('rejects invalid seed volumes', () => {
    expect(() => createAuthorityCohortSeeds(0)).toThrow(/positive safe integer/);
    expect(() => createAuthorityCohortSeeds(1.5)).toThrow(/positive safe integer/);
  });

  it('executes one paired seed through every sentinel cell', () => {
    const authority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
    expect(authority).toBeDefined();

    const result = simulateAuthorityCohortMatrix({
      authority: authority!,
      cells: createAuthorityCohortExecutionCells(),
      seeds: createAuthorityCohortSeeds(1),
    });

    expect(result.cohorts).toHaveLength(45);
    expect(result.cohorts.every((cohort) => cohort.runs.length === 1)).toBe(true);
    expect(result.cohorts.every((cohort) => cohort.runs[0]?.result.snapshot.terminal)).toBe(true);
  }, 30_000);
});
