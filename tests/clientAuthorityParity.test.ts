import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORITY_ENGINE_VERSION,
  replayAuthorityRun,
  type AuthorityRunAttempt,
  type AuthorityRunCommand,
  type AuthorityRunSnapshot,
} from '@/game/authority';
import { createRunAugmentManager, buildRunPlayerTeam } from '@/game/run/runCombatant';
import { resolvePostCombatTeam } from '@/game/run/postCombatRules';
import { buildResolvedEnemyTeam, resolveCombatEncounter } from '@/game/run/encounterResolver';
import { BattleManager } from '@/game/battle/BattleManager';
import { BattlePhase, type BattleAction, type BattleTeam } from '@/game/battle/types';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { NodeType } from '@/game/map/types';
import { buildChampionRunStats } from '@/game/run/runLedger';
import { createScopedRunRng } from '@/utils/runRandom';
import { useAuthStore } from '@/stores/authStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

const RUN_UUID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = 'parity-user';
const SEED = 424_242;

function authorityAttempt(): AuthorityRunAttempt {
  return {
    runUuid: RUN_UUID,
    seed: SEED,
    difficulty: 'easy',
    team: [{ championId: 'Garen', statMultiplier: 10 }],
    runeIds: ['press_the_attack'],
    enhancementSnapshot: { Garen: {} },
    masterySnapshot: { Garen: 0 },
  };
}

function clientAttempt(): RunAuthorityAttempt {
  return {
    attemptId: '22222222-2222-4222-8222-222222222222',
    runUuid: RUN_UUID,
    ownerUserId: OWNER_ID,
    seed: SEED,
    rulesetVersion: 11,
    engineVersion: AUTHORITY_ENGINE_VERSION,
    difficulty: 'easy',
    mode: 'normal',
    initialTeam: ['Garen'],
    runeIds: ['press_the_attack'],
    enhancementSnapshot: { Garen: {} },
    masterySnapshot: { Garen: 0 },
    startedAt: '2026-07-31T08:00:00.000Z',
    expiresAt: '2026-08-01T08:00:00.000Z',
    status: 'started',
    commands: [],
    nextSequence: 1,
    lastAcknowledgedSequence: 0,
    journalHash: 'golden-parity',
    finishCommandId: null,
  };
}

function initializeClient(): void {
  const firstMap = generateRunMap(SEED)[0];
  useRunStore.setState({
    ...RUN_INITIAL_STATE,
    isActive: true,
    runId: RUN_UUID,
    seed: SEED,
    startedAt: '2026-07-31T08:00:00.000Z',
    authorityAttempt: clientAttempt(),
    team: [{ championId: 'Garen', statMultiplier: 10 }],
    runeIds: ['press_the_attack'],
  });
  useRunStore.getState().generateRunMap(SEED);
  expect(useRunStore.getState().currentBiome).toBe(firstMap.biome);
}

function recordedTrace(): AuthorityRunCommand[] {
  return (useRunStore.getState().authorityAttempt?.commands ?? []).map((command) => ({
    sequence: command.sequence,
    kind: command.kind,
    payload: command.payload,
  })) as AuthorityRunCommand[];
}

function canonicalClientSnapshot(): AuthorityRunSnapshot {
  const state = useRunStore.getState();
  const championStats = buildChampionRunStats(state.ledger, state.team);
  return {
    runUuid: state.runId,
    seed: state.seed ?? 0,
    difficulty: state.authorityAttempt?.difficulty ?? 'normal',
    terminal: !state.isActive,
    endReason: null,
    won: false,
    runLevel: state.runLevel,
    currentBiome: state.currentBiome,
    currentBiomeIndex: state.currentBiomeIndex,
    biomesVisited: [...state.biomesVisited],
    currentNodeId: state.currentNodeId,
    expectedNodeIds: [...state.frontierNodeIds],
    pendingNodeType: state.pendingEncounter?.nodeType ?? null,
    completedNodeIds: [...state.completedNodeIds],
    team: state.team.map((member) => ({
      championId: member.championId,
      currentHp: member.currentHp ?? null,
      currentMp: member.currentMp ?? null,
      level: member.level ?? 1,
      currentXp: member.currentXp ?? 0,
      statBoosts: { ...member.statBoosts },
      statMultiplier: member.statMultiplier ?? 1,
      spellRanks: {
        Q: member.spellRanks?.Q ?? 1,
        W: member.spellRanks?.W ?? 1,
        E: member.spellRanks?.E ?? 1,
        R: member.spellRanks?.R ?? 1,
      },
    })),
    inventory: state.inventory.map((entry) => ({
      ...entry,
      item: { ...entry.item, stats: { ...entry.item.stats } },
    })),
    runeIds: [...state.runeIds],
    augmentIds: [...state.augmentIds],
    pendingAugmentIds: [...state.pendingAugmentIds],
    pendingSpellUpgradeChampionIds: [...state.pendingSpellUpgradeChampionIds],
    gold: state.gold,
    currentWave: state.currentWave,
    totalWavesCompleted: state.totalWavesCompleted,
    championStats,
    totalKills: championStats.reduce((sum, entry) => sum + entry.kills, 0),
    totalDamage: championStats.reduce((sum, entry) => sum + entry.totalDamage, 0),
    ledger: state.ledger,
    nextSequence: state.authorityAttempt?.nextSequence ?? 1,
  };
}

function resolveFirstClientCombat(mode: 'manual' | 'autoplay'): void {
  const store = useRunStore.getState();
  const nodeId = store.frontierNodeIds[0];
  expect(nodeId).toBeTruthy();
  expect(store.moveToNode(nodeId!)).toBe(true);
  expect(useRunStore.getState().startEncounter(nodeId!, 'combat')).toBe(true);

  const before = useRunStore.getState();
  const node = before.getCurrentNode();
  const encounter = node?.encounter;
  expect(node?.type).toBe(NodeType.Combat);
  expect(encounter?.type).toBe('combat');
  if (!node || encounter?.type !== 'combat') throw new Error('Golden combat is unavailable.');

  const players = buildRunPlayerTeam(before.team, {
    inventory: before.inventory,
    augmentIds: before.augmentIds,
    currentBiomeIndex: before.currentBiomeIndex,
    getUnlockedEnhancements: (championId) =>
      before.authorityAttempt?.enhancementSnapshot[championId] ?? {},
    getMasteryLevel: (championId) => before.authorityAttempt?.masterySnapshot?.[championId] ?? 0,
  });
  const resolution = resolveCombatEncounter({
    seed: before.seed,
    nodeId: node.id,
    biome: node.biome,
    nodeType: node.type as NodeType.Combat,
    wave: before.currentWave,
    runLevel: before.runLevel,
    difficulty: before.authorityAttempt?.difficulty ?? 'normal',
    encounter,
    inventory: before.inventory,
  });
  const rng = createScopedRunRng(before.seed, `combat:${encounter.id ?? node.id}`);
  const battle = new BattleManager(
    { side: 'player', champions: players } satisfies BattleTeam,
    {
      side: 'enemy',
      champions: buildResolvedEnemyTeam(resolution),
    } satisfies BattleTeam,
    {
      autoActions: mode === 'autoplay',
      maxRounds: 50,
      initialHpOverrides: Object.fromEntries(
        before.team.flatMap((member) =>
          member.currentHp === undefined ? [] : [[member.championId, member.currentHp]],
        ),
      ),
      initialMpOverrides: Object.fromEntries(
        before.team.flatMap((member) =>
          member.currentMp === undefined ? [] : [[member.championId, member.currentMp]],
        ),
      ),
      random: () => rng.next(),
      rules: new CombatRuleRuntime(
        buildCombatRuleLoadout({
          championIds: before.team.map((member) => member.championId),
          runeIds: before.runeIds,
          runeStacks: before.runeStacks,
          augmentIds: before.augmentIds,
          inventory: before.inventory,
          getUnlockedEnhancements: (championId) =>
            before.authorityAttempt?.enhancementSnapshot[championId] ?? {},
        }),
        () => rng.next(),
      ),
    },
  );
  if (mode === 'manual') {
    battle.setActionCallback((champion): BattleAction | null => {
      const option = battle.getAvailableActions(champion)[0];
      if (!option) return null;
      return {
        type: option.type,
        targetId: option.requiresTarget ? option.validTargetIds[0] : undefined,
      };
    });
  }
  battle.startBattle();
  for (let turn = 0; battle.phase !== BattlePhase.Finished && turn < 10_000; turn++) {
    battle.processCurrentTurn();
  }
  const result = battle.getResult();
  expect(result?.winner).toBe('player');
  if (!result || result.winner !== 'player') throw new Error('Golden combat was not won.');

  const commandState = useRunStore.getState();
  expect(commandState.claimCurrentEncounter()).toBe(true);
  expect(
    useRunStore.getState().recordRunCommand({
      kind: 'resolve_combat',
      nodeId: node.id,
      actions: battle.getPlayerActionTrace(),
    }),
  ).toBe(true);
  useRunStore.getState().consumeItems(battle.getConsumedItemInstanceIds(), {
    source: 'combat',
    nodeId: node.id,
    wave: before.currentWave,
  });
  useRunStore.getState().setRuneStacks(battle.getRuneStacks());
  useRunStore.getState().commitCombatEvents(result.log);

  const afterJournal = useRunStore.getState();
  const augmentManager = createRunAugmentManager(
    afterJournal.augmentIds,
    afterJournal.currentBiomeIndex,
  );
  const rewarded = resolveCombatEncounter({
    seed: afterJournal.seed,
    nodeId: node.id,
    biome: node.biome,
    nodeType: node.type as NodeType.Combat,
    wave: afterJournal.currentWave,
    runLevel: afterJournal.runLevel,
    difficulty: afterJournal.authorityAttempt?.difficulty ?? 'normal',
    encounter,
    inventory: afterJournal.inventory,
    bonusGold: augmentManager.getBonusGold(),
  });
  expect(
    afterJournal.addGold(rewarded.reward.gold, {
      source: 'combat',
      nodeId: node.id,
      wave: afterJournal.currentWave,
    }).success,
  ).toBe(true);
  const postCombat = resolvePostCombatTeam({
    team: afterJournal.team,
    finalPlayerStates: battle.getFinalPlayerStates(),
    xpPerChampion: rewarded.reward.xpPerChampion,
    healAfterBattlePercent: augmentManager.getHealAfterBattlePercent(),
    getPreLevelMaxHp: (member) =>
      players.find((champion) => champion.id === member.championId)?.getEnhancedStats().hp ?? 1,
    getPreLevelMaxMp: (member) =>
      players.find((champion) => champion.id === member.championId)?.getEnhancedStats().mp ?? 0,
  });
  afterJournal.updateTeamAfterCombat(postCombat.updates);
  afterJournal.queueSpellUpgrades(postCombat.pendingSpellUpgradeChampionIds);
  if (rewarded.reward.droppedItem) {
    expect(
      useRunStore.getState().addItem(rewarded.reward.droppedItem, {
        source: 'combat',
        nodeId: node.id,
        wave: afterJournal.currentWave,
      }).success,
    ).toBe(true);
  }
  useRunStore.getState().completeCombatProgression();
  expect(useRunStore.getState().resolveEncounter()).toBe(true);
}

describe('golden client / authority parity traces', () => {
  beforeEach(() => {
    let uuid = 0;
    vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
      () =>
        `aaaaaaaa-aaaa-4aaa-8aaa-${String(++uuid).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
    );
    useAuthStore.setState({
      isAuthenticated: true,
      isGuest: false,
      user: { id: OWNER_ID } as User,
    });
    initializeClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    useAuthStore.setState({ isAuthenticated: false, isGuest: false, user: null });
  });

  it.each(['manual', 'autoplay'] as const)(
    'produces the exact canonical state for a %s combat trace',
    (mode) => {
      resolveFirstClientCombat(mode);
      const authority = replayAuthorityRun(authorityAttempt(), recordedTrace()).snapshot;

      expect(canonicalClientSnapshot()).toEqual(authority);
      const combatCommand = recordedTrace().find((command) => command.kind === 'resolve_combat');
      if (mode === 'manual') {
        expect(combatCommand?.payload.actions_json).toContain(',0]');
      } else {
        expect(combatCommand?.payload).toEqual({ node_id: combatCommand?.payload.node_id });
      }
    },
  );

  it('delegates autoplay targeting entirely to the deterministic authority', () => {
    resolveFirstClientCombat('autoplay');
    const canonicalTrace = recordedTrace();
    const canonicalSnapshot = replayAuthorityRun(authorityAttempt(), canonicalTrace).snapshot;
    const combatIndex = canonicalTrace.findIndex((command) => command.kind === 'resolve_combat');
    const combatCommand = canonicalTrace[combatIndex];
    if (combatCommand?.kind !== 'resolve_combat') throw new Error('Combat command is missing.');
    expect(combatCommand.payload).toEqual({ node_id: combatCommand.payload.node_id });
    expect(replayAuthorityRun(authorityAttempt(), canonicalTrace).snapshot).toEqual(
      canonicalSnapshot,
    );
  });
});
