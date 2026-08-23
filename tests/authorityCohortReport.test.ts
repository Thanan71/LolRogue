import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  type AuthorityCombatSummary,
  type AuthorityRunCommand,
  getAuthorityVerifier,
} from '@/game/authority';
import {
  type AuthorityCohortResult,
  type AuthorityCohortRunObservations,
  simulateAuthorityCohort,
} from '@/game/balance/authorityCohort';
import {
  calculateAuthorityCohortPercentiles,
  calculateWilsonInterval95,
  createAuthorityCohortReport,
} from '@/game/balance/authorityCohortReport';
import { type BalanceScenario, survivalGreedyPolicy } from '@/game/balance/balancePolicy';
import { AugmentTier, ItemRarity } from '@/types/inventory';
import { BIOMES, type Biome, type RunItemLedgerEvent } from '@/types/run';

const SCENARIO: BalanceScenario = {
  id: 'authority-cohort-report-fixture',
  difficulty: 'hard',
  team: [{ championId: 'Soraka', statMultiplier: 0.1 }],
  runeIds: [],
  masterySnapshot: {},
  enhancementSnapshot: {},
};

const authority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
if (!authority) throw new Error('The current source authority verifier is unavailable.');
const BASE_COHORT = simulateAuthorityCohort({
  authority,
  policy: survivalGreedyPolicy,
  scenario: SCENARIO,
  seeds: [0],
});
const BASE_RUN = BASE_COHORT.runs[0];
const BASE_COMBAT = BASE_RUN?.result.combatSummaries[0];
if (!BASE_RUN || !BASE_COMBAT) throw new Error('The report fixture requires one combat.');

function sideMetrics(scale: number, enemy: boolean) {
  const factor = enemy ? 2 : 1;
  return {
    hpDamageDealt: 10 * factor * scale,
    shieldDamageDealt: 1 * factor * scale,
    healingDone: 2 * factor * scale,
    overhealing: 3 * factor * scale,
    shieldingDone: 4 * factor * scale,
    shieldingAbsorbed: 8 * factor * scale,
    manaSpent: 9 * factor * scale,
    crowdControlApplications: 5 * factor * scale,
    crowdControlDuration: 6 * factor * scale,
    actionsLost: 7 * factor * scale,
  };
}

function combatSummary(input: {
  index: number;
  biome: Biome;
  encounterId: string;
  winner: AuthorityCombatSummary['winner'];
  rounds: number;
  initialHpRatio: number;
  finalHpRatio: number;
  initialMpRatio: number;
  finalMpRatio: number;
  dropBlockedByCapacity?: boolean;
}): AuthorityCombatSummary {
  const combatantId = `player-${input.index}`;
  return {
    ...structuredClone(BASE_COMBAT),
    combatIndex: input.index,
    commandIndex: input.index,
    nodeId: `combat-${input.index}`,
    encounterId: input.encounterId,
    biome: input.biome,
    biomeIndex: BIOMES.indexOf(input.biome),
    wave: input.index + 1,
    winner: input.winner,
    rounds: input.rounds,
    metrics: {
      rounds: input.rounds,
      bySide: {
        player: sideMetrics(input.index + 1, false),
        enemy: sideMetrics(input.index + 1, true),
      },
    },
    playerTeam: {
      initial: [
        {
          combatantId,
          championId: 'Soraka',
          currentHp: 100 * input.initialHpRatio,
          maxHp: 100,
          currentMp: 100 * input.initialMpRatio,
          maxMp: 100,
          defeated: false,
        },
      ],
      final: [
        {
          combatantId,
          championId: 'Soraka',
          currentHp: 100 * input.finalHpRatio,
          maxHp: 100,
          currentMp: 100 * input.finalMpRatio,
          maxMp: 100,
          defeated: input.winner !== 'player',
        },
      ],
    },
    reward: {
      gold: 0,
      xpPerChampion: 0,
      itemDropChance: 0,
      droppedItemId: null,
      dropBlockedByCapacity: input.dropBlockedByCapacity ?? false,
      droppedItemInstanceId: null,
    },
  };
}

function itemEvent(index: number, itemId: string): RunItemLedgerEvent {
  return {
    sequence: index,
    action: 'found',
    source: 'combat',
    itemId,
    instanceId: `item-${index}`,
    championId: null,
    goldAmount: 0,
    nodeId: `combat-${index}`,
    wave: index,
  };
}

function chooseAugment(augmentId: string): AuthorityRunCommand {
  return {
    sequence: 1,
    kind: 'choose_augment',
    payload: { augment_id: augmentId },
  };
}

function completeCohortFixture(): AuthorityCohortResult {
  const specifications = [
    {
      won: true,
      endReason: 'victory' as const,
      waves: 1,
      biomeCount: 1,
      biome: 'top_lane' as const,
      encounterId: 'top-duel',
      combatWinner: 'player' as const,
      rounds: 2,
      hp: [1, 0.5] as const,
      mp: [1, 0.8] as const,
      gold: [10, 2, 8] as const,
      items: [itemEvent(0, 'long_sword')],
      augmentId: 'brute_force',
      observations: {
        shopVisits: [
          {
            commandIndex: 0,
            nodeId: 'shop-0',
            encounterId: 'top-shop',
            biome: 'top_lane' as const,
            goldOnEntry: 10,
            itemOffers: [
              { id: 'long_sword', cost: 2, legal: true, affordable: true },
              { id: 'infinity_edge', cost: 1, legal: false, affordable: false },
            ],
            recruitOffers: [{ id: 'Lux', cost: 20, legal: true, affordable: false }],
          },
        ],
        purchases: [
          {
            commandIndex: 0,
            nodeId: 'shop-0',
            itemId: 'long_sword',
            offeredCost: 2,
            goldSpent: 2,
            completed: true,
          },
        ],
        recruitments: [
          {
            commandIndex: 1,
            nodeId: 'recruit-0',
            encounterId: 'top-recruit',
            championId: 'Lux',
            source: 'encounter' as const,
            offeredCost: 3,
            goldSpent: 3,
            succeeded: true,
          },
        ],
      },
    },
    {
      won: false,
      endReason: 'defeat' as const,
      waves: 2,
      biomeCount: 2,
      biome: 'jungle' as const,
      encounterId: 'jungle-wolves',
      combatWinner: 'enemy' as const,
      rounds: 4,
      hp: [0.8, 0.4] as const,
      mp: [0.75, 0.6] as const,
      gold: [20, 4, 16] as const,
      items: [itemEvent(1, 'infinity_edge')],
      augmentId: 'warlord',
      dropBlockedByCapacity: true,
      observations: {
        shopVisits: [
          {
            commandIndex: 0,
            nodeId: 'shop-1',
            encounterId: 'jungle-shop',
            biome: 'jungle' as const,
            goldOnEntry: 20,
            itemOffers: [{ id: 'long_sword', cost: 30, legal: true, affordable: false }],
            recruitOffers: [{ id: 'Ashe', cost: 15, legal: true, affordable: true }],
          },
        ],
        purchases: [
          {
            commandIndex: 0,
            nodeId: 'shop-1',
            itemId: 'long_sword',
            offeredCost: 30,
            goldSpent: 0,
            completed: false,
          },
        ],
        recruitments: [
          {
            commandIndex: 1,
            nodeId: 'shop-1',
            encounterId: 'jungle-shop',
            championId: 'Ashe',
            source: 'shop' as const,
            offeredCost: 4,
            goldSpent: 4,
            succeeded: true,
          },
        ],
      },
    },
    {
      won: false,
      endReason: 'draw' as const,
      waves: 3,
      biomeCount: 3,
      biome: 'mid_lane' as const,
      encounterId: 'mid-mages',
      combatWinner: 'draw' as const,
      rounds: 6,
      hp: [0.6, 0.3] as const,
      mp: [0.5, 0.4] as const,
      gold: [30, 6, 24] as const,
      items: [
        itemEvent(2, 'unknown_item'),
        { ...itemEvent(3, 'long_sword'), source: 'event' as const },
      ],
      augmentId: 'divine_blessing',
      observations: {
        shopVisits: [],
        purchases: [],
        recruitments: [
          {
            commandIndex: 1,
            nodeId: 'event-2',
            encounterId: 'mid-event',
            championId: 'Jinx',
            source: 'event' as const,
            offeredCost: null,
            goldSpent: 0,
            succeeded: true,
          },
        ],
      },
    },
    {
      won: true,
      endReason: 'victory' as const,
      waves: 4,
      biomeCount: 4,
      biome: 'bot_lane' as const,
      encounterId: 'bot-duo',
      combatWinner: 'player' as const,
      rounds: 8,
      hp: [0.4, 0.2] as const,
      mp: [0.25, 0.2] as const,
      gold: [40, 8, 32] as const,
      items: [],
      augmentId: 'unknown_augment',
      observations: {
        shopVisits: [
          {
            commandIndex: 0,
            nodeId: 'shop-3',
            encounterId: 'bot-shop',
            biome: 'bot_lane' as const,
            goldOnEntry: 40,
            itemOffers: [],
            recruitOffers: [],
          },
        ],
        purchases: [],
        recruitments: [],
      },
    },
  ] satisfies ReadonlyArray<{
    won: boolean;
    endReason: 'victory' | 'defeat' | 'draw';
    waves: number;
    biomeCount: number;
    biome: Biome;
    encounterId: string;
    combatWinner: AuthorityCombatSummary['winner'];
    rounds: number;
    hp: readonly [number, number];
    mp: readonly [number, number];
    gold: readonly [number, number, number];
    items: RunItemLedgerEvent[];
    augmentId: string;
    dropBlockedByCapacity?: boolean;
    observations: AuthorityCohortRunObservations;
  }>;

  return {
    ...BASE_COHORT,
    runs: specifications.map((specification, index) => ({
      ...structuredClone(BASE_RUN),
      seed: index,
      trace: [chooseAugment(specification.augmentId)],
      result: {
        ...structuredClone(BASE_RUN.result),
        commandCount: 1,
        snapshot: {
          ...structuredClone(BASE_RUN.result.snapshot),
          terminal: true,
          won: specification.won,
          endReason: specification.endReason,
          totalWavesCompleted: specification.waves,
          biomesVisited: BIOMES.slice(0, specification.biomeCount),
          gold: specification.gold[2],
          ledger: {
            ...structuredClone(BASE_RUN.result.snapshot.ledger),
            gold: { earned: specification.gold[0], spent: specification.gold[1] },
            items: specification.items,
          },
        },
        combatSummaries: [
          combatSummary({
            index,
            biome: specification.biome,
            encounterId: specification.encounterId,
            winner: specification.combatWinner,
            rounds: specification.rounds,
            initialHpRatio: specification.hp[0],
            finalHpRatio: specification.hp[1],
            initialMpRatio: specification.mp[0],
            finalMpRatio: specification.mp[1],
            dropBlockedByCapacity: specification.dropBlockedByCapacity,
          }),
        ],
      },
      observations: specification.observations,
    })),
  };
}

describe('authority cohort report', () => {
  it('calculates deterministic interpolated percentiles and Wilson 95 % bounds', () => {
    expect(calculateAuthorityCohortPercentiles([4, 1, 3, 2])).toEqual({
      p10: 1.3,
      p50: 2.5,
      p90: 3.7,
    });
    expect(calculateWilsonInterval95(2, 4)).toMatchObject({ confidence: 0.95 });
    expect(calculateWilsonInterval95(2, 4).lower).toBeCloseTo(0.15004, 5);
    expect(calculateWilsonInterval95(2, 4).upper).toBeCloseTo(0.84996, 5);
  });

  it('aggregates progression, combat, resources, economy and run choices by cohort', () => {
    const report = createAuthorityCohortReport(completeCohortFixture());

    expect(report).toMatchObject({
      authority: BASE_COHORT.authority,
      policy: survivalGreedyPolicy.manifest,
      scenarioId: SCENARIO.id,
      stratum: BASE_COHORT.stratum,
      sampleSize: 4,
      outcome: {
        wins: 2,
        defeats: 1,
        draws: 1,
        winRate: 0.5,
      },
      progression: {
        waves: { p10: 1.3, p50: 2.5, p90: 3.7 },
        biomes: { p10: 1.3, p50: 2.5, p90: 3.7 },
        rounds: { p10: 2.6, p50: 5, p90: 7.4 },
      },
      deaths: {
        total: 1,
        unattributed: 0,
        byLocation: [{ biome: 'jungle', encounterId: 'jungle-wolves', count: 1, share: 1 }],
      },
      combat: {
        encounters: 4,
        rounds: 20,
        bySide: {
          player: {
            hpDamageDealt: 100,
            shieldDamageDealt: 10,
            healingDone: 20,
            overhealing: 30,
            shieldingDone: 40,
            shieldingAbsorbed: 80,
            manaSpent: 90,
            crowdControlApplications: 50,
            crowdControlDuration: 60,
            actionsLost: 70,
            actionsSuppressed: 140,
            hpDamagePerRound: 5,
            shieldDamagePerRound: 0.5,
            healingPerRound: 1,
            shieldingAbsorbedPerRound: 4,
            manaSpentPerRound: 4.5,
          },
          enemy: {
            hpDamageDealt: 200,
            shieldDamageDealt: 20,
            healingDone: 40,
            overhealing: 60,
            shieldingDone: 80,
            shieldingAbsorbed: 160,
            manaSpent: 180,
            crowdControlApplications: 100,
            crowdControlDuration: 120,
            actionsLost: 140,
            actionsSuppressed: 70,
            hpDamagePerRound: 10,
            shieldDamagePerRound: 1,
            healingPerRound: 2,
            shieldingAbsorbedPerRound: 8,
            manaSpentPerRound: 9,
          },
        },
      },
    });
    expect(report.outcome.wilson95.lower).toBeCloseTo(0.15004, 5);
    expect(report.outcome.wilson95.upper).toBeCloseTo(0.84996, 5);
    expect(report.resources.hp.samples).toBe(4);
    expect(report.resources.hp.initialMeanRatio).toBeCloseTo(0.7);
    expect(report.resources.hp.finalMeanRatio).toBeCloseTo(0.35);
    expect(report.resources.mp.samples).toBe(4);
    expect(report.resources.mp.initialMeanRatio).toBeCloseTo(0.625);
    expect(report.resources.mp.finalMeanRatio).toBeCloseTo(0.5);
    expect(report.economy).toMatchObject({
      goldEarned: { samples: 4, total: 100, mean: 25, p10: 13, p50: 25, p90: 37 },
      goldSpent: { samples: 4, total: 20, mean: 5, p10: 2.6, p50: 5, p90: 7.4 },
      finalGold: { samples: 4, total: 80, mean: 20, p10: 10.4, p50: 20, p90: 29.6 },
    });
  });

  it('aggregates affordability, transactions, drops and augment choices', () => {
    const report = createAuthorityCohortReport(completeCohortFixture());

    expect(report.shops).toMatchObject({
      visits: 3,
      visitsWithAnyAffordableOffer: 2,
      visitsWithAnyAffordableOfferRate: 2 / 3,
      goldOnEntry: { samples: 3, total: 70, mean: 70 / 3, p10: 12, p50: 20, p90: 36 },
      allOffers: { total: 5, affordable: 2, affordableRate: 0.4, legal: 4, legalRate: 0.8 },
      itemOffers: {
        total: 3,
        affordable: 1,
        affordableRate: 1 / 3,
        legal: 2,
        legalRate: 2 / 3,
      },
      recruitOffers: { total: 2, affordable: 1, affordableRate: 0.5, legal: 2, legalRate: 1 },
    });
    expect(report.purchases).toEqual({
      commands: 2,
      completed: 1,
      goldSpent: 2,
      byItem: [{ itemId: 'long_sword', commands: 2, completed: 1, goldSpent: 2 }],
    });
    expect(report.recruitments).toEqual({
      commands: 2,
      successes: 2,
      eventRecruits: 1,
      goldSpent: 7,
      bySource: {
        shop: { observations: 1, successes: 1, goldSpent: 4 },
        encounter: { observations: 1, successes: 1, goldSpent: 3 },
        event: { observations: 1, successes: 1, goldSpent: 0 },
      },
      byChampion: [
        { championId: 'Ashe', observations: 1, successes: 1, goldSpent: 4 },
        { championId: 'Jinx', observations: 1, successes: 1, goldSpent: 0 },
        { championId: 'Lux', observations: 1, successes: 1, goldSpent: 3 },
      ],
    });
    expect(report.drops).toEqual({
      total: 3,
      unknownItems: 1,
      blockedByCapacity: 1,
      byRarity: {
        [ItemRarity.Common]: 1,
        [ItemRarity.Uncommon]: 0,
        [ItemRarity.Rare]: 0,
        [ItemRarity.Epic]: 0,
        [ItemRarity.Legendary]: 1,
      },
      byTier: { 1: 1, 2: 1, 3: 0 },
    });
    expect(report.augments).toEqual({
      choices: 4,
      unknownChoices: 1,
      byTier: {
        [AugmentTier.Silver]: 1,
        [AugmentTier.Gold]: 1,
        [AugmentTier.Prismatic]: 1,
      },
      byId: [
        { augmentId: 'brute_force', count: 1 },
        { augmentId: 'divine_blessing', count: 1 },
        { augmentId: 'unknown_augment', count: 1 },
        { augmentId: 'warlord', count: 1 },
      ],
    });
  });

  it('rejects empty reports and invalid statistical inputs', () => {
    expect(() => createAuthorityCohortReport({ ...completeCohortFixture(), runs: [] })).toThrow(
      'requires at least one run',
    );
    expect(() => calculateAuthorityCohortPercentiles([1, Number.NaN])).toThrow(
      'require finite values',
    );
    expect(() => calculateWilsonInterval95(2, 1)).toThrow('requires 0 <= successes <= samples');
  });
});
