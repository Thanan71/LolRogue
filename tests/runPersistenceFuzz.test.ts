import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { getRunDomainInvariantViolations } from '@/game/run/runDomainInvariants';
import { buildRunSummaryFromLedger } from '@/game/run/runLedger';
import { migratePersistedRunState, RUN_STORAGE_KEY } from '@/game/run/runPersistence';
import { isPersistedRunState } from '@/game/run/runPersistenceValidation';
import { getPersistedActiveRun } from '@/game/run/runStartCoordinator';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { RunState } from '@/types/run';
import type { RunAuthorityAttempt } from '@/types/runAttempt';
import { storageMaxChars } from '@/utils/storagePolicy';

function validAttempt(): RunAuthorityAttempt {
  return {
    attemptId: 'attempt-1',
    runUuid: 'run-1',
    ownerUserId: 'user-1',
    seed: 42,
    rulesetVersion: 1,
    engineVersion: 'run-engine-v21',
    difficulty: 'normal',
    mode: 'normal',
    initialTeam: ['Garen', 'Annie'],
    runeIds: [],
    enhancementSnapshot: {},
    // Pre-v8 attempts legitimately have no masterySnapshot.
    startedAt: '2026-08-01T12:00:00.000Z',
    expiresAt: '2026-08-02T12:00:00.000Z',
    status: 'active',
    commands: [
      {
        commandId: 'command-1',
        sequence: 1,
        kind: 'move_node',
        payload: { node_id: 'node-1' },
        dedupeKey: 'move_node:node-1',
      },
    ],
    nextSequence: 2,
    lastAcknowledgedSequence: 0,
    journalHash: 'initial-hash',
    finishCommandId: 'finish-1',
  };
}

function validState(): RunState {
  const maps = generateRunMap(42);
  return {
    ...structuredClone(RUN_INITIAL_STATE),
    isActive: true,
    runId: 'run-1',
    seed: 42,
    startedAt: '2026-08-01T12:00:00.000Z',
    team: [{ championId: 'Garen' }, { championId: 'Annie' }],
    authorityAttempt: validAttempt(),
    biomeMaps: maps,
    currentBiome: maps[0].biome,
    frontierNodeIds: [maps[0].startNodeId],
  };
}

describe('bounded run hydration and deterministic malformed-payload corpus', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    useRunStore.setState(structuredClone(RUN_INITIAL_STATE));
  });
  afterEach(() => {
    useRunStore.setState(structuredClone(RUN_INITIAL_STATE));
    vi.unstubAllGlobals();
  });

  it.each(['SecurityError', 'QuotaExceededError'])(
    'preserves the run and its quarantine during temporarily unreadable hydration (%s)',
    async (errorName) => {
      const state = validState();
      const raw = JSON.stringify({ version: 7, state });
      const quarantineKey = `lolrogue-quarantine:${RUN_STORAGE_KEY}`;
      const quarantine = JSON.stringify({
        version: 1,
        quarantinedAt: new Date().toISOString(),
        reason: 'prior-diagnostic',
        payload: {},
      });
      storage.set(RUN_STORAGE_KEY, raw);
      storage.set(quarantineKey, quarantine);
      const getItem = vi.fn((key: string): string | null => storage.get(key) ?? null);
      getItem.mockImplementation(() => {
        throw new DOMException('temporarily blocked', errorName);
      });
      const setItem = vi.fn((key: string, value: string) => {
        storage.set(key, value);
      });
      const removeItem = vi.fn((key: string) => {
        storage.delete(key);
      });
      vi.stubGlobal('localStorage', { getItem, setItem, removeItem });

      await useRunStore.persist.rehydrate();
      expect(useRunStore.getState().isActive).toBe(false);
      expect(storage.get(RUN_STORAGE_KEY)).toBe(raw);
      expect(storage.get(quarantineKey)).toBe(quarantine);
      expect(removeItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();

      getItem.mockImplementation((key) => storage.get(key) ?? null);
      await useRunStore.persist.rehydrate();
      expect(useRunStore.getState()).toMatchObject({
        isActive: true,
        runId: state.runId,
        seed: state.seed,
        team: state.team,
        authorityAttempt: state.authorityAttempt,
      });
      expect(storage.get(RUN_STORAGE_KEY)).toBe(raw);
      expect(storage.get(quarantineKey)).toBe(quarantine);
      expect(removeItem).not.toHaveBeenCalled();
      expect(setItem).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1, 2, 3, 4, 5, 6, 7])(
    'preserves a compatible v%s run, including the pre-v8 attempt journal',
    (version) => {
      const state = validState();
      expect(isPersistedRunState(state)).toBe(true);
      const recovered = migratePersistedRunState(state, version);
      expect(recovered).toMatchObject({
        isActive: true,
        runId: 'run-1',
        authorityAttempt: state.authorityAttempt,
        serverProgression: null,
      });
      expect(recovered.authorityAttempt).not.toHaveProperty('masterySnapshot');
      expect(getRunDomainInvariantViolations(recovered)).toEqual([]);
      expect(migratePersistedRunState(recovered, 7)).toEqual(recovered);
    },
  );

  it('accepts the signed integer seeds supported by historical guest saves', () => {
    const state = { ...validState(), seed: -42, authorityAttempt: null };
    expect(migratePersistedRunState(state, 7).seed).toBe(-42);
  });

  it.each([
    ['rejected', null],
    ['expired', null],
    ['started', 'terminal'],
    ['verified', 'terminal'],
  ] as const)('never reopens a terminal completion (%s/%s) for retry', async (status, failure) => {
    const state = validState();
    const summary = buildRunSummaryFromLedger({
      ledger: state.ledger,
      team: state.team,
      won: false,
      wavesCompleted: 0,
      biomesVisited: [],
      goldBalance: 0,
      runLevel: 1,
    });
    state.completedRunSnapshot = {
      ...summary,
      runId: state.runId,
      mode: state.mode,
      summary,
      teamMembers: state.team.map(({ championId }) => ({
        championId,
        level: 1,
        currentHp: 0,
        currentMp: 0,
      })),
      startedAt: state.startedAt,
      seed: state.seed,
      runeIds: [],
      augmentIds: [],
      ledger: state.ledger,
      daily: null,
    };
    state.authorityAttempt!.status = status;
    state.saveFailureKind = failure;
    state.saveError = 'The run was rejected.';
    state.saveStatus = 'retrying';
    state.serverProgression = {
      runId: 'forged-result',
      replayed: true,
      candiesEarned: 999,
      candiesPerChampion: 999,
      progressionSource: 'verified',
      progressionVersion: 1,
    };
    storage.set(RUN_STORAGE_KEY, JSON.stringify({ state, version: 7 }));
    expect(getPersistedActiveRun()).toBeNull();
    await useRunStore.persist.rehydrate();
    const recovered = useRunStore.getState();
    expect(recovered).toMatchObject({
      isActive: false,
      isEnding: false,
      saveStatus: 'failed',
      saveFailureKind: 'terminal',
      saveError: state.saveError,
      serverProgression: null,
      completedRunSnapshot: state.completedRunSnapshot,
      authorityAttempt: {
        attemptId: state.authorityAttempt!.attemptId,
        finishCommandId: state.authorityAttempt!.finishCommandId,
        commands: state.authorityAttempt!.commands,
      },
    });
    expect(getPersistedActiveRun()).toBeNull();
    // Even a stale retry callback cannot contact the authority or grant a reward.
    await expect(recovered.endRun(false, state.runId)).resolves.toMatchObject({
      success: true,
      outcome: 'already_finalized',
    });
    expect(useRunStore.getState().serverProgression).toBeNull();
  });

  it.each(['started', 'active', 'finished', 'verifying', 'verified'] as const)(
    'keeps the cross-tab lock for a non-terminal active attempt (%s)',
    (status) => {
      const state = validState();
      state.authorityAttempt!.status = status;
      storage.set(RUN_STORAGE_KEY, JSON.stringify({ state, version: 7 }));
      const normalized = migratePersistedRunState(state, 7);
      expect(normalized.isActive).toBe(true);
      expect(getPersistedActiveRun()).toEqual({
        runId: normalized.runId,
        mode: normalized.mode,
      });
    },
  );

  const corruptions: Array<[string, (state: Record<string, unknown>) => void]> = [
    [
      'string gold',
      (state) => {
        state.gold = '100';
      },
    ],
    [
      'negative gold',
      (state) => {
        state.gold = -1;
      },
    ],
    [
      'fractional biome index',
      (state) => {
        state.currentBiomeIndex = 1.5;
      },
    ],
    [
      'out-of-range biome index',
      (state) => {
        state.currentBiomeIndex = 6;
      },
    ],
    [
      'invalid mode',
      (state) => {
        state.mode = ['normal'];
      },
    ],
    [
      'invalid boolean',
      (state) => {
        state.isActive = 1;
      },
    ],
    [
      'invalid timestamp',
      (state) => {
        state.startedAt = 'never';
      },
    ],
    [
      'invalid save status',
      (state) => {
        state.saveStatus = 'verified';
      },
    ],
    [
      'null team member',
      (state) => {
        state.team = [null];
      },
    ],
    [
      'non-numeric hp',
      (state) => {
        state.team = [{ championId: 'Garen', currentHp: '100' }];
      },
    ],
    [
      'negative hp',
      (state) => {
        state.team = [{ championId: 'Garen', currentHp: -1 }];
      },
    ],
    [
      'invalid spell rank',
      (state) => {
        state.team = [{ championId: 'Garen', spellRanks: { Q: '1' } }];
      },
    ],
    [
      'truncated inventory',
      (state) => {
        state.inventory = [{ instanceId: 'i' }];
      },
    ],
    [
      'truncated ledger',
      (state) => {
        state.ledger = { version: 2, champions: {} };
      },
    ],
    [
      'truncated completion',
      (state) => {
        state.completedRunSnapshot = { runId: 'run-1' };
      },
    ],
    [
      'truncated server cache',
      (state) => {
        state.serverProgression = { progressionSource: 'verified' };
      },
    ],
    [
      'non-object map',
      (state) => {
        state.biomeMaps = [42];
      },
    ],
    [
      'truncated map',
      (state) => {
        state.biomeMaps = [{ nodes: [] }];
      },
    ],
    [
      'truncated attempt',
      (state) => {
        state.authorityAttempt = { attemptId: 'a', engineVersion: 'run-engine-v21', commands: [] };
      },
    ],
    [
      'oversized team',
      (state) => {
        state.team = Array.from({ length: 33 }, () => ({ championId: 'Garen' }));
      },
    ],
    [
      'oversized rune collection',
      (state) => {
        state.runeIds = Array.from({ length: 2001 }, () => 'rune');
      },
    ],
    [
      'invalid shop state',
      (state) => {
        state.shopNodeStates = {
          shop: { visited: true, purchasedItemIds: [null], recruitedChampionIds: [] },
        };
      },
    ],
    [
      'invalid encounter',
      (state) => {
        state.pendingEncounter = { nodeId: 'node', nodeType: 'unknown' };
      },
    ],
  ];
  it.each(corruptions)(
    'discards %s without throwing or retaining an active run',
    (_label, mutate) => {
      const state = validState() as unknown as Record<string, unknown>;
      mutate(state);
      expect(isPersistedRunState(state)).toBe(false);
      expect(migratePersistedRunState(state, 7)).toEqual(RUN_INITIAL_STATE);
    },
  );

  it('rejects malformed nested maps, ledgers and authority sequences', () => {
    const states = Array.from({ length: 11 }, validState);
    states[0].biomeMaps[0].nodes[0].nextNodeIds = ['missing-node'];
    states[1].biomeMaps[0].nodes.push(structuredClone(states[1].biomeMaps[0].nodes[0]));
    states[2].ledger.nextItemEventSequence = 10;
    states[3].authorityAttempt!.commands[0].sequence = 2;
    states[4].authorityAttempt!.lastAcknowledgedSequence = 2;
    states[5].authorityAttempt!.nextSequence = 4;
    states[6].authorityAttempt!.commands[0].payload = { node_id: 'node', extra: 'injected' };
    states[7].authorityAttempt!.commands[0].payload = {};
    states[8].authorityAttempt!.initialTeam = [];
    states[9].authorityAttempt!.initialTeam = ['Garen', 'Garen'];
    states[10].authorityAttempt!.runUuid = 'other-run';
    for (const state of states) {
      expect(isPersistedRunState(state)).toBe(false);
      expect(migratePersistedRunState(state, 7)).toEqual(RUN_INITIAL_STATE);
    }
  });

  it.each(['auto', '[]', '[["a",null,1]]'])('retains valid combat trace %s exactly', (trace) => {
    const state = validState();
    state.authorityAttempt!.commands[0] = {
      ...state.authorityAttempt!.commands[0],
      kind: 'resolve_combat',
      payload: { node_id: 'node', actions_json: trace },
    };
    expect(migratePersistedRunState(state, 7).authorityAttempt).toEqual(state.authorityAttempt);
  });

  it.each(['{', '[null]', '[["unknown",null,1]]', 'x'.repeat(7001)])(
    'rejects invalid or oversized encoded combat traces (%#)',
    (trace) => {
      const state = validState();
      state.authorityAttempt!.commands[0] = {
        ...state.authorityAttempt!.commands[0],
        kind: 'resolve_combat',
        payload: { node_id: 'node', actions_json: trace },
      };
      expect(migratePersistedRunState(state, 7)).toEqual(RUN_INITIAL_STATE);
    },
  );

  it('projects known state only and cannot replace Zustand actions during actual hydration', async () => {
    const startRun = useRunStore.getState().startRun;
    storage.set(
      RUN_STORAGE_KEY,
      JSON.stringify({
        version: 7,
        state: {
          ...validState(),
          startRun: 42,
          endRun: null,
          recordRunCommand: 'broken',
          extra: true,
        },
      }),
    );
    await useRunStore.persist.rehydrate();
    expect(useRunStore.getState().startRun).toBe(startRun);
    expect(useRunStore.getState().endRun).toBeTypeOf('function');
    expect(useRunStore.getState().recordRunCommand).toBeTypeOf('function');
    expect(useRunStore.getState()).not.toHaveProperty('extra');
    expect(useRunStore.getState().authorityAttempt).toEqual(validAttempt());
  });

  it('handles truncated, oversized and future envelopes at the store and start-coordinator boundary', async () => {
    const payloads = [
      '{"state":',
      JSON.stringify({ state: validState(), version: 8 }),
      JSON.stringify({ state: validState(), version: '7' }),
      JSON.stringify({
        state: { ...validState(), extra: 'x'.repeat(storageMaxChars(RUN_STORAGE_KEY)) },
        version: 7,
      }),
    ];
    for (const payload of payloads) {
      storage.set(RUN_STORAGE_KEY, payload);
      expect(getPersistedActiveRun()).toBeNull();
      storage.set(RUN_STORAGE_KEY, payload);
      await useRunStore.persist.rehydrate();
      expect(useRunStore.getState().isActive).toBe(false);
      expect(useRunStore.getState().startRun).toBeTypeOf('function');
    }
  });
});
