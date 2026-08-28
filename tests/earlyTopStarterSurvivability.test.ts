import { beforeAll, describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import {
  EARLY_TOP_COHORT_DIFFICULTIES,
  EARLY_TOP_COHORT_STARTER_IDS,
  type EarlyTopCohortDocument,
  generateEarlyTopCohortDocument,
} from '@/game/balance/earlyTopCohort';

interface StarterDifficultyEvidence {
  readonly wins: number;
  readonly firstCombatWins: number;
  readonly earlyTopDeaths: number;
}

function createStarterMatrix(
  document: EarlyTopCohortDocument,
): Record<string, Record<string, StarterDifficultyEvidence>> {
  return Object.fromEntries(
    EARLY_TOP_COHORT_STARTER_IDS.map((starterId) => [
      starterId,
      Object.fromEntries(
        EARLY_TOP_COHORT_DIFFICULTIES.map((difficulty) => {
          const cell = document.reports.find(
            (report) => report.starterId === starterId && report.difficulty === difficulty,
          );
          if (!cell) throw new Error(`Missing ${starterId}/${difficulty} early Top cell.`);
          return [
            difficulty,
            {
              wins: cell.run.wins,
              firstCombatWins: cell.firstCombat.wins,
              earlyTopDeaths: cell.earlyTop.terminalDeathsWithinFirstThreeCombats,
            },
          ];
        }),
      ),
    ]),
  );
}

function totalStarterEvidence(
  matrix: Record<string, Record<string, StarterDifficultyEvidence>>,
  starterId: string,
): StarterDifficultyEvidence {
  const cells = Object.values(matrix[starterId] ?? {});
  return cells.reduce(
    (total, cell) => ({
      wins: total.wins + cell.wins,
      firstCombatWins: total.firstCombatWins + cell.firstCombatWins,
      earlyTopDeaths: total.earlyTopDeaths + cell.earlyTopDeaths,
    }),
    { wins: 0, firstCombatWins: 0, earlyTopDeaths: 0 },
  );
}

describe('P0-BAL-05 starter survivability decision', () => {
  let matrix: Record<string, Record<string, StarterDifficultyEvidence>>;

  beforeAll(() => {
    const authority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
    if (!authority) throw new Error('The working authority verifier is unavailable.');
    matrix = createStarterMatrix(generateEarlyTopCohortDocument(authority));
  }, 60_000);

  it('reproduces all ten starters across Easy, Normal and Hard', () => {
    expect(matrix).toEqual({
      Annie: {
        easy: { wins: 4, firstCombatWins: 30, earlyTopDeaths: 2 },
        normal: { wins: 1, firstCombatWins: 30, earlyTopDeaths: 3 },
        hard: { wins: 0, firstCombatWins: 30, earlyTopDeaths: 19 },
      },
      Ashe: {
        easy: { wins: 14, firstCombatWins: 30, earlyTopDeaths: 0 },
        normal: { wins: 5, firstCombatWins: 30, earlyTopDeaths: 0 },
        hard: { wins: 2, firstCombatWins: 30, earlyTopDeaths: 0 },
      },
      Darius: {
        easy: { wins: 2, firstCombatWins: 30, earlyTopDeaths: 2 },
        normal: { wins: 2, firstCombatWins: 30, earlyTopDeaths: 2 },
        hard: { wins: 1, firstCombatWins: 30, earlyTopDeaths: 17 },
      },
      Garen: {
        easy: { wins: 4, firstCombatWins: 30, earlyTopDeaths: 0 },
        normal: { wins: 3, firstCombatWins: 30, earlyTopDeaths: 2 },
        hard: { wins: 1, firstCombatWins: 30, earlyTopDeaths: 7 },
      },
      Jinx: {
        easy: { wins: 12, firstCombatWins: 30, earlyTopDeaths: 0 },
        normal: { wins: 10, firstCombatWins: 30, earlyTopDeaths: 0 },
        hard: { wins: 3, firstCombatWins: 30, earlyTopDeaths: 3 },
      },
      Leona: {
        easy: { wins: 10, firstCombatWins: 30, earlyTopDeaths: 0 },
        normal: { wins: 5, firstCombatWins: 30, earlyTopDeaths: 0 },
        hard: { wins: 2, firstCombatWins: 30, earlyTopDeaths: 0 },
      },
      Lux: {
        easy: { wins: 10, firstCombatWins: 30, earlyTopDeaths: 0 },
        normal: { wins: 6, firstCombatWins: 30, earlyTopDeaths: 0 },
        hard: { wins: 2, firstCombatWins: 30, earlyTopDeaths: 2 },
      },
      Malphite: {
        easy: { wins: 14, firstCombatWins: 30, earlyTopDeaths: 0 },
        normal: { wins: 10, firstCombatWins: 30, earlyTopDeaths: 0 },
        hard: { wins: 2, firstCombatWins: 30, earlyTopDeaths: 0 },
      },
      Soraka: {
        easy: { wins: 7, firstCombatWins: 30, earlyTopDeaths: 0 },
        normal: { wins: 3, firstCombatWins: 30, earlyTopDeaths: 0 },
        hard: { wins: 1, firstCombatWins: 30, earlyTopDeaths: 11 },
      },
      Warwick: {
        easy: { wins: 7, firstCombatWins: 30, earlyTopDeaths: 0 },
        normal: { wins: 5, firstCombatWins: 30, earlyTopDeaths: 0 },
        hard: { wins: 1, firstCombatWins: 30, earlyTopDeaths: 1 },
      },
    });
  });

  it('rejects an isolated survivability buff for Ashe or Garen', () => {
    expect(totalStarterEvidence(matrix, 'Ashe')).toEqual({
      wins: 21,
      firstCombatWins: 90,
      earlyTopDeaths: 0,
    });
    expect(totalStarterEvidence(matrix, 'Garen')).toEqual({
      wins: 8,
      firstCombatWins: 90,
      earlyTopDeaths: 9,
    });
    expect(totalStarterEvidence(matrix, 'Annie')).toMatchObject({ wins: 5, earlyTopDeaths: 24 });
    expect(totalStarterEvidence(matrix, 'Darius')).toMatchObject({ wins: 5, earlyTopDeaths: 21 });
    expect(totalStarterEvidence(matrix, 'Soraka')).toMatchObject({ earlyTopDeaths: 11 });
  });
});
