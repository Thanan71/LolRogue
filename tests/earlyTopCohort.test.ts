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

const v17Artifact = JSON.parse(
  readFileSync(new URL('../config/early-top-cohort-v17.json', import.meta.url), 'utf8'),
) as EarlyTopCohortDocument;
const v18Artifact = JSON.parse(
  readFileSync(new URL('../config/early-top-cohort-v18.json', import.meta.url), 'utf8'),
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
    expect(v17Artifact).toMatchObject({
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
    expect(v17Artifact.reports).toHaveLength(30);
    for (const report of v17Artifact.reports) {
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

  it('commits the reproducible v18 exit evidence and every measured dimension', () => {
    expect(v18Artifact).toMatchObject({
      schemaVersion: 1,
      authority: {
        engineVersion: 'run-engine-v18',
        contentHash: '9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17',
      },
      source: {
        cellCount: 30,
        runsPerCell: EARLY_TOP_COHORT_SEED_COUNT,
      },
      summary: {
        totalRuns: 900,
        runWins: 149,
        byDifficulty: [
          {
            difficulty: 'easy',
            sampleSize: 300,
            runWins: 84,
            firstCombatWins: 300,
            earlyTopDeathsWithinFirstThreeCombats: 4,
          },
          {
            difficulty: 'normal',
            sampleSize: 300,
            runWins: 50,
            firstCombatWins: 300,
            earlyTopDeathsWithinFirstThreeCombats: 7,
          },
          {
            difficulty: 'hard',
            sampleSize: 300,
            runWins: 15,
            firstCombatWins: 300,
            earlyTopDeathsWithinFirstThreeCombats: 60,
          },
        ],
      },
    });
    expect(v18Artifact.reports).toHaveLength(30);
    expect(v18Artifact.reports.reduce((total, report) => total + report.firstCombat.wins, 0)).toBe(
      900,
    );
    expect(
      v18Artifact.reports.reduce(
        (total, report) => total + report.earlyTop.terminalDeathsWithinFirstThreeCombats,
        0,
      ),
    ).toBe(71);

    for (const starterId of EARLY_TOP_COHORT_STARTER_IDS) {
      const starterReports = v18Artifact.reports.filter((report) => report.starterId === starterId);
      expect(starterReports).toHaveLength(3);
      expect(starterReports.reduce((total, report) => total + report.firstCombat.wins, 0)).toBe(90);
    }

    for (const report of v18Artifact.reports) {
      expect(report.resources).toEqual({
        hpInitialMeanRatio: expect.any(Number),
        hpFinalMeanRatio: expect.any(Number),
        mpInitialMeanRatio: expect.any(Number),
        mpFinalMeanRatio: expect.any(Number),
      });
      expect(report.economy.goldEarned.samples).toBe(EARLY_TOP_COHORT_SEED_COUNT);
      expect(report.economy.finalGold.samples).toBe(EARLY_TOP_COHORT_SEED_COUNT);
      expect(report.affordability).toMatchObject({
        shopVisits: expect.any(Number),
        visitsWithAnyAffordableOfferRate: expect.any(Number),
        allOffersAffordableRate: expect.any(Number),
      });
    }
  });
});
