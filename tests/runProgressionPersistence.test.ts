import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { buildRunPlayerTeam } from '@/game/run/runCombatant';
import { migratePersistedRunState, RUN_STORAGE_KEY } from '@/game/run/runPersistence';
import { isPersistedRunState } from '@/game/run/runPersistenceValidation';
import { normalizeTeamMembers } from '@/game/run/teamRules';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { RunState } from '@/types/run';

const key = 'veigar.phenomenal_power';
function activeState(): RunState {
  const biomeMaps = generateRunMap(2);
  return {
    ...structuredClone(RUN_INITIAL_STATE),
    isActive: true,
    runId: 'veigar-persistence-run',
    seed: 2,
    startedAt: '2026-10-09T12:00:00.000Z',
    team: [{ championId: 'Veigar', level: 2, runProgress: { [key]: 7 } }],
    biomeMaps,
    currentBiome: biomeMaps[0]!.biome,
    frontierNodeIds: [biomeMaps[0]!.startNodeId],
  };
}

describe('run counter persistence', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (name: string) => storage.get(name) ?? null,
      setItem: (name: string, value: string) => storage.set(name, value),
      removeItem: (name: string) => storage.delete(name),
    });
    useRunStore.setState(structuredClone(RUN_INITIAL_STATE));
  });
  afterEach(() => {
    useRunStore.setState(structuredClone(RUN_INITIAL_STATE));
    vi.unstubAllGlobals();
  });

  it('rehydrates a schema-v7 cache and rebuilds its exact combat bonus', async () => {
    const state = activeState();
    expect(isPersistedRunState(state)).toBe(true);
    storage.set(RUN_STORAGE_KEY, JSON.stringify({ version: 7, state }));
    await useRunStore.persist.rehydrate();
    const restored = useRunStore.getState().team[0]!;
    expect(restored.runProgress).toEqual({ [key]: 7 });
    const rules = {
      inventory: [],
      augmentIds: [],
      currentBiomeIndex: 0,
      getUnlockedEnhancements: () => ({}),
      getMasteryLevel: () => 0,
    };
    const oldRun = buildRunPlayerTeam([restored], rules)[0]!;
    const nextRun = buildRunPlayerTeam(
      [{ championId: 'Veigar', level: restored.level }],
      rules,
    )[0]!;
    expect(oldRun.getEnhancedStats().abilityPower - nextRun.getEnhancedStats().abilityPower).toBe(
      7,
    );
    expect(nextRun.getRunCounter(key)).toBe(0);
  });

  it('keeps pre-counter saves compatible and does not add empty fields', () => {
    const state = activeState();
    delete state.team[0]!.runProgress;
    expect(isPersistedRunState(state)).toBe(true);
    const restored = migratePersistedRunState(state, 7);
    expect(restored.team[0]).not.toHaveProperty('runProgress');
    expect(
      normalizeTeamMembers([{ championId: 'Veigar', runProgress: { [key]: 0 } }])[0],
    ).not.toHaveProperty('runProgress');
  });

  it.each([
    { [key]: -1 },
    { [key]: 0.5 },
    { [key]: 201 },
    { [key]: Number.MAX_SAFE_INTEGER + 1 },
    { 'other.counter': 5 },
    JSON.parse('{"veigar.__proto__":1}'),
    [],
    null,
  ])('rejects malformed or undeclared persisted counters (%j)', (progress) => {
    const state = activeState();
    state.team[0]!.runProgress = progress as Record<string, number>;
    expect(isPersistedRunState(state)).toBe(false);
    expect(migratePersistedRunState(state, 7).isActive).toBe(false);
  });

  it('rejects counters on champions whose kit does not declare them', () => {
    const state = activeState();
    state.team[0]!.championId = 'Garen';
    expect(isPersistedRunState(state)).toBe(false);
  });

  it('clones progression on domain updates and gives a recruited champion a fresh counter', () => {
    const progress = { [key]: 7 };
    useRunStore.setState({
      ...activeState(),
      team: [{ championId: 'Veigar' }, { championId: 'Garen' }],
    });
    useRunStore
      .getState()
      .updateTeamAfterCombat([
        { championId: 'Veigar', level: 2, currentXp: 50, runProgress: progress },
      ]);
    progress[key] = 200;
    expect(useRunStore.getState().team[0]!.runProgress).toEqual({ [key]: 7 });
    useRunStore.getState().removeChampion('Veigar');
    expect(useRunStore.getState().addChampion('Veigar', 1).success).toBe(true);
    expect(
      useRunStore.getState().team.find((member) => member.championId === 'Veigar'),
    ).not.toHaveProperty('runProgress');
  });
});
