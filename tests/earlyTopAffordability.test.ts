import { describe, expect, it } from 'vitest';
import { ITEM_DATABASE } from '@/data/items';
import { measureEarlyTopAffordability } from '@/game/balance/earlyTopAffordability';
import { TOP_LANE_ENCOUNTERS } from '@/game/map/encounters';
import { resolveBundledAuthorityVerifier } from './helpers/authorityBundleResolver';

const EARLY_TOP_ENGINE_VERSION = 'run-engine-v18';
const EARLY_TOP_CONTENT_HASH = '9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17';

describe('early Top affordability decision', () => {
  it('locks the P1 component prices and the archived Top rewards', () => {
    expect(ITEM_DATABASE.boots.goldValue).toBe(200);
    expect(ITEM_DATABASE.health_potion.goldValue).toBe(50);
    expect(ITEM_DATABASE.bf_sword.goldValue).toBe(650);
    expect(
      Object.fromEntries(
        TOP_LANE_ENCOUNTERS.map((encounter) => [encounter.id, encounter.goldReward]),
      ),
    ).toEqual({
      top_darius: 25,
      top_garen: 20,
      top_malphite: 30,
      top_warwick: 22,
      top_duo_fighters: 45,
      top_fortified_duel: 48,
    });
  });

  it('reproduces Top-only visits, offers and transactions across all 900 paired runs', async () => {
    const authority = await resolveBundledAuthorityVerifier(
      EARLY_TOP_ENGINE_VERSION,
      EARLY_TOP_CONTENT_HASH,
    );
    expect(authority).toBeDefined();
    const report = measureEarlyTopAffordability(authority!);

    expect(report.authority).toEqual({
      engineVersion: EARLY_TOP_ENGINE_VERSION,
      contentHash: EARLY_TOP_CONTENT_HASH,
    });
    expect(report.source).toMatchObject({
      kind: 'early-top-affordability',
      biome: 'top_lane',
      cellCount: 30,
      runsPerCell: 30,
      legalityIncludesAffordability: true,
      minimumAcceptableRate: null,
    });
    expect(report.visits).toHaveLength(178);
    for (const visit of report.visits) {
      expect(visit.biome).toBe('top_lane');
      expect(visit.nodeId).toMatch(/^node_top_lane_/);
      expect(visit.commandIndex).toBeGreaterThanOrEqual(0);
      for (const transaction of [
        ...visit.transactions.purchases,
        ...visit.transactions.recruitments,
      ]) {
        expect(transaction.nodeId).toBe(visit.nodeId);
        expect(transaction.commandIndex).toBeGreaterThanOrEqual(visit.commandIndex);
      }
    }

    expect(report.byDifficulty).toEqual([
      {
        difficulty: 'easy',
        sampleSize: 300,
        runWins: 84,
        runWinRate: 0.28,
        topCombatGoldEarned: {
          samples: 300,
          total: 23_764,
          mean: 23_764 / 300,
          min: 18,
          p10: 40,
          p50: 77,
          p90: 114.20000000000005,
          max: 150,
        },
        shops: {
          runsWithVisit: 60,
          visits: 60,
          visitsPerRun: 0.2,
          goldOnEntry: {
            samples: 60,
            total: 2_010,
            mean: 33.5,
            min: 18,
            p10: 18,
            p50: 30,
            p90: 63,
            max: 63,
          },
          visitsWithAnyAffordableOffer: 0,
          visitsWithAnyAffordableOfferRate: 0,
          offers: { total: 280, legal: 0, affordable: 0, affordableRate: 0 },
        },
        transactions: {
          purchases: { commands: 0, completed: 0, goldSpent: 0 },
          recruitments: { commands: 0, successes: 0, goldSpent: 0 },
        },
      },
      {
        difficulty: 'normal',
        sampleSize: 300,
        runWins: 50,
        runWinRate: 1 / 6,
        topCombatGoldEarned: {
          samples: 300,
          total: 25_747,
          mean: 25_747 / 300,
          min: 20,
          p10: 44,
          p50: 82,
          p90: 126,
          max: 164,
        },
        shops: {
          runsWithVisit: 60,
          visits: 60,
          visitsPerRun: 0.2,
          goldOnEntry: {
            samples: 60,
            total: 2_210,
            mean: 2_210 / 60,
            min: 20,
            p10: 20,
            p50: 33,
            p90: 69,
            max: 69,
          },
          visitsWithAnyAffordableOffer: 0,
          visitsWithAnyAffordableOfferRate: 0,
          offers: { total: 280, legal: 0, affordable: 0, affordableRate: 0 },
        },
        transactions: {
          purchases: { commands: 0, completed: 0, goldSpent: 0 },
          recruitments: { commands: 0, successes: 0, goldSpent: 0 },
        },
      },
      {
        difficulty: 'hard',
        sampleSize: 300,
        runWins: 15,
        runWinRate: 0.05,
        topCombatGoldEarned: {
          samples: 300,
          total: 25_064,
          mean: 25_064 / 300,
          min: 23,
          p10: 48,
          p50: 78,
          p90: 130.70000000000016,
          max: 189,
        },
        shops: {
          runsWithVisit: 58,
          visits: 58,
          visitsPerRun: 58 / 300,
          goldOnEntry: {
            samples: 58,
            total: 2_420,
            mean: 2_420 / 58,
            min: 23,
            p10: 23,
            p50: 25,
            p90: 79,
            max: 79,
          },
          visitsWithAnyAffordableOffer: 9,
          visitsWithAnyAffordableOfferRate: 9 / 58,
          offers: { total: 270, legal: 9, affordable: 9, affordableRate: 9 / 270 },
        },
        transactions: {
          purchases: { commands: 9, completed: 9, goldSpent: 432 },
          recruitments: { commands: 0, successes: 0, goldSpent: 0 },
        },
      },
    ]);
  }, 90_000);
});
