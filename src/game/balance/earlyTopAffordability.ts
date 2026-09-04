import type { AuthorityDifficulty } from '@/game/authority/types';
import type {
  AuthorityCohortPurchaseObservation,
  AuthorityCohortRecruitmentObservation,
  AuthorityCohortRuntime,
  AuthorityCohortShopOfferObservation,
} from './authorityCohort';
import { simulateAuthorityCohort } from './authorityCohort';
import type { AuthorityCohortNumericSummary } from './authorityCohortReport';
import {
  createEarlyTopCohortCells,
  EARLY_TOP_COHORT_DIFFICULTIES,
  EARLY_TOP_COHORT_SEEDS,
  EARLY_TOP_COHORT_STARTER_IDS,
  type EarlyTopStarterId,
} from './earlyTopCohort';

export const EARLY_TOP_AFFORDABILITY_SCHEMA_VERSION = 2 as const;

export interface EarlyTopShopVisitEvidence {
  readonly scenarioId: string;
  readonly difficulty: AuthorityDifficulty;
  readonly starterId: EarlyTopStarterId;
  readonly seed: number;
  readonly runWon: boolean;
  readonly biome: 'top_lane';
  readonly commandIndex: number;
  readonly nodeId: string;
  readonly encounterId: string;
  readonly goldOnEntry: number;
  readonly itemOffers: readonly AuthorityCohortShopOfferObservation[];
  readonly recruitOffers: readonly AuthorityCohortShopOfferObservation[];
  readonly transactions: {
    readonly purchases: readonly AuthorityCohortPurchaseObservation[];
    readonly recruitments: readonly AuthorityCohortRecruitmentObservation[];
  };
}

export interface EarlyTopAffordabilityDifficultyReport {
  readonly difficulty: AuthorityDifficulty;
  readonly sampleSize: number;
  /** Context only: the full-run outcome for the paired runs measured at Top. */
  readonly runWins: number;
  readonly runWinRate: number;
  readonly topCombatGoldEarned: AuthorityCohortNumericSummary;
  readonly shops: {
    readonly runsWithVisit: number;
    readonly visits: number;
    readonly visitsPerRun: number;
    readonly goldOnEntry: AuthorityCohortNumericSummary;
    readonly visitsWithAnyAffordableOffer: number;
    readonly visitsWithAnyAffordableOfferRate: number;
    readonly offers: {
      readonly total: number;
      readonly legal: number;
      readonly affordable: number;
      readonly affordableRate: number;
    };
  };
  readonly transactions: {
    readonly purchases: {
      readonly commands: number;
      readonly completed: number;
      readonly goldSpent: number;
    };
    readonly recruitments: {
      readonly commands: number;
      readonly successes: number;
      readonly goldSpent: number;
    };
  };
}

export interface EarlyTopAffordabilityReport {
  readonly schemaVersion: typeof EARLY_TOP_AFFORDABILITY_SCHEMA_VERSION;
  readonly authority: {
    readonly engineVersion: string;
    readonly contentHash: string;
  };
  readonly source: {
    readonly kind: 'early-top-affordability';
    readonly biome: 'top_lane';
    readonly seeds: readonly number[];
    readonly starterIds: readonly EarlyTopStarterId[];
    readonly difficulties: readonly AuthorityDifficulty[];
    readonly cellCount: number;
    readonly runsPerCell: number;
    /** The authority snapshot's `legal` flag already includes `gold >= cost`. */
    readonly legalityIncludesAffordability: true;
    /** No product threshold exists yet, so this report must not invent one. */
    readonly minimumAcceptableRate: null;
  };
  readonly byDifficulty: readonly EarlyTopAffordabilityDifficultyReport[];
  /** Raw Top-only evidence retained so every aggregate is auditable. */
  readonly visits: readonly EarlyTopShopVisitEvidence[];
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function quantile(sorted: readonly number[], probability: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? lower;
  return lower + (upper - lower) * (position - lowerIndex);
}

function numericSummary(values: readonly number[]): AuthorityCohortNumericSummary {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new TypeError('Early Top affordability summaries require finite values.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  const total = sum(sorted);
  return {
    samples: sorted.length,
    total,
    mean: sorted.length === 0 ? 0 : total / sorted.length,
    min: sorted[0] ?? 0,
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

export function measureEarlyTopAffordability(
  authority: AuthorityCohortRuntime,
): EarlyTopAffordabilityReport {
  const cells = createEarlyTopCohortCells();
  const cohorts = cells.map((cell) =>
    simulateAuthorityCohort({
      authority,
      policy: cell.policy,
      scenario: cell.scenario,
      seeds: EARLY_TOP_COHORT_SEEDS,
    }),
  );
  const visits: EarlyTopShopVisitEvidence[] = [];

  for (const cohort of cohorts) {
    const starterId = cohort.stratum.team.composition[0]?.championId;
    if (!EARLY_TOP_COHORT_STARTER_IDS.includes(starterId as EarlyTopStarterId)) {
      throw new Error(`Unexpected early Top starter "${starterId ?? 'missing'}".`);
    }
    for (const run of cohort.runs) {
      for (const visit of run.observations.shopVisits.filter(
        (observation) => observation.biome === 'top_lane',
      )) {
        visits.push({
          scenarioId: cohort.scenarioId,
          difficulty: cohort.stratum.difficulty,
          starterId: starterId as EarlyTopStarterId,
          seed: run.seed,
          runWon: run.result.snapshot.won,
          biome: 'top_lane',
          commandIndex: visit.commandIndex,
          nodeId: visit.nodeId,
          encounterId: visit.encounterId,
          goldOnEntry: visit.goldOnEntry,
          itemOffers: visit.itemOffers,
          recruitOffers: visit.recruitOffers,
          transactions: {
            purchases: run.observations.purchases.filter(
              (purchase) => purchase.nodeId === visit.nodeId,
            ),
            recruitments: run.observations.recruitments.filter(
              (recruitment) => recruitment.source === 'shop' && recruitment.nodeId === visit.nodeId,
            ),
          },
        });
      }
    }
  }

  return {
    schemaVersion: EARLY_TOP_AFFORDABILITY_SCHEMA_VERSION,
    authority: {
      engineVersion: authority.engineVersion,
      contentHash: authority.contentHash,
    },
    source: {
      kind: 'early-top-affordability',
      biome: 'top_lane',
      seeds: EARLY_TOP_COHORT_SEEDS,
      starterIds: EARLY_TOP_COHORT_STARTER_IDS,
      difficulties: EARLY_TOP_COHORT_DIFFICULTIES,
      cellCount: cells.length,
      runsPerCell: EARLY_TOP_COHORT_SEEDS.length,
      legalityIncludesAffordability: true,
      minimumAcceptableRate: null,
    },
    byDifficulty: EARLY_TOP_COHORT_DIFFICULTIES.map((difficulty) => {
      const selectedCohorts = cohorts.filter((cohort) => cohort.stratum.difficulty === difficulty);
      const selectedRuns = selectedCohorts.flatMap((cohort) => cohort.runs);
      const selectedVisits = visits.filter((visit) => visit.difficulty === difficulty);
      const offers = selectedVisits.flatMap((visit) => [
        ...visit.itemOffers,
        ...visit.recruitOffers,
      ]);
      const purchases = selectedVisits.flatMap((visit) => visit.transactions.purchases);
      const recruitments = selectedVisits.flatMap((visit) => visit.transactions.recruitments);
      const sampleSize = selectedRuns.length;
      const runWins = selectedRuns.filter((run) => run.result.snapshot.won).length;
      const visitsWithAnyAffordableOffer = selectedVisits.filter((visit) =>
        [...visit.itemOffers, ...visit.recruitOffers].some((offer) => offer.affordable),
      ).length;
      const affordableOffers = offers.filter((offer) => offer.affordable).length;

      return {
        difficulty,
        sampleSize,
        runWins,
        runWinRate: sampleSize === 0 ? 0 : runWins / sampleSize,
        topCombatGoldEarned: numericSummary(
          selectedRuns.map((run) =>
            sum(
              run.result.combatSummaries
                .filter((combat) => combat.biome === 'top_lane')
                .map((combat) => combat.reward?.gold ?? 0),
            ),
          ),
        ),
        shops: {
          runsWithVisit: new Set(selectedVisits.map((visit) => `${visit.scenarioId}:${visit.seed}`))
            .size,
          visits: selectedVisits.length,
          visitsPerRun: sampleSize === 0 ? 0 : selectedVisits.length / sampleSize,
          goldOnEntry: numericSummary(selectedVisits.map((visit) => visit.goldOnEntry)),
          visitsWithAnyAffordableOffer,
          visitsWithAnyAffordableOfferRate:
            selectedVisits.length === 0 ? 0 : visitsWithAnyAffordableOffer / selectedVisits.length,
          offers: {
            total: offers.length,
            legal: offers.filter((offer) => offer.legal).length,
            affordable: affordableOffers,
            affordableRate: offers.length === 0 ? 0 : affordableOffers / offers.length,
          },
        },
        transactions: {
          purchases: {
            commands: purchases.length,
            completed: purchases.filter((purchase) => purchase.completed).length,
            goldSpent: sum(purchases.map((purchase) => purchase.goldSpent)),
          },
          recruitments: {
            commands: recruitments.length,
            successes: recruitments.filter((recruitment) => recruitment.succeeded).length,
            goldSpent: sum(recruitments.map((recruitment) => recruitment.goldSpent)),
          },
        },
      };
    }),
    visits,
  };
}
