import path from 'node:path';
import { describe, expect, it } from 'vitest';
import matrixJson from '../config/champion-combat-matrix-current.json';
import {
  CHAMPION_COMBAT_MATRIX_CHAMPION_IDS,
  CHAMPION_COMBAT_MATRIX_SEEDS,
  type ChampionCombatMatrixComparison,
  createChampionCombatMatrixPartitions,
  runChampionCombatMatrix,
} from '@/game/balance/championCombatMatrix';
import { createSourceChampionCombatRuntime } from '@/game/balance/championCombatSourceRuntime';
import { loadInstrumentedAuthorityCombatRuntime } from './helpers/instrumentedAuthorityCombatRuntime';

const matrix = matrixJson as unknown as ChampionCombatMatrixComparison;

describe('champion combat acceptance matrix', () => {
  it('enumerates every complementary 5v5 partition exactly once', () => {
    const partitions = createChampionCombatMatrixPartitions();
    expect(partitions).toHaveLength(126);
    expect(new Set(partitions.map((partition) => partition.id))).toHaveLength(126);
    for (const partition of partitions) {
      expect(partition.teamA).toHaveLength(5);
      expect(partition.teamB).toHaveLength(5);
      expect(new Set([...partition.teamA, ...partition.teamB])).toEqual(
        new Set(CHAMPION_COMBAT_MATRIX_CHAMPION_IDS),
      );
    }
  });

  it('keeps the committed full gate narrow and leaves P0 calibration open', () => {
    expect(matrix.methodology).toEqual({
      level: 1,
      partitionCount: 126,
      orientationsPerPartition: 2,
      pairedSeeds: CHAMPION_COMBAT_MATRIX_SEEDS,
      combatsPerRuntime: 7_560,
    });
    expect(matrix.p1Acceptance).toMatchObject({ passed: true, violations: [] });
    expect(matrix.p0Calibration.status).toBe('out-of-scope-open');
    expect(matrix.candidateSourceParity.exact).toBe(true);
    expect(Object.values(matrix.candidate.metricAvailability).every(Boolean)).toBe(true);
    for (const champion of matrix.candidate.champions) {
      expect(champion.appearances).toBe(7_560);
      expect(champion.wins).toBeGreaterThan(0);
      expect(champion.losses).toBeGreaterThan(0);
    }
  });

  it('replays paired seeds deterministically in the current source and bundle', async () => {
    const partition = createChampionCombatMatrixPartitions().slice(0, 2);
    const pairedSeeds = [0, 17, 29] as const;
    const source = createSourceChampionCombatRuntime();
    const bundle = await loadInstrumentedAuthorityCombatRuntime(
      path.resolve('supabase/functions/verify-run/run-authority.bundle.js'),
    );
    const options = { partitions: partition, pairedSeeds };
    const firstSourceRun = runChampionCombatMatrix(source, options);
    const secondSourceRun = runChampionCombatMatrix(source, options);
    const bundleRun = runChampionCombatMatrix(bundle, options);

    expect(secondSourceRun).toEqual(firstSourceRun);
    expect(bundleRun).toEqual(firstSourceRun);
  }, 30_000);
});
