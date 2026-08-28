import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { implementedChampions } from '@/data/champion';
import {
  createEarlyTopCohortCells,
  EARLY_TOP_COHORT_DIFFICULTIES,
  EARLY_TOP_COHORT_SEED_COUNT,
  EARLY_TOP_COHORT_STARTER_IDS,
  type EarlyTopCohortDocument,
} from '@/game/balance/earlyTopCohort';

const artifact = JSON.parse(
  readFileSync(new URL('../config/early-top-cohort-v17.json', import.meta.url), 'utf8'),
) as EarlyTopCohortDocument;

describe('P0-BAL-05 early Top cohort fixture', () => {
  it('stratifies all ten starters across all three difficulties', () => {
    expect([...EARLY_TOP_COHORT_STARTER_IDS].sort()).toEqual(
      implementedChampions.map((champion) => champion.id).sort(),
    );
    const cells = createEarlyTopCohortCells();
    expect(cells).toHaveLength(30);
    expect(new Set(cells.map((cell) => cell.stratum.fingerprint))).toHaveLength(30);
    for (const starterId of EARLY_TOP_COHORT_STARTER_IDS) {
      for (const difficulty of EARLY_TOP_COHORT_DIFFICULTIES) {
        expect(
          cells.some(
            (cell) =>
              cell.stratum.difficulty === difficulty &&
              cell.stratum.team.composition[0]?.championId === starterId,
          ),
        ).toBe(true);
      }
    }
  });

  it('commits the reproducible v17 zero-win evidence with bounded extreme seeds', () => {
    expect(artifact).toMatchObject({
      schemaVersion: 1,
      authority: {
        engineVersion: 'run-engine-v17',
        contentHash: '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
      },
      source: {
        cellCount: 30,
        runsPerCell: EARLY_TOP_COHORT_SEED_COUNT,
      },
      summary: {
        totalRuns: 900,
        runWins: 0,
        runWinRate: 0,
      },
    });
    expect(artifact.reports).toHaveLength(30);
    for (const report of artifact.reports) {
      expect(report.sampleSize).toBe(EARLY_TOP_COHORT_SEED_COUNT);
      expect(report.firstCombat.observations).toBe(EARLY_TOP_COHORT_SEED_COUNT);
      expect(report.extremeSeeds.leastProgress.reproductionCommand).toContain(
        'npm run balance:repro --',
      );
      expect(report.extremeSeeds.mostProgress.reproductionCommand).toContain(
        `--seed ${report.extremeSeeds.mostProgress.seed}`,
      );
    }
  });
});
