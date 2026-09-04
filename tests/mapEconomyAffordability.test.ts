import { expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import { simulateAuthorityCohort } from '@/game/balance/authorityCohort';
import { createEarlyTopCohortCells } from '@/game/balance/earlyTopCohort';
import { createAuthorityCohortSeeds } from '@/game/balance/authorityCohortProfiles';

const AFFORDABILITY_SEEDS = createAuthorityCohortSeeds(40);

it('gives the median player an affordable choice at the guaranteed Jungle shop', () => {
  const authority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
  expect(authority).toBeDefined();
  if (!authority) throw new Error('Current authority verifier is unavailable.');

  const cohorts = createEarlyTopCohortCells().map((cell) =>
    simulateAuthorityCohort({
      authority,
      policy: cell.policy,
      scenario: cell.scenario,
      seeds: AFFORDABILITY_SEEDS,
    }),
  );

  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const firstJungleShopVisits = cohorts
      .filter((cohort) => cohort.stratum.difficulty === difficulty)
      .flatMap((cohort) =>
        cohort.runs.flatMap((run) => {
          const visit = run.observations.shopVisits.find(
            (observation) => observation.biome === 'jungle',
          );
          return visit ? [visit] : [];
        }),
      );

    expect(firstJungleShopVisits.length).toBeGreaterThanOrEqual(100);
    expect(
      firstJungleShopVisits.every((visit) =>
        visit.itemOffers.some((offer) => offer.id === 'health_potion'),
      ),
    ).toBe(true);

    const affordableVisits = firstJungleShopVisits.filter((visit) =>
      [...visit.itemOffers, ...visit.recruitOffers].some(
        (offer) => offer.legal && offer.affordable,
      ),
    );
    expect(affordableVisits.length / firstJungleShopVisits.length).toBeGreaterThanOrEqual(0.5);

    const entryGold = firstJungleShopVisits.map((visit) => visit.goldOnEntry).sort((a, b) => a - b);
    expect(entryGold[Math.floor(entryGold.length / 2)]).toBeGreaterThanOrEqual(50);
  }
}, 180_000);
