import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import { simulateAuthorityCohortMatrix } from '@/game/balance/authorityCohort';
import {
  type AuthorityCohortMatrixDefinition,
  createAuthorityCohortMatrix,
  createAuthorityCohortStratum,
} from '@/game/balance/authorityCohortMatrix';
import {
  type BalancePolicy,
  type BalanceScenario,
  survivalGreedyPolicy,
} from '@/game/balance/balancePolicy';

const cautiousPolicy: BalancePolicy = {
  manifest: { id: 'cautious-policy', version: 2 },
  buildAttempt: survivalGreedyPolicy.buildAttempt,
  nextCommand: survivalGreedyPolicy.nextCommand,
};

function completeDefinition(): AuthorityCohortMatrixDefinition {
  return {
    difficulties: ['hard', 'easy', 'normal'],
    teamProfiles: [
      {
        id: 'duo-garen-lux',
        team: [{ championId: 'Garen' }, { championId: 'Lux', statMultiplier: 1.1 }],
      },
      { id: 'solo-garen', team: [{ championId: 'Garen' }] },
    ],
    masteryProfiles: [
      { id: 'maxed', masterySnapshot: { Lux: 4, Garen: 4 } },
      { id: 'none', masterySnapshot: {} },
    ],
    runeProfiles: [
      { id: 'three-keystones', runeIds: ['electrocute', 'press_the_attack'] },
      { id: 'none', runeIds: [] },
    ],
    enhancementProfiles: [
      { id: 'focused', enhancementSnapshot: { Garen: { fighter_core_1: 1 } } },
      { id: 'none', enhancementSnapshot: {} },
    ],
    policies: [survivalGreedyPolicy, cautiousPolicy],
  };
}

function minimalDefinition(
  overrides: Partial<AuthorityCohortMatrixDefinition> = {},
): AuthorityCohortMatrixDefinition {
  return {
    difficulties: ['normal'],
    teamProfiles: [{ id: 'solo-soraka', team: [{ championId: 'Soraka', statMultiplier: 0.1 }] }],
    masteryProfiles: [{ id: 'none', masterySnapshot: {} }],
    runeProfiles: [{ id: 'none', runeIds: [] }],
    enhancementProfiles: [{ id: 'none', enhancementSnapshot: {} }],
    policies: [survivalGreedyPolicy],
    ...overrides,
  };
}

describe('authority cohort stratification matrix', () => {
  it('builds the complete difficulty × team × meta × policy cross-product', () => {
    const definition = completeDefinition();
    const cells = createAuthorityCohortMatrix(definition);

    expect(cells).toHaveLength(3 * 2 * 2 * 2 * 2 * 2);
    expect(cells[0]?.stratum.difficulty).toBe('easy');
    expect(new Set(cells.map((cell) => cell.id)).size).toBe(cells.length);
    expect(new Set(cells.map((cell) => cell.stratum.fingerprint)).size).toBe(cells.length);
    expect(new Set(cells.map((cell) => cell.stratum.team.size))).toEqual(new Set([1, 2]));
    expect(new Set(cells.map((cell) => cell.profiles.team))).toEqual(
      new Set(['duo-garen-lux', 'solo-garen']),
    );
    expect(new Set(cells.map((cell) => cell.profiles.mastery))).toEqual(new Set(['maxed', 'none']));
    expect(new Set(cells.map((cell) => cell.profiles.runes))).toEqual(
      new Set(['none', 'three-keystones']),
    );
    expect(new Set(cells.map((cell) => cell.profiles.enhancements))).toEqual(
      new Set(['focused', 'none']),
    );
    expect(
      new Set(cells.map((cell) => `${cell.policy.manifest.id}@${cell.policy.manifest.version}`)),
    ).toEqual(new Set(['cautious-policy@2', 'survival-greedy@1']));

    const duo = cells.find(
      (cell) =>
        cell.stratum.difficulty === 'normal' &&
        cell.profiles.team === 'duo-garen-lux' &&
        cell.profiles.mastery === 'maxed' &&
        cell.profiles.runes === 'three-keystones' &&
        cell.profiles.enhancements === 'focused' &&
        cell.policy.manifest.id === 'cautious-policy',
    );
    expect(duo).toMatchObject({
      id: expect.stringContaining(
        'difficulty=normal|team=duo-garen-lux|size=2|mastery=maxed|runes=three-keystones|enhancements=focused|policy=cautious-policy@2',
      ),
      stratum: {
        difficulty: 'normal',
        team: {
          size: 2,
          composition: [
            { championId: 'Garen', statMultiplier: 1 },
            { championId: 'Lux', statMultiplier: 1.1 },
          ],
        },
        starterBudget: {
          teamSize: 2,
          cohortId: 'starters-2',
          enemyFormationMultiplier: 1.55,
          earlyTopEnemyFormationMultiplier: 0.95,
        },
        masterySnapshot: { Garen: 4, Lux: 4 },
        runeIds: ['electrocute', 'press_the_attack'],
        enhancementSnapshot: { Garen: { fighter_core_1: 1 } },
        policy: { id: 'cautious-policy', version: 2 },
      },
    });
    expect(duo?.scenario.team).not.toBe(definition.teamProfiles[0]?.team);
    expect(duo?.scenario.masterySnapshot).not.toBe(definition.masteryProfiles[0]?.masterySnapshot);
  });

  it('orders cells canonically and fingerprints semantics independently of labels and map order', () => {
    const definition = completeDefinition();
    const reversed = {
      difficulties: [...definition.difficulties].reverse(),
      teamProfiles: [...definition.teamProfiles].reverse(),
      masteryProfiles: [...definition.masteryProfiles].reverse(),
      runeProfiles: [...definition.runeProfiles].reverse(),
      enhancementProfiles: [...definition.enhancementProfiles].reverse(),
      policies: [...definition.policies].reverse(),
    } satisfies AuthorityCohortMatrixDefinition;

    expect(
      createAuthorityCohortMatrix(reversed).map((cell) => [cell.id, cell.stratum.fingerprint]),
    ).toEqual(
      createAuthorityCohortMatrix(definition).map((cell) => [cell.id, cell.stratum.fingerprint]),
    );

    const left: BalanceScenario = {
      id: 'left-label',
      difficulty: 'normal',
      team: [{ championId: 'Garen' }, { championId: 'Lux' }],
      runeIds: ['electrocute'],
      masterySnapshot: { Lux: 2, Garen: 1 },
      enhancementSnapshot: { Lux: {}, Garen: { fighter_core_1: 1 } },
    };
    const right: BalanceScenario = {
      ...left,
      id: 'right-label',
      masterySnapshot: { Garen: 1, Lux: 2 },
      enhancementSnapshot: { Garen: { fighter_core_1: 1 }, Lux: {} },
    };
    const leftStratum = createAuthorityCohortStratum(left, survivalGreedyPolicy.manifest);
    const rightStratum = createAuthorityCohortStratum(right, survivalGreedyPolicy.manifest);
    expect(leftStratum.cellId).not.toBe(rightStratum.cellId);
    expect(leftStratum.fingerprint).toBe(rightStratum.fingerprint);
  });

  it('rejects missing axes, duplicate labels and semantically duplicate cells', () => {
    expect(() => createAuthorityCohortMatrix(minimalDefinition({ difficulties: [] }))).toThrow(
      'Difficulties must not be empty',
    );
    expect(() =>
      createAuthorityCohortMatrix(
        minimalDefinition({
          runeProfiles: [
            { id: 'none', runeIds: [] },
            { id: 'none', runeIds: ['electrocute'] },
          ],
        }),
      ),
    ).toThrow('Rune profile "none" is duplicated');
    expect(() =>
      createAuthorityCohortMatrix(
        minimalDefinition({
          teamProfiles: [
            { id: 'first', team: [{ championId: 'Soraka', statMultiplier: 0.1 }] },
            { id: 'second', team: [{ championId: 'Soraka', statMultiplier: 0.1 }] },
          ],
        }),
      ),
    ).toThrow('have identical dimensions');
  });

  it('replays the same seed set independently in every stratified cell', () => {
    const authority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
    if (!authority) throw new Error('Current authority verifier is unavailable.');
    const cells = createAuthorityCohortMatrix(
      minimalDefinition({ difficulties: ['hard', 'easy'] }),
    );
    const result = simulateAuthorityCohortMatrix({
      authority,
      cells,
      seeds: [0],
    });

    expect(result.cohorts).toHaveLength(2);
    expect(result.cohorts.map((cohort) => cohort.stratum.difficulty)).toEqual(['easy', 'hard']);
    expect(result.cohorts.map((cohort) => cohort.stratum.fingerprint)).toEqual(
      cells.map((cell) => cell.stratum.fingerprint),
    );
    for (const [index, cohort] of result.cohorts.entries()) {
      expect(cohort.scenarioId).toBe(cells[index]?.id);
      expect(cohort.runs.map((run) => run.seed)).toEqual([0]);
      expect(cohort.stratum).toMatchObject({
        team: { size: 1, composition: [{ championId: 'Soraka', statMultiplier: 0.1 }] },
        starterBudget: {
          teamSize: 1,
          cohortId: 'starters-1',
          enemyFormationMultiplier: 1,
          earlyTopEnemyFormationMultiplier: 0.61,
        },
        masterySnapshot: {},
        runeIds: [],
        enhancementSnapshot: {},
        policy: survivalGreedyPolicy.manifest,
      });
    }
  });
});
