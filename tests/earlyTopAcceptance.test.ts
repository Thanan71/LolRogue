import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type EarlyTopCohortDocument,
  evaluateEarlyTopCohortAcceptance,
} from '@/game/balance/earlyTopCohort';

const fixture = JSON.parse(
  readFileSync(new URL('../config/early-top-cohort-v18.json', import.meta.url), 'utf8'),
) as EarlyTopCohortDocument;
const current = JSON.parse(
  readFileSync(new URL('../config/early-top-cohort-v21.json', import.meta.url), 'utf8'),
) as EarlyTopCohortDocument;

function documentWithFirstCombatWins(normalWins: number, hardWins: number): EarlyTopCohortDocument {
  return {
    ...fixture,
    summary: {
      ...fixture.summary,
      byDifficulty: fixture.summary.byDifficulty.map((summary) => {
        const wins =
          summary.difficulty === 'normal'
            ? normalWins
            : summary.difficulty === 'hard'
              ? hardWins
              : summary.firstCombatWins;
        return {
          ...summary,
          firstCombatWins: wins,
          firstCombatWinRate: wins / summary.sampleSize,
        };
      }),
    },
    reports: fixture.reports.map((report) => ({
      ...report,
      firstCombat: {
        ...report.firstCombat,
        wins: Math.max(1, report.firstCombat.wins),
        winRate: Math.max(1, report.firstCombat.wins) / report.firstCombat.observations,
      },
    })),
  };
}

describe('early Top acceptance', () => {
  it('accepts the committed v21 measurements with real first-combat defeats', () => {
    expect(evaluateEarlyTopCohortAcceptance(current)).toMatchObject({
      passed: true,
      violations: [],
      zeroWinStarters: [],
      difficulty: [
        { difficulty: 'normal', wins: 249, winRate: 0.83 },
        { difficulty: 'hard', wins: 224, winRate: 224 / 300 },
      ],
    });
    expect(current.summary.runWins).toBeGreaterThan(0);
    expect(current.summary.runWins).toBeLessThan(current.summary.totalRuns);
  });

  it('accepts the inclusive Normal and Hard working ranges', () => {
    const lowerBounds = evaluateEarlyTopCohortAcceptance(documentWithFirstCombatWins(225, 150));
    const upperBounds = evaluateEarlyTopCohortAcceptance(documentWithFirstCombatWins(285, 240));

    expect(lowerBounds).toMatchObject({ passed: true, violations: [], zeroWinStarters: [] });
    expect(upperBounds).toMatchObject({ passed: true, violations: [], zeroWinStarters: [] });
  });

  it('rejects an aggregate outside its range or any zero-win starter', () => {
    const outside = evaluateEarlyTopCohortAcceptance(documentWithFirstCombatWins(286, 149));
    expect(outside.passed).toBe(false);
    expect(outside.violations).toEqual(
      expect.arrayContaining([expect.stringContaining('normal'), expect.stringContaining('hard')]),
    );

    const document = documentWithFirstCombatWins(250, 220);
    const firstReport = document.reports[0]!;
    const zeroStarter = evaluateEarlyTopCohortAcceptance({
      ...document,
      reports: [
        {
          ...firstReport,
          firstCombat: { ...firstReport.firstCombat, wins: 0, winRate: 0 },
        },
        ...document.reports.slice(1),
      ],
    });
    expect(zeroStarter.passed).toBe(false);
    expect(zeroStarter.zeroWinStarters).toEqual([
      { difficulty: firstReport.difficulty, starterId: firstReport.starterId },
    ]);
  });
});
