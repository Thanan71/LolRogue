import path from 'node:path';
import { describe, expect, it } from 'vitest';
import matrixJson from '../config/champion-combat-matrix-current.json';
import {
  CHAMPION_COMBAT_MATRIX_CHAMPION_IDS,
  CHAMPION_COMBAT_MATRIX_SEEDS,
  type ChampionCombatMatrixComparison,
  createChampionCombatMatrixPartitions,
  evaluateChampionCombatP0Acceptance,
  runChampionCombatMatrix,
} from '@/game/balance/championCombatMatrix';
import { createSourceChampionCombatRuntime } from '@/game/balance/championCombatSourceRuntime';
import { implementedChampions } from '@/data/champion';
import { loadInstrumentedAuthorityCombatRuntime } from './helpers/instrumentedAuthorityCombatRuntime';

const matrix = matrixJson as unknown as ChampionCombatMatrixComparison;

describe('champion combat acceptance matrix', () => {
  it('enumerates every complementary 5v5 partition exactly once', () => {
    expect(CHAMPION_COMBAT_MATRIX_CHAMPION_IDS).toEqual(
      implementedChampions.map((champion) => champion.id),
    );
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

  it('enforces the committed P0 inclusion gate with real wins and losses', () => {
    expect(matrix.methodology).toEqual({
      level: 1,
      partitionCount: 126,
      orientationsPerPartition: 2,
      pairedSeeds: CHAMPION_COMBAT_MATRIX_SEEDS,
      combatsPerRuntime: 7_560,
    });
    expect(matrix.p1Acceptance).toMatchObject({ passed: true, violations: [] });
    expect(matrix.p0Acceptance).toMatchObject({ passed: true, violations: [] });
    expect(matrix.p0Acceptance.measuredRosterGap).toBeLessThanOrEqual(0.1);
    expect(matrix.candidateSourceParity.exact).toBe(true);
    expect(Object.values(matrix.candidate.metricAvailability).every(Boolean)).toBe(true);
    for (const champion of matrix.candidate.champions) {
      expect(champion.appearances).toBe(7_560);
      expect(champion.wins).toBeGreaterThan(0);
      expect(champion.losses).toBeGreaterThan(0);
    }
  });

  it('accepts inclusive boundaries and rejects outliers or draws', () => {
    const boundaryReport = {
      ...matrix.candidate,
      champions: matrix.candidate.champions.map((champion, index) => {
        const wins = index % 2 === 0 ? 45 : 55;
        return {
          ...champion,
          appearances: 100,
          wins,
          losses: 100 - wins,
          draws: 0,
          decisiveWinRate: wins / 100,
        };
      }),
    };
    expect(evaluateChampionCombatP0Acceptance(boundaryReport)).toMatchObject({
      passed: true,
      measuredRosterGap: 0.1,
      violations: [],
    });

    const outsideReport = {
      ...boundaryReport,
      champions: boundaryReport.champions.map((champion, index) =>
        index === 0 ? { ...champion, wins: 44, losses: 56, decisiveWinRate: 0.44 } : champion,
      ),
    };
    expect(evaluateChampionCombatP0Acceptance(outsideReport)).toMatchObject({ passed: false });

    const drawnReport = {
      ...boundaryReport,
      champions: boundaryReport.champions.map((champion, index) =>
        index === 0 ? { ...champion, appearances: 101, draws: 1 } : champion,
      ),
    };
    expect(evaluateChampionCombatP0Acceptance(drawnReport)).toMatchObject({ passed: false });
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
