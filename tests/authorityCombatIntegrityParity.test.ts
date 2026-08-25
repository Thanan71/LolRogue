import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  getAuthorityVerifier,
} from '@/game/authority';
import { simulateAuthorityCohort } from '@/game/balance/authorityCohort';
import { type BalanceScenario, survivalGreedyPolicy } from '@/game/balance/balancePolicy';
import rawRegistry from '../config/authority-versions.json';
import { resolveBundledAuthorityVerifier } from './helpers/authorityBundleResolver';

const MANA_ATTEMPT: AuthorityRunAttempt = {
  runUuid: '44444444-4444-4444-8444-444444444444',
  seed: 2,
  difficulty: 'easy',
  mode: 'normal',
  team: [{ championId: 'Ashe', statMultiplier: 3 }],
  runeIds: ['electrocute'],
  enhancementSnapshot: { Ashe: {} },
  masterySnapshot: { Ashe: 0 },
};

const COHORT_SCENARIO: BalanceScenario = {
  id: 'authority-cohort-source-bundle-parity',
  difficulty: 'hard',
  team: [{ championId: 'Soraka', statMultiplier: 0.1 }],
  runeIds: [],
  masterySnapshot: {},
  enhancementSnapshot: {},
};

const MANA_TRACE: AuthorityRunCommand[] = [
  { sequence: 1, kind: 'move_node', payload: { node_id: 'node_top_lane_0' } },
  {
    sequence: 2,
    kind: 'resolve_combat',
    payload: {
      node_id: 'node_top_lane_0',
      actions_json: 'auto',
    },
  },
  { sequence: 3, kind: 'resolve_node', payload: { node_id: 'node_top_lane_0' } },
  { sequence: 4, kind: 'move_node', payload: { node_id: 'node_top_lane_1' } },
  { sequence: 5, kind: 'resolve_node', payload: { node_id: 'node_top_lane_1' } },
  { sequence: 6, kind: 'move_node', payload: { node_id: 'node_top_lane_2' } },
  {
    sequence: 7,
    kind: 'resolve_combat',
    payload: {
      node_id: 'node_top_lane_2',
      actions_json: 'auto',
    },
  },
  { sequence: 8, kind: 'resolve_node', payload: { node_id: 'node_top_lane_2' } },
  { sequence: 9, kind: 'move_node', payload: { node_id: 'node_top_lane_4' } },
  { sequence: 10, kind: 'rest', payload: { node_id: 'node_top_lane_4' } },
];

async function expectSourceBundleParity(
  attempt: AuthorityRunAttempt,
  commands: AuthorityRunCommand[],
) {
  const source = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
  const bundled = await resolveBundledAuthorityVerifier(
    AUTHORITY_ENGINE_VERSION,
    AUTHORITY_CONTENT_HASH,
  );
  expect(source).toBeDefined();
  expect(bundled).toBeDefined();

  const sourceResult = source!.verify(attempt, commands, { requireTerminal: false });
  const bundledResult = bundled!.verify(attempt, commands, { requireTerminal: false });
  expect(bundledResult).toEqual(sourceResult);
  return sourceResult;
}

describe('combat integrity source / Edge bundle parity', () => {
  it('preserves mana across two combats, applies victory recovery, and fully restores at rest', async () => {
    const first = await expectSourceBundleParity(MANA_ATTEMPT, MANA_TRACE.slice(0, 2));
    const second = await expectSourceBundleParity(MANA_ATTEMPT, MANA_TRACE.slice(0, 7));
    const rested = await expectSourceBundleParity(MANA_ATTEMPT, MANA_TRACE);

    expect(first).toMatchObject({
      ok: true,
      result: { snapshot: { team: [{ championId: 'Ashe', currentMp: 840 }] } },
    });
    expect(second).toMatchObject({
      ok: true,
      result: { snapshot: { team: [{ championId: 'Ashe', currentMp: 840 }] } },
    });
    expect(rested).toMatchObject({
      ok: true,
      result: { snapshot: { team: [{ championId: 'Ashe', currentMp: 916 }] } },
    });
    if (!first.ok || !second.ok || !rested.ok) throw new Error('Expected valid mana traces.');
    expect(first.result.combatSummaries[0]).toMatchObject({
      metrics: { bySide: { player: { manaSpent: 60 } } },
      playerTeam: {
        initial: [{ currentMp: 840 }],
        final: [{ currentMp: 780 }],
      },
      playerAfterEncounter: [{ currentMp: 840 }],
    });
    expect(
      second.result.combatSummaries.map((summary) => summary.metrics.bySide.player.manaSpent),
    ).toEqual([60, 60]);
  });

  it.each(['Ashe', 'Jinx', 'Leona', 'Malphite', 'Warwick'])(
    'replays the %s composite hostile/self-positive spell catalog identically',
    async (championId) => {
      const attempt: AuthorityRunAttempt = {
        ...MANA_ATTEMPT,
        runUuid: `55555555-5555-4555-8555-${championId.padEnd(12, '0').slice(0, 12)}`,
        team: [{ championId, statMultiplier: 1.2 }],
        enhancementSnapshot: { [championId]: {} },
        masterySnapshot: { [championId]: 0 },
      };
      const trace: AuthorityRunCommand[] = [
        { sequence: 1, kind: 'move_node', payload: { node_id: 'node_top_lane_0' } },
        {
          sequence: 2,
          kind: 'resolve_combat',
          payload: { node_id: 'node_top_lane_0', actions_json: 'auto' },
        },
      ];

      const result = await expectSourceBundleParity(attempt, trace);
      expect(result).toMatchObject({ ok: true });
    },
  );

  it('replays post-damage execute semantics identically for Garen', async () => {
    const attempt: AuthorityRunAttempt = {
      ...MANA_ATTEMPT,
      runUuid: '66666666-6666-4666-8666-666666666666',
      team: [{ championId: 'Garen', statMultiplier: 3 }],
      runeIds: [],
      enhancementSnapshot: { Garen: {} },
      masterySnapshot: { Garen: 0 },
    };
    const trace: AuthorityRunCommand[] = [
      { sequence: 1, kind: 'move_node', payload: { node_id: 'node_top_lane_0' } },
      {
        sequence: 2,
        kind: 'resolve_combat',
        payload: {
          node_id: 'node_top_lane_0',
          actions_json: 'auto',
        },
      },
    ];

    const result = await expectSourceBundleParity(attempt, trace);
    expect(result).toMatchObject({
      ok: true,
      result: { snapshot: { totalDamage: 204 } },
    });
  });

  it('replays Jinx area execute and resource metrics against a multi-target elite identically', async () => {
    const attempt: AuthorityRunAttempt = {
      ...MANA_ATTEMPT,
      runUuid: '77777777-7777-4777-8777-777777777777',
      seed: 14,
      team: [{ championId: 'Jinx', statMultiplier: 3 }],
      runeIds: ['press_the_attack'],
      enhancementSnapshot: {
        Jinx: {
          marksman_core_1: 1,
          marksman_core_2: 1,
          marksman_core_3: 1,
          marksman_dps_1: 1,
        },
      },
      masterySnapshot: { Jinx: 3 },
    };
    const trace: AuthorityRunCommand[] = [
      { sequence: 1, kind: 'move_node', payload: { node_id: 'node_top_lane_0' } },
      {
        sequence: 2,
        kind: 'resolve_combat',
        payload: {
          node_id: 'node_top_lane_0',
          actions_json: 'auto',
        },
      },
      { sequence: 3, kind: 'resolve_node', payload: { node_id: 'node_top_lane_0' } },
      { sequence: 4, kind: 'move_node', payload: { node_id: 'node_top_lane_1' } },
      {
        sequence: 5,
        kind: 'resolve_combat',
        payload: {
          node_id: 'node_top_lane_1',
          actions_json: '[["e","Darius",0],["q","Malphite",1],["r","Darius",0]]',
        },
      },
    ];

    const result = await expectSourceBundleParity(attempt, trace);
    expect(result).toMatchObject({
      ok: true,
      result: { snapshot: { totalDamage: 425 } },
    });
    if (!result.ok) throw new Error('Expected a valid multi-target Jinx trace.');
    const elite = result.result.combatSummaries[1]!;
    expect(elite.enemyTeam.initial.map((enemy) => enemy.championId)).toEqual([
      'Darius',
      'Malphite',
    ]);
    expect(elite.metrics.bySide).toMatchObject({
      player: { shieldDamageDealt: 5, manaSpent: 210 },
      enemy: { shieldingAbsorbed: 5, manaSpent: 40 },
    });
  });

  it('loads archived v14 through v18 and current v19 only for their exact hashes', async () => {
    const v14 = rawRegistry.versions.find((version) => version.engine === 'run-engine-v14');
    const v15 = rawRegistry.versions.find((version) => version.engine === 'run-engine-v15');
    const v16 = rawRegistry.versions.find((version) => version.engine === 'run-engine-v16');
    const v17 = rawRegistry.versions.find((version) => version.engine === 'run-engine-v17');
    const v18 = rawRegistry.versions.find((version) => version.engine === 'run-engine-v18');
    expect(v14?.status).toBe('replay-only');
    expect(v15?.status).toBe('replay-only');
    expect(v16?.status).toBe('replay-only');
    expect(v17?.status).toBe('replay-only');
    expect(v18?.status).toBe('replay-only');
    expect(await resolveBundledAuthorityVerifier(v14!.engine, v14!.contentHash)).toBeDefined();
    expect(await resolveBundledAuthorityVerifier(v15!.engine, v15!.contentHash)).toBeDefined();
    expect(await resolveBundledAuthorityVerifier(v16!.engine, v16!.contentHash)).toBeDefined();
    expect(await resolveBundledAuthorityVerifier(v17!.engine, v17!.contentHash)).toBeDefined();
    expect(await resolveBundledAuthorityVerifier(v18!.engine, v18!.contentHash)).toBeDefined();
    expect(
      await resolveBundledAuthorityVerifier(AUTHORITY_ENGINE_VERSION, '0'.repeat(64)),
    ).toBeUndefined();
  }, 15_000);

  it('drives identical terminal cohort traces through source and the current Edge bundle', async () => {
    const source = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
    const bundled = await resolveBundledAuthorityVerifier(
      AUTHORITY_ENGINE_VERSION,
      AUTHORITY_CONTENT_HASH,
    );
    expect(source).toBeDefined();
    expect(bundled).toBeDefined();

    const input = {
      policy: survivalGreedyPolicy,
      scenario: COHORT_SCENARIO,
      seeds: [0],
    } as const;
    expect(simulateAuthorityCohort({ authority: bundled!, ...input })).toEqual(
      simulateAuthorityCohort({ authority: source!, ...input }),
    );
  });
});
