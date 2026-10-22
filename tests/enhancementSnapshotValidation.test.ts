// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { championDB } from '@/data/championDatabase';
import {
  AuthorityRunVerificationError,
  validateRunAttempt,
} from '@/game/authority/RunCommandValidator';
import type { AuthorityRunAttempt } from '@/game/authority/types';
import * as catalog from '@/game/enhancements/catalog';
import type { EnhancementRequirement } from '@/types/enhancementTree';

const attempt = (
  ranks: Record<string, number>,
  masterySnapshot: Record<string, number> = { Garen: 4 },
): AuthorityRunAttempt => ({
  runUuid: 'e6666666-6666-4666-8666-666666666666',
  seed: 17,
  difficulty: 'easy',
  mode: 'normal',
  team: [{ championId: 'Garen' }],
  runeIds: [],
  enhancementSnapshot: { Garen: ranks },
  masterySnapshot,
});
const invalid = (value: AuthorityRunAttempt) => {
  let caught: unknown;
  try {
    validateRunAttempt(value);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AuthorityRunVerificationError);
  expect(caught).toMatchObject({ code: 'invalid_attempt' });
};

function withRequirement(requirement: EnhancementRequirement, targetId = 'fighter_core_3') {
  const contract = catalog.getEnhancementContractForChampion(championDB.getById('Garen')!);
  const target = contract.nodes.find((node) => node.id === targetId)!;
  target.requirement = requirement;
  vi.spyOn(catalog, 'getEnhancementContractForChampion').mockReturnValue(contract);
  return contract;
}

afterEach(() => vi.restoreAllMocks());

const invalidOwnedStates: Record<string, number>[] = [
  { fighter_duelist_1: 1 },
  { fighter_duelist_1: 1, fighter_duelist_2: 1 },
  { fighter_duelist_1: 1, fighter_duelist_2: 1, fighter_duelist_3: 1 },
  { garen_durability_1: 1, garen_execution_1: 1 },
  { garen_execution_2: 1 },
  { annie_burst_1: 1 },
  { tank_core_1: 1 },
  { fighter_core_2: 1 },
];

describe('TREE-05: frozen authority enhancement state uses the canonical declarative contract', () => {
  it('accepts a legal role chain and already attested specialization despite closed publication', () => {
    expect(() =>
      validateRunAttempt(
        attempt({
          fighter_core_1: 1,
          fighter_core_2: 1,
          fighter_core_3: 1,
          garen_execution_1: 1,
          garen_execution_2: 1,
        }),
      ),
    ).not.toThrow();
    expect(() => validateRunAttempt(attempt({ fighter_core_1: 0 }, {}))).not.toThrow();
  });

  it.each(invalidOwnedStates)(
    'rejects unsupported, inherited, exclusive, incomplete or wrong champion/role ownership: %j',
    (ranks) => {
      invalid(attempt(ranks));
    },
  );

  it('uses the actual frozen mastery and defaults a missing champion level to zero', () => {
    expect(() => validateRunAttempt(attempt({ fighter_core_1: 1 }, {}))).not.toThrow();
    invalid(attempt({ fighter_core_1: 1, fighter_core_2: 1 }, {}));
    invalid(attempt({ garen_execution_1: 1 }, { Garen: 1 }));
    invalid(attempt({ garen_execution_1: 1, garen_execution_2: 1 }, { Garen: 2 }));
    expect(() => validateRunAttempt(attempt({ garen_execution_1: 1 }, { Garen: 2 }))).not.toThrow();
  });

  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, 2, '1', null, [], {}])(
    'rejects malformed or oversized owned ranks: %j',
    (rank) => {
      invalid(attempt({ fighter_core_1: rank } as unknown as Record<string, number>));
    },
  );

  it('rejects unknown IDs even at rank zero and malformed mastery/snapshot containers', () => {
    invalid(attempt({ forged: 0 }));
    for (const mastery of [undefined, null, [], { Garen: '4' }, { Garen: 5 }, { Garen: 1.5 }])
      invalid({ ...attempt({}), masterySnapshot: mastery } as unknown as AuthorityRunAttempt);
    for (const snapshot of [undefined, null, [], { Garen: [] }, { Garen: null }])
      invalid({ ...attempt({}), enhancementSnapshot: snapshot } as unknown as AuthorityRunAttempt);
  });

  it('honors OR alternatives instead of the legacy prerequisite list', () => {
    withRequirement({
      kind: 'or',
      conditions: [
        { kind: 'node', nodeId: 'fighter_core_1' },
        { kind: 'node', nodeId: 'fighter_bruiser_1' },
      ],
    });
    expect(() =>
      validateRunAttempt(attempt({ fighter_core_1: 1, fighter_core_3: 1 })),
    ).not.toThrow();
    expect(() =>
      validateRunAttempt(attempt({ fighter_bruiser_1: 1, fighter_core_3: 1 })),
    ).not.toThrow();
    invalid(attempt({ fighter_core_3: 1 }));
  });

  it('requires every AND member and the declared minimum parent rank', () => {
    const contract = withRequirement({
      kind: 'and',
      conditions: [
        { kind: 'node', nodeId: 'fighter_core_1', minRank: 2 },
        { kind: 'node', nodeId: 'fighter_bruiser_1' },
      ],
    });
    contract.nodes.find((node) => node.id === 'fighter_core_1')!.maxRanks = 2;
    invalid(attempt({ fighter_core_1: 1, fighter_bruiser_1: 1, fighter_core_3: 1 }));
    invalid(attempt({ fighter_core_1: 2, fighter_core_3: 1 }));
    expect(() =>
      validateRunAttempt(attempt({ fighter_core_1: 2, fighter_bruiser_1: 1, fighter_core_3: 1 })),
    ).not.toThrow();
  });

  it('fails closed if a future budget is introduced without a frozen spend attestation', () => {
    const contract = catalog.getEnhancementContractForChampion(championDB.getById('Garen')!);
    contract.budget = 100;
    vi.spyOn(catalog, 'getEnhancementContractForChampion').mockReturnValue(contract);
    invalid(attempt({ fighter_core_1: 1 }));
  });
});
