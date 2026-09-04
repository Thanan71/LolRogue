import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import type { BattleSideMetrics } from '@/game/battle/types';
import { AugmentTier, ItemRarity } from '@/types/inventory';
import { BIOMES, type Biome } from '@/types/run';
import type {
  AuthorityCohortRecruitmentObservation,
  AuthorityCohortResult,
  AuthorityCohortShopOfferObservation,
} from './authorityCohort';

export interface AuthorityCohortPercentiles {
  readonly p10: number;
  readonly p50: number;
  readonly p90: number;
}

export interface AuthorityCohortNumericSummary extends AuthorityCohortPercentiles {
  readonly samples: number;
  readonly total: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface AuthorityCohortWilsonInterval {
  readonly confidence: 0.95;
  readonly lower: number;
  readonly upper: number;
}

export interface AuthorityCohortOfferReport {
  readonly total: number;
  readonly affordable: number;
  readonly affordableRate: number;
  readonly legal: number;
  readonly legalRate: number;
}

export interface AuthorityCohortCombatSideReport extends BattleSideMetrics {
  readonly actionsSuppressed: number;
  readonly hpDamagePerRound: number;
  readonly shieldDamagePerRound: number;
  readonly healingPerRound: number;
  readonly shieldingAbsorbedPerRound: number;
  readonly manaSpentPerRound: number;
}

export interface AuthorityCohortReport {
  readonly authority: AuthorityCohortResult['authority'];
  readonly policy: AuthorityCohortResult['policy'];
  readonly scenarioId: string;
  readonly stratum: AuthorityCohortResult['stratum'];
  readonly sampleSize: number;
  readonly outcome: {
    readonly wins: number;
    readonly defeats: number;
    readonly draws: number;
    readonly winRate: number;
    readonly wilson95: AuthorityCohortWilsonInterval;
  };
  readonly progression: {
    readonly waves: AuthorityCohortPercentiles;
    readonly biomes: AuthorityCohortPercentiles;
    /** Total combat rounds per run. */
    readonly rounds: AuthorityCohortPercentiles;
  };
  readonly deaths: {
    readonly total: number;
    readonly unattributed: number;
    readonly byLocation: ReadonlyArray<{
      readonly biome: Biome;
      readonly encounterId: string;
      readonly count: number;
      readonly share: number;
    }>;
  };
  readonly resources: {
    readonly hp: {
      readonly samples: number;
      readonly initialMeanRatio: number;
      readonly finalMeanRatio: number;
    };
    readonly mp: {
      readonly samples: number;
      readonly initialMeanRatio: number;
      readonly finalMeanRatio: number;
    };
  };
  readonly combat: {
    readonly encounters: number;
    readonly rounds: number;
    readonly bySide: {
      readonly player: AuthorityCohortCombatSideReport;
      readonly enemy: AuthorityCohortCombatSideReport;
    };
  };
  readonly economy: {
    readonly goldEarned: AuthorityCohortNumericSummary;
    readonly goldSpent: AuthorityCohortNumericSummary;
    readonly finalGold: AuthorityCohortNumericSummary;
  };
  readonly shops: {
    readonly visits: number;
    readonly goldOnEntry: AuthorityCohortNumericSummary;
    readonly visitsWithAnyAffordableOffer: number;
    readonly visitsWithAnyAffordableOfferRate: number;
    readonly allOffers: AuthorityCohortOfferReport;
    readonly itemOffers: AuthorityCohortOfferReport;
    readonly recruitOffers: AuthorityCohortOfferReport;
  };
  readonly purchases: {
    readonly commands: number;
    readonly completed: number;
    readonly goldSpent: number;
    readonly byItem: ReadonlyArray<{
      readonly itemId: string;
      readonly commands: number;
      readonly completed: number;
      readonly goldSpent: number;
    }>;
  };
  readonly recruitments: {
    /** Explicit shop/recruit encounter commands; event recruits are reported separately. */
    readonly commands: number;
    readonly successes: number;
    readonly eventRecruits: number;
    readonly goldSpent: number;
    readonly bySource: Record<
      AuthorityCohortRecruitmentObservation['source'],
      { readonly observations: number; readonly successes: number; readonly goldSpent: number }
    >;
    readonly byChampion: ReadonlyArray<{
      readonly championId: string;
      readonly observations: number;
      readonly successes: number;
      readonly goldSpent: number;
    }>;
  };
  readonly drops: {
    readonly total: number;
    readonly unknownItems: number;
    readonly blockedByCapacity: number;
    readonly byRarity: Record<ItemRarity, number>;
    readonly byTier: Record<1 | 2 | 3, number>;
  };
  readonly augments: {
    readonly choices: number;
    readonly unknownChoices: number;
    readonly byTier: Record<AugmentTier, number>;
    readonly byId: ReadonlyArray<{ readonly augmentId: string; readonly count: number }>;
  };
}

const WILSON_Z_95 = 1.959963984540054;

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
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

export function calculateAuthorityCohortPercentiles(
  values: readonly number[],
): AuthorityCohortPercentiles {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new TypeError('Authority cohort percentiles require finite values.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
  };
}

function numericSummary(values: readonly number[]): AuthorityCohortNumericSummary {
  const percentiles = calculateAuthorityCohortPercentiles(values);
  return {
    samples: values.length,
    total: sum(values),
    mean: mean(values),
    min: values.length === 0 ? 0 : Math.min(...values),
    max: values.length === 0 ? 0 : Math.max(...values),
    ...percentiles,
  };
}

export function calculateWilsonInterval95(
  successes: number,
  samples: number,
): AuthorityCohortWilsonInterval {
  if (
    !Number.isSafeInteger(successes) ||
    !Number.isSafeInteger(samples) ||
    samples < 0 ||
    successes < 0 ||
    successes > samples
  ) {
    throw new RangeError('Wilson interval requires 0 <= successes <= samples.');
  }
  if (samples === 0) return { confidence: 0.95, lower: 0, upper: 1 };
  const probability = successes / samples;
  const zSquared = WILSON_Z_95 ** 2;
  const denominator = 1 + zSquared / samples;
  const center = (probability + zSquared / (2 * samples)) / denominator;
  const margin =
    (WILSON_Z_95 *
      Math.sqrt((probability * (1 - probability)) / samples + zSquared / (4 * samples ** 2))) /
    denominator;
  return {
    confidence: 0.95,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

function emptySideMetrics(): BattleSideMetrics {
  return {
    hpDamageDealt: 0,
    shieldDamageDealt: 0,
    healingDone: 0,
    overhealing: 0,
    shieldingDone: 0,
    shieldingAbsorbed: 0,
    manaSpent: 0,
    crowdControlApplications: 0,
    crowdControlDuration: 0,
    actionsLost: 0,
  };
}

function addSideMetrics(target: BattleSideMetrics, source: BattleSideMetrics): void {
  target.hpDamageDealt += source.hpDamageDealt;
  target.shieldDamageDealt += source.shieldDamageDealt;
  target.healingDone += source.healingDone;
  target.overhealing += source.overhealing;
  target.shieldingDone += source.shieldingDone;
  target.shieldingAbsorbed += source.shieldingAbsorbed;
  target.manaSpent += source.manaSpent;
  target.crowdControlApplications += source.crowdControlApplications;
  target.crowdControlDuration += source.crowdControlDuration;
  target.actionsLost += source.actionsLost;
}

function finishSideMetrics(
  metrics: BattleSideMetrics,
  actionsSuppressed: number,
  rounds: number,
): AuthorityCohortCombatSideReport {
  const divisor = rounds > 0 ? rounds : 1;
  return {
    ...metrics,
    actionsSuppressed,
    hpDamagePerRound: metrics.hpDamageDealt / divisor,
    shieldDamagePerRound: metrics.shieldDamageDealt / divisor,
    healingPerRound: metrics.healingDone / divisor,
    shieldingAbsorbedPerRound: metrics.shieldingAbsorbed / divisor,
    manaSpentPerRound: metrics.manaSpent / divisor,
  };
}

function offerReport(
  offers: readonly AuthorityCohortShopOfferObservation[],
): AuthorityCohortOfferReport {
  const affordable = offers.filter((offer) => offer.affordable).length;
  const legal = offers.filter((offer) => offer.legal).length;
  return {
    total: offers.length,
    affordable,
    affordableRate: offers.length === 0 ? 0 : affordable / offers.length,
    legal,
    legalRate: offers.length === 0 ? 0 : legal / offers.length,
  };
}

function createRarityCounts(): Record<ItemRarity, number> {
  return {
    [ItemRarity.Common]: 0,
    [ItemRarity.Uncommon]: 0,
    [ItemRarity.Rare]: 0,
    [ItemRarity.Epic]: 0,
    [ItemRarity.Legendary]: 0,
  };
}

function createAugmentTierCounts(): Record<AugmentTier, number> {
  return {
    [AugmentTier.Silver]: 0,
    [AugmentTier.Gold]: 0,
    [AugmentTier.Prismatic]: 0,
  };
}

function locationSort(
  left: { biome: Biome; encounterId: string },
  right: { biome: Biome; encounterId: string },
): number {
  return (
    BIOMES.indexOf(left.biome) - BIOMES.indexOf(right.biome) ||
    left.encounterId.localeCompare(right.encounterId)
  );
}

/** Aggregates one already-stratified cohort without replaying or mutating its traces. */
export function createAuthorityCohortReport(cohort: AuthorityCohortResult): AuthorityCohortReport {
  if (cohort.runs.length === 0) {
    throw new RangeError('An authority cohort report requires at least one run.');
  }

  const wins = cohort.runs.filter((run) => run.result.snapshot.won).length;
  const draws = cohort.runs.filter((run) => run.result.snapshot.endReason === 'draw').length;
  const defeats = cohort.runs.length - wins - draws;
  const roundsPerRun = cohort.runs.map((run) =>
    sum(run.result.combatSummaries.map((summary) => summary.rounds)),
  );
  const totalRounds = sum(roundsPerRun);
  const playerMetrics = emptySideMetrics();
  const enemyMetrics = emptySideMetrics();
  let encounters = 0;
  let hpInitialRatio = 0;
  let hpFinalRatio = 0;
  let hpSamples = 0;
  let mpInitialRatio = 0;
  let mpFinalRatio = 0;
  let mpSamples = 0;

  const deathLocations = new Map<string, { biome: Biome; encounterId: string; count: number }>();
  let unattributedDeaths = 0;
  for (const run of cohort.runs) {
    for (const summary of run.result.combatSummaries) {
      encounters++;
      addSideMetrics(playerMetrics, summary.metrics.bySide.player);
      addSideMetrics(enemyMetrics, summary.metrics.bySide.enemy);
      const finalById = new Map(
        summary.playerTeam.final.map((member) => [member.combatantId, member]),
      );
      for (const initial of summary.playerTeam.initial) {
        const final = finalById.get(initial.combatantId);
        if (!final) continue;
        if (initial.maxHp > 0 && final.maxHp > 0) {
          hpInitialRatio += initial.currentHp / initial.maxHp;
          hpFinalRatio += final.currentHp / final.maxHp;
          hpSamples++;
        }
        if (initial.maxMp > 0 && final.maxMp > 0) {
          mpInitialRatio += initial.currentMp / initial.maxMp;
          mpFinalRatio += final.currentMp / final.maxMp;
          mpSamples++;
        }
      }
    }

    if (run.result.snapshot.endReason === 'defeat') {
      const terminalCombat = [...run.result.combatSummaries]
        .reverse()
        .find((summary) => summary.winner === 'enemy');
      if (!terminalCombat) {
        unattributedDeaths++;
      } else {
        const key = `${terminalCombat.biome}\u0000${terminalCombat.encounterId}`;
        const existing = deathLocations.get(key);
        if (existing) existing.count++;
        else {
          deathLocations.set(key, {
            biome: terminalCombat.biome,
            encounterId: terminalCombat.encounterId,
            count: 1,
          });
        }
      }
    }
  }
  const totalDeaths = defeats;

  const shopVisits = cohort.runs.flatMap((run) => run.observations.shopVisits);
  const itemOffers = shopVisits.flatMap((visit) => visit.itemOffers);
  const recruitOffers = shopVisits.flatMap((visit) => visit.recruitOffers);
  const allOffers = [...itemOffers, ...recruitOffers];
  const visitsWithAnyAffordableOffer = shopVisits.filter((visit) =>
    [...visit.itemOffers, ...visit.recruitOffers].some((offer) => offer.affordable),
  ).length;

  const purchases = cohort.runs.flatMap((run) => run.observations.purchases);
  const purchasesByItem = new Map<
    string,
    { itemId: string; commands: number; completed: number; goldSpent: number }
  >();
  for (const purchase of purchases) {
    const row = purchasesByItem.get(purchase.itemId) ?? {
      itemId: purchase.itemId,
      commands: 0,
      completed: 0,
      goldSpent: 0,
    };
    row.commands++;
    if (purchase.completed) row.completed++;
    row.goldSpent += purchase.goldSpent;
    purchasesByItem.set(purchase.itemId, row);
  }

  const recruitments = cohort.runs.flatMap((run) => run.observations.recruitments);
  const recruitmentSources: AuthorityCohortReport['recruitments']['bySource'] = {
    shop: { observations: 0, successes: 0, goldSpent: 0 },
    encounter: { observations: 0, successes: 0, goldSpent: 0 },
    event: { observations: 0, successes: 0, goldSpent: 0 },
  };
  const recruitmentsByChampion = new Map<
    string,
    { championId: string; observations: number; successes: number; goldSpent: number }
  >();
  for (const recruitment of recruitments) {
    const source = recruitmentSources[recruitment.source];
    recruitmentSources[recruitment.source] = {
      observations: source.observations + 1,
      successes: source.successes + Number(recruitment.succeeded),
      goldSpent: source.goldSpent + recruitment.goldSpent,
    };
    const champion = recruitmentsByChampion.get(recruitment.championId) ?? {
      championId: recruitment.championId,
      observations: 0,
      successes: 0,
      goldSpent: 0,
    };
    champion.observations++;
    if (recruitment.succeeded) champion.successes++;
    champion.goldSpent += recruitment.goldSpent;
    recruitmentsByChampion.set(recruitment.championId, champion);
  }

  const rarityCounts = createRarityCounts();
  const itemTierCounts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  let dropCount = 0;
  let unknownItems = 0;
  for (const run of cohort.runs) {
    for (const event of run.result.snapshot.ledger.items) {
      if (event.action !== 'found' || event.source !== 'combat') continue;
      dropCount++;
      const item = ITEM_DATABASE[event.itemId];
      if (!item) {
        unknownItems++;
        continue;
      }
      rarityCounts[item.rarity]++;
      itemTierCounts[item.tier]++;
    }
  }

  const augmentTierCounts = createAugmentTierCounts();
  const augmentCounts = new Map<string, number>();
  let augmentChoices = 0;
  let unknownAugmentChoices = 0;
  for (const run of cohort.runs) {
    for (const command of run.trace) {
      if (command.kind !== 'choose_augment') continue;
      augmentChoices++;
      const augmentId = command.payload.augment_id;
      augmentCounts.set(augmentId, (augmentCounts.get(augmentId) ?? 0) + 1);
      const augment = AUGMENT_DATABASE[augmentId];
      if (augment) augmentTierCounts[augment.tier]++;
      else unknownAugmentChoices++;
    }
  }

  return {
    authority: { ...cohort.authority },
    policy: { ...cohort.policy },
    scenarioId: cohort.scenarioId,
    stratum: structuredClone(cohort.stratum),
    sampleSize: cohort.runs.length,
    outcome: {
      wins,
      defeats,
      draws,
      winRate: wins / cohort.runs.length,
      wilson95: calculateWilsonInterval95(wins, cohort.runs.length),
    },
    progression: {
      waves: calculateAuthorityCohortPercentiles(
        cohort.runs.map((run) => run.result.snapshot.totalWavesCompleted),
      ),
      biomes: calculateAuthorityCohortPercentiles(
        cohort.runs.map((run) => run.result.snapshot.biomesVisited.length),
      ),
      rounds: calculateAuthorityCohortPercentiles(roundsPerRun),
    },
    deaths: {
      total: totalDeaths,
      unattributed: unattributedDeaths,
      byLocation: [...deathLocations.values()].sort(locationSort).map((location) => ({
        ...location,
        share: totalDeaths === 0 ? 0 : location.count / totalDeaths,
      })),
    },
    resources: {
      hp: {
        samples: hpSamples,
        initialMeanRatio: hpSamples === 0 ? 0 : hpInitialRatio / hpSamples,
        finalMeanRatio: hpSamples === 0 ? 0 : hpFinalRatio / hpSamples,
      },
      mp: {
        samples: mpSamples,
        initialMeanRatio: mpSamples === 0 ? 0 : mpInitialRatio / mpSamples,
        finalMeanRatio: mpSamples === 0 ? 0 : mpFinalRatio / mpSamples,
      },
    },
    combat: {
      encounters,
      rounds: totalRounds,
      bySide: {
        player: finishSideMetrics(playerMetrics, enemyMetrics.actionsLost, totalRounds),
        enemy: finishSideMetrics(enemyMetrics, playerMetrics.actionsLost, totalRounds),
      },
    },
    economy: {
      goldEarned: numericSummary(cohort.runs.map((run) => run.result.snapshot.ledger.gold.earned)),
      goldSpent: numericSummary(cohort.runs.map((run) => run.result.snapshot.ledger.gold.spent)),
      finalGold: numericSummary(cohort.runs.map((run) => run.result.snapshot.gold)),
    },
    shops: {
      visits: shopVisits.length,
      goldOnEntry: numericSummary(shopVisits.map((visit) => visit.goldOnEntry)),
      visitsWithAnyAffordableOffer,
      visitsWithAnyAffordableOfferRate:
        shopVisits.length === 0 ? 0 : visitsWithAnyAffordableOffer / shopVisits.length,
      allOffers: offerReport(allOffers),
      itemOffers: offerReport(itemOffers),
      recruitOffers: offerReport(recruitOffers),
    },
    purchases: {
      commands: purchases.length,
      completed: purchases.filter((purchase) => purchase.completed).length,
      goldSpent: sum(purchases.map((purchase) => purchase.goldSpent)),
      byItem: [...purchasesByItem.values()].sort((left, right) =>
        left.itemId.localeCompare(right.itemId),
      ),
    },
    recruitments: {
      commands: recruitments.filter((recruitment) => recruitment.source !== 'event').length,
      successes: recruitments.filter(
        (recruitment) => recruitment.source !== 'event' && recruitment.succeeded,
      ).length,
      eventRecruits: recruitments.filter((recruitment) => recruitment.source === 'event').length,
      goldSpent: sum(recruitments.map((recruitment) => recruitment.goldSpent)),
      bySource: recruitmentSources,
      byChampion: [...recruitmentsByChampion.values()].sort((left, right) =>
        left.championId.localeCompare(right.championId),
      ),
    },
    drops: {
      total: dropCount,
      unknownItems,
      blockedByCapacity: sum(
        cohort.runs.flatMap((run) =>
          run.result.combatSummaries.map((summary) =>
            Number(summary.reward?.dropBlockedByCapacity === true),
          ),
        ),
      ),
      byRarity: rarityCounts,
      byTier: itemTierCounts,
    },
    augments: {
      choices: augmentChoices,
      unknownChoices: unknownAugmentChoices,
      byTier: augmentTierCounts,
      byId: [...augmentCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([augmentId, count]) => ({ augmentId, count })),
    },
  };
}
