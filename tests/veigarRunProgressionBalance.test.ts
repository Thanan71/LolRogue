import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import artifact from '@/../config/veigar-run-progression-balance-v22.json';
import { championDB } from '@/data/championDatabase';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import {
  createVeigarBalanceCombatProbes,
  createVeigarBalanceScenario,
  generateVeigarRunProgressionBalanceDocument,
  summarizeVeigarBalanceRuns,
  VEIGAR_BALANCE_SEEDS,
  type VeigarBalanceBattleClasses,
  type VeigarBalanceRunObservation,
} from '@/game/balance/veigarRunProgressionBalance';
import { BattleManager } from '@/game/battle/BattleManager';
import { ChampionInstance } from '@/game/ChampionInstance';
import { importInstrumentedAuthorityBundle } from './helpers/instrumentedAuthorityCombatRuntime';

describe('Veigar v22 balance campaign', () => {
  it('uses paired fresh teams with the identical policy controls', () => {
    expect(VEIGAR_BALANCE_SEEDS).toHaveLength(30);
    for (const id of ['Veigar', 'Annie', 'Lux']) {
      expect(createVeigarBalanceScenario(id)).toMatchObject({
        difficulty: 'normal',
        team: [{ championId: 'Garen' }, { championId: id }],
        masterySnapshot: {},
        enhancementSnapshot: {},
        runeIds: [],
      });
    }
    expect(artifact.methodology.seeds).toEqual(VEIGAR_BALANCE_SEEDS);
    expect(artifact.methodology.difficulties).toEqual(['normal', 'easy']);
    expect(
      artifact.earlyTopReports.find((report) => report.championId === 'Veigar')?.wins,
    ).toBeGreaterThan(0);
    expect(artifact.authority).toEqual({
      engineVersion: AUTHORITY_ENGINE_VERSION,
      contentHash: AUTHORITY_CONTENT_HASH,
    });
    expect(artifact.reports.every((report) => report.runs === 30)).toBe(true);
  });

  it('reports absent or dead checkpoint populations explicitly instead of inventing end-run means', () => {
    const base: VeigarBalanceRunObservation = {
      seed: 1,
      won: false,
      endBiome: 'top_lane',
      endReason: 'defeat',
      totalDamage: 100,
      teamDamage: 200,
      combatWins: 1,
      combatCount: 2,
      finalCounter: 5,
      maxCounter: 5,
      finalTeamSize: 2,
      checkpoints: [],
      reachedSnapshots: [],
      reproductionCommand: 'repro',
    };
    const summary = summarizeVeigarBalanceRuns([
      base,
      {
        ...base,
        seed: 2,
        checkpoints: [
          { seed: 2, biome: 'top_lane', championAlive: true, counter: 10, cumulativeDamage: 100 },
          { seed: 2, biome: 'jungle', championAlive: false, counter: 10, cumulativeDamage: 100 },
        ],
        reachedSnapshots: [
          { seed: 2, biome: 'top_lane', championAlive: true, counter: 10, cumulativeDamage: 100 },
          { seed: 2, biome: 'jungle', championAlive: false, counter: 10, cumulativeDamage: 100 },
        ],
      },
    ]);
    expect(summary.runWinRate).toBe(0);
    expect(summary.biomeCheckpoints[0]).toMatchObject({
      startedRuns: 2,
      completedRuns: 1,
      completionRate: 0.5,
      reachedRuns: 1,
      counterMeanReachedSnapshots: 10,
      championSurvivors: 1,
      counterMeanSurvivors: 10,
    });
    expect(summary.biomeCheckpoints[1]).toMatchObject({
      completedRuns: 1,
      championSurvivors: 0,
      counterMeanSurvivors: null,
      reachedRuns: 1,
      counterMeanReachedSnapshots: 10,
    });
    expect(summary.biomeCheckpoints[3]).toMatchObject({
      completedRuns: 0,
      championSurvivors: 0,
      permanentAPBonusMeanSurvivors: null,
    });
  });

  it('executes real current source and Edge cohort replay and cap/R probes identically', async () => {
    const edge = await importInstrumentedAuthorityBundle(
      resolve(process.cwd(), 'supabase/functions/verify-run/run-authority.bundle.js'),
    );
    const sourceAuthority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
    const edgeAuthority = edge.getAuthorityVerifier(
      AUTHORITY_ENGINE_VERSION,
      AUTHORITY_CONTENT_HASH,
    );
    if (!sourceAuthority || !edgeAuthority)
      throw new Error('Current v22 verifiers are unavailable.');
    const sourceClasses = { championDB, BattleManager, ChampionInstance };
    const edgeClasses = edge as unknown as VeigarBalanceBattleClasses;
    const sourceProbes = createVeigarBalanceCombatProbes(
      sourceClasses,
      VEIGAR_BALANCE_SEEDS.slice(0, 2),
    );
    expect(createVeigarBalanceCombatProbes(edgeClasses, VEIGAR_BALANCE_SEEDS.slice(0, 2))).toEqual(
      sourceProbes,
    );
    const document = generateVeigarRunProgressionBalanceDocument({
      sourceAuthority,
      edgeAuthority,
      sourceClasses,
      edgeClasses,
      seeds: VEIGAR_BALANCE_SEEDS.slice(0, 2),
    });
    expect(Object.values(document.gates).every(Boolean)).toBe(true);
    for (const report of document.reports) {
      const committed = artifact.reports.find(
        (entry) => entry.championId === report.championId && entry.difficulty === report.difficulty,
      );
      expect(report.observations).toEqual(committed?.observations.slice(0, 2));
    }
  }, 30_000);
});
