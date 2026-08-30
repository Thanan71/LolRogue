import type { BalancePolicy } from './balancePolicy';
import { survivalGreedyPolicy } from './balancePolicy';
import type { AuthorityCohortCell } from './authorityCohortMatrix';
import { createAuthorityCohortMatrix } from './authorityCohortMatrix';

export type AuthorityCohortExecutionProfileName = 'pr' | 'nightly' | 'release';

export interface AuthorityCohortExecutionProfile {
  readonly seedCount: number;
}

export const AUTHORITY_COHORT_EXECUTION_PROFILES = Object.freeze({
  pr: Object.freeze({ seedCount: 30 }),
  nightly: Object.freeze({ seedCount: 500 }),
  release: Object.freeze({ seedCount: 1_000 }),
}) satisfies Readonly<Record<AuthorityCohortExecutionProfileName, AuthorityCohortExecutionProfile>>;

const SEED_STEP = 0x9e3779b1;

export const AUTHORITY_COHORT_SENTINEL_CHAMPION_IDS = Object.freeze([
  'Annie',
  'Ashe',
  'Darius',
  'Garen',
  'Jinx',
  'Leona',
  'Lux',
  'Malphite',
  'Soraka',
  'Warwick',
] as const);

/** Stable paired seeds: changing the execution volume only appends observations. */
export function createAuthorityCohortSeeds(seedCount: number): readonly number[] {
  if (!Number.isSafeInteger(seedCount) || seedCount < 1) {
    throw new RangeError('Authority cohort seed count must be a positive safe integer.');
  }
  return Array.from({ length: seedCount }, (_, index) => Math.imul(index + 1, SEED_STEP) >>> 0);
}

interface SentinelProfile {
  readonly id: string;
  readonly team: ReadonlyArray<{ readonly championId: string }>;
  readonly masterySnapshot?: Readonly<Record<string, number>>;
  readonly runeIds?: readonly string[];
  readonly enhancementSnapshot?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

const SENTINEL_PROFILES = Object.freeze([
  ...AUTHORITY_COHORT_SENTINEL_CHAMPION_IDS.map((championId) => ({
    id: `solo-${championId.toLowerCase()}`,
    team: [{ championId }],
  })),
  {
    id: 'duo-fresh',
    team: [{ championId: 'Garen' }, { championId: 'Ashe' }],
  },
  {
    id: 'trio-fresh',
    team: [{ championId: 'Garen' }, { championId: 'Ashe' }, { championId: 'Soraka' }],
  },
  {
    id: 'duo-mastery',
    team: [{ championId: 'Garen' }, { championId: 'Ashe' }],
    masterySnapshot: { Garen: 4, Ashe: 4 },
  },
  {
    id: 'duo-runes',
    team: [{ championId: 'Garen' }, { championId: 'Ashe' }],
    runeIds: ['press_the_attack'],
  },
  {
    id: 'duo-enhancements',
    team: [{ championId: 'Garen' }, { championId: 'Ashe' }],
    enhancementSnapshot: { Garen: { fighter_core_1: 1 }, Ashe: { marksman_core_1: 1 } },
  },
] satisfies readonly SentinelProfile[]);

/**
 * Keeps every comparison cell explicit while avoiding a cartesian product that would
 * hide team-size and meta effects inside one aggregate. Every profile is paired across
 * Easy, Normal and Hard with the same seed sequence.
 */
export function createAuthorityCohortExecutionCells(
  policies: readonly BalancePolicy[] = [survivalGreedyPolicy],
): readonly AuthorityCohortCell[] {
  return SENTINEL_PROFILES.flatMap((profile) =>
    createAuthorityCohortMatrix({
      difficulties: ['easy', 'normal', 'hard'],
      teamProfiles: [{ id: profile.id, team: profile.team }],
      masteryProfiles: [
        {
          id: profile.masterySnapshot ? 'maxed' : 'none',
          masterySnapshot: profile.masterySnapshot ?? {},
        },
      ],
      runeProfiles: [
        {
          id: profile.runeIds ? 'keystone' : 'none',
          runeIds: profile.runeIds ?? [],
        },
      ],
      enhancementProfiles: [
        {
          id: profile.enhancementSnapshot ? 'unlocked' : 'none',
          enhancementSnapshot: profile.enhancementSnapshot ?? {},
        },
      ],
      policies,
    }),
  );
}
