import { describe, expect, it } from 'vitest';
import {
  createAuthorityReplaySession,
  replayAuthorityRun,
  verifyAuthorityRun,
} from '@/game/authority/AuthorityRunEngine';
import type { AuthorityPendingShopSnapshot, AuthorityRunSnapshot } from '@/game/authority/types';
import {
  BalancePolicyDecisionError,
  type BalanceScenario,
  createBalanceRunUuid,
  SURVIVAL_GREEDY_POLICY_MANIFEST,
  survivalGreedyPolicy,
} from '@/game/balance/balancePolicy';
import { getCanonicalRunItem } from '@/game/inventory/inventoryRules';

const SCENARIO: BalanceScenario = {
  id: 'policy-contract',
  difficulty: 'normal',
  team: [{ championId: 'Garen' }],
  runeIds: ['grasp_of_the_undying'],
  masterySnapshot: { Garen: 0 },
  enhancementSnapshot: { Garen: {} },
};

function initialSnapshot(): AuthorityRunSnapshot {
  return replayAuthorityRun(survivalGreedyPolicy.buildAttempt({ scenario: SCENARIO, seed: 17 }), [])
    .snapshot;
}

function snapshotWith(overrides: Partial<AuthorityRunSnapshot>): AuthorityRunSnapshot {
  return { ...initialSnapshot(), ...overrides };
}

describe('versioned balance policy', () => {
  it('builds immutable-input attempts with deterministic identities and rune choices', () => {
    expect(survivalGreedyPolicy.manifest).toEqual({ id: 'survival-greedy', version: 1 });
    expect(survivalGreedyPolicy.manifest).toBe(SURVIVAL_GREEDY_POLICY_MANIFEST);

    const first = survivalGreedyPolicy.buildAttempt({ scenario: SCENARIO, seed: 42 });
    const second = survivalGreedyPolicy.buildAttempt({ scenario: SCENARIO, seed: 42 });
    expect(first).toEqual(second);
    expect(first.runUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(first.runeIds).toEqual(['grasp_of_the_undying']);
    expect(createBalanceRunUuid(SCENARIO, 43)).not.toBe(first.runUuid);

    first.runeIds.push('electrocute');
    first.masterySnapshot.Garen = 4;
    expect(SCENARIO.runeIds).toEqual(['grasp_of_the_undying']);
    expect(SCENARIO.masterySnapshot.Garen).toBe(0);
  });

  it('rejects invalid scenario inputs before simulation', () => {
    expect(() => survivalGreedyPolicy.buildAttempt({ scenario: SCENARIO, seed: 1.5 })).toThrowError(
      BalancePolicyDecisionError,
    );
    expect(() =>
      survivalGreedyPolicy.buildAttempt({
        scenario: { ...SCENARIO, team: [{ championId: 'Unknown' }] },
        seed: 1,
      }),
    ).toThrowError(BalancePolicyDecisionError);
  });

  it('returns one reachable move command without mutating the snapshot', () => {
    const snapshot = initialSnapshot();
    const before = structuredClone(snapshot);
    const next = survivalGreedyPolicy.nextCommand(snapshot);
    expect(next).toEqual({
      sequence: 1,
      kind: 'move_node',
      payload: { node_id: [...snapshot.expectedNodeIds].sort()[0] },
    });
    expect(snapshot).toEqual(before);
    expect(() =>
      replayAuthorityRun(survivalGreedyPolicy.buildAttempt({ scenario: SCENARIO, seed: 17 }), [
        next,
      ]),
    ).not.toThrow();
  });

  it('chooses combat and then resolves a claimed encounter', () => {
    const combat = snapshotWith({
      expectedNodeIds: [],
      currentNodeId: 'combat-1',
      pendingEncounter: {
        nodeId: 'combat-1',
        nodeType: 'combat',
        encounterId: 'top-duel',
        claimed: false,
      },
      nextSequence: 2,
    });
    expect(survivalGreedyPolicy.nextCommand(combat)).toEqual({
      sequence: 2,
      kind: 'resolve_combat',
      payload: { node_id: 'combat-1', actions_json: 'auto' },
    });
    expect(
      survivalGreedyPolicy.nextCommand({
        ...combat,
        pendingEncounter: { ...combat.pendingEncounter!, claimed: true },
        nextSequence: 3,
      }),
    ).toEqual({ sequence: 3, kind: 'resolve_node', payload: { node_id: 'combat-1' } });
  });

  it('buys one legal shop offer at a time and leaves when none is affordable', () => {
    const shop = snapshotWith({
      expectedNodeIds: [],
      currentNodeId: 'shop-1',
      gold: 120,
      pendingEncounter: {
        nodeId: 'shop-1',
        nodeType: 'shop',
        encounterId: 'top-shop',
        claimed: false,
        itemOffers: [
          { itemId: 'cloth_armor', cost: 90, consumed: false, legal: true },
          { itemId: 'long_sword', cost: 80, consumed: false, legal: true },
        ],
        recruitOffers: [
          { championId: 'Lux', cost: 110, consumed: false, legal: true },
          { championId: 'Ashe', cost: 100, consumed: false, legal: true },
        ],
      },
      nextSequence: 5,
    });
    expect(survivalGreedyPolicy.nextCommand(shop)).toEqual({
      sequence: 5,
      kind: 'shop_recruit',
      payload: { node_id: 'shop-1', champion_id: 'Ashe' },
    });
    expect(
      survivalGreedyPolicy.nextCommand({
        ...shop,
        gold: 90,
        pendingEncounter: {
          ...(shop.pendingEncounter as AuthorityPendingShopSnapshot),
          recruitOffers: [],
        },
      }),
    ).toEqual({
      sequence: 5,
      kind: 'shop_buy_item',
      payload: { node_id: 'shop-1', item_id: 'long_sword' },
    });
    expect(
      survivalGreedyPolicy.nextCommand({
        ...shop,
        gold: 0,
        pendingEncounter: {
          ...(shop.pendingEncounter as AuthorityPendingShopSnapshot),
          recruitOffers: [],
        },
      }),
    ).toEqual({ sequence: 5, kind: 'resolve_node', payload: { node_id: 'shop-1' } });
  });

  it('handles recruit, rest, event and treasure encounters through public legality', () => {
    const cases = [
      [{ nodeType: 'recruit', championId: 'Lux', cost: 75, legal: true }, 'recruit'],
      [{ nodeType: 'rest', cost: 25, legal: true }, 'rest'],
      [{ nodeType: 'event' }, 'event'],
      [{ nodeType: 'treasure' }, 'treasure'],
    ] as const;
    for (const [specific, kind] of cases) {
      const snapshot = snapshotWith({
        expectedNodeIds: [],
        currentNodeId: 'node-1',
        pendingEncounter: {
          nodeId: 'node-1',
          encounterId: 'encounter-1',
          claimed: false,
          ...specific,
        } as NonNullable<AuthorityRunSnapshot['pendingEncounter']>,
      });
      expect(survivalGreedyPolicy.nextCommand(snapshot)?.kind).toBe(kind);
    }
  });

  it('prioritizes spell upgrades, augments and legal equipment', () => {
    const spell = snapshotWith({
      team: [
        {
          ...initialSnapshot().team[0]!,
          level: 6,
          spellRanks: { Q: 1, W: 1, E: 1, R: 1 },
        },
      ],
      pendingSpellUpgradeChampionIds: ['Garen'],
      nextSequence: 8,
    });
    expect(survivalGreedyPolicy.nextCommand(spell)).toEqual({
      sequence: 8,
      kind: 'upgrade_spell',
      payload: { champion_id: 'Garen', slot: 'R' },
    });

    expect(
      survivalGreedyPolicy.nextCommand(
        snapshotWith({ pendingAugmentIds: ['gold_ap', 'silver_hp'], nextSequence: 9 }),
      ),
    ).toEqual({
      sequence: 9,
      kind: 'choose_augment',
      payload: { augment_id: 'gold_ap' },
    });

    const item = getCanonicalRunItem('long_sword');
    expect(item).not.toBeNull();
    expect(
      survivalGreedyPolicy.nextCommand(
        snapshotWith({
          expectedNodeIds: ['later-node'],
          inventory: [{ instanceId: 'item-1', item: item!, equippedToChampionId: null }],
          nextSequence: 10,
        }),
      ),
    ).toEqual({
      sequence: 10,
      kind: 'equip_item',
      payload: { instance_id: 'item-1', champion_id: 'Garen' },
    });
  });

  it('returns null only for terminal snapshots and reports non-terminal dead ends', () => {
    expect(survivalGreedyPolicy.nextCommand(snapshotWith({ terminal: true }))).toBeNull();
    expect(() =>
      survivalGreedyPolicy.nextCommand(
        snapshotWith({
          expectedNodeIds: [],
          currentNodeId: null,
          pendingEncounter: null,
        }),
      ),
    ).toThrowError(BalancePolicyDecisionError);
  });

  it('produces a legal command stream until the canonical engine reaches a terminal state', () => {
    const scenario: BalanceScenario = {
      ...SCENARIO,
      id: 'policy-full-run',
      difficulty: 'easy',
      team: ['Garen', 'Annie', 'Ashe', 'Darius', 'Lux'].map((championId) => ({
        championId,
        statMultiplier: 3,
      })),
      runeIds: ['grasp_of_the_undying', 'electrocute', 'press_the_attack'],
      masterySnapshot: {},
      enhancementSnapshot: {},
    };
    const attempt = survivalGreedyPolicy.buildAttempt({ scenario, seed: 17 });
    const session = createAuthorityReplaySession(attempt);
    const trace = [];

    for (let index = 0; index < 500 && !session.getResult().snapshot.terminal; index++) {
      const next = survivalGreedyPolicy.nextCommand(session.getResult().snapshot);
      expect(next).not.toBeNull();
      trace.push(next!);
      session.append(next);
    }

    expect(session.getResult().snapshot.terminal).toBe(true);
    expect(trace.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['move_node', 'resolve_combat', 'resolve_node']),
    );
    expect(verifyAuthorityRun(attempt, trace)).toMatchObject({ ok: true });
  }, 20_000);
});
