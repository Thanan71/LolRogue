import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import {
  type AuthorityCohortRuntime,
  gateAuthorityCohortDeterminism,
} from '@/game/balance/authorityCohort';
import {
  type AuthorityCohortMatrixDefinition,
  createAuthorityCohortMatrix,
} from '@/game/balance/authorityCohortMatrix';
import { survivalGreedyPolicy } from '@/game/balance/balancePolicy';

async function resolveCurrentEdgeAuthority(): Promise<AuthorityCohortRuntime> {
  const resolverUrl = pathToFileURL(
    resolve(process.cwd(), 'supabase/functions/verify-run/authority-version-resolver.generated.ts'),
  ).href;
  const resolver = (await import(/* @vite-ignore */ resolverUrl)) as {
    resolveAuthorityVerifier(
      engineVersion: string,
      contentHash: string,
    ): Promise<AuthorityCohortRuntime | undefined>;
  };
  const authority = await resolver.resolveAuthorityVerifier(
    AUTHORITY_ENGINE_VERSION,
    AUTHORITY_CONTENT_HASH,
  );
  if (!authority) throw new Error('The current Edge authority verifier is unavailable.');
  return authority;
}

function oneCell(definition: AuthorityCohortMatrixDefinition) {
  return createAuthorityCohortMatrix(definition);
}

const REPRESENTATIVE_CELLS = [
  ...oneCell({
    difficulties: ['easy'],
    teamProfiles: [{ id: 'solo-soraka', team: [{ championId: 'Soraka', statMultiplier: 0.1 }] }],
    masteryProfiles: [{ id: 'none', masterySnapshot: {} }],
    runeProfiles: [{ id: 'none', runeIds: [] }],
    enhancementProfiles: [{ id: 'none', enhancementSnapshot: {} }],
    policies: [survivalGreedyPolicy],
  }),
  ...oneCell({
    difficulties: ['normal'],
    teamProfiles: [{ id: 'duo-garen-lux', team: [{ championId: 'Garen' }, { championId: 'Lux' }] }],
    masteryProfiles: [{ id: 'trained', masterySnapshot: { Garen: 2, Lux: 2 } }],
    runeProfiles: [{ id: 'electrocute', runeIds: ['electrocute'] }],
    enhancementProfiles: [
      {
        id: 'core',
        enhancementSnapshot: { Garen: { fighter_core_1: 1 }, Lux: { mage_core_1: 1 } },
      },
    ],
    policies: [survivalGreedyPolicy],
  }),
  ...oneCell({
    difficulties: ['hard'],
    teamProfiles: [
      {
        id: 'trio-ashe-malphite-warwick',
        team: [{ championId: 'Ashe' }, { championId: 'Malphite' }, { championId: 'Warwick' }],
      },
    ],
    masteryProfiles: [{ id: 'experienced', masterySnapshot: { Ashe: 3, Malphite: 3, Warwick: 3 } }],
    runeProfiles: [{ id: 'press-the-attack', runeIds: ['press_the_attack'] }],
    enhancementProfiles: [
      {
        id: 'core',
        enhancementSnapshot: {
          Ashe: { marksman_core_1: 1 },
          Malphite: { tank_core_1: 1 },
          Warwick: { fighter_core_1: 1 },
        },
      },
    ],
    policies: [survivalGreedyPolicy],
  }),
];

const PAIRED_SEEDS = [0, 17] as const;

describe('authority cohort determinism gate', () => {
  it('replays a representative stratified matrix identically in source and Edge', async () => {
    const sourceAuthority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
    if (!sourceAuthority) throw new Error('The current source authority verifier is unavailable.');
    const edgeAuthority = await resolveCurrentEdgeAuthority();

    const result = gateAuthorityCohortDeterminism({
      sourceAuthority,
      edgeAuthority,
      cells: REPRESENTATIVE_CELLS,
      seeds: PAIRED_SEEDS,
    });

    expect(result.cohorts).toHaveLength(3);
    expect(result.cohorts.map((cohort) => cohort.stratum.difficulty)).toEqual([
      'easy',
      'normal',
      'hard',
    ]);
    expect(result.cohorts.map((cohort) => cohort.stratum.team.size)).toEqual([1, 2, 3]);
    for (const cohort of result.cohorts) {
      expect(cohort.runs.map((run) => run.seed)).toEqual(PAIRED_SEEDS);
      expect(cohort.runs.every((run) => run.result.snapshot.terminal)).toBe(true);
    }
  }, 30_000);
});
