// @vitest-environment jsdom

import type { User } from '@supabase/supabase-js';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CombatPage } from '@/pages/CombatPage';
import { runStatsTracker } from '@/services/RunStatsTracker';
import { useAuthStore } from '@/stores/authStore';
import { useBattleStore } from '@/stores/battleStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import { ROUTES } from '@/config/routes';
import type { FinalCombatantState } from '@/types/run';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

const combatMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  onComplete: null as
    | null
    | ((winner: 'player' | 'enemy' | 'draw', finalPlayerStates: FinalCombatantState[]) => void),
  finalPlayerStates: [] as FinalCombatantState[],
}));

vi.mock('@/audio', () => ({
  playUIClick: vi.fn(),
}));

vi.mock('@/hooks/useAppNavigate', () => ({
  useAppNavigate: () => combatMocks.navigate,
}));

vi.mock('@/hooks/useBattleManager', () => ({
  useBattleManager: (options: {
    onComplete?: (
      winner: 'player' | 'enemy' | 'draw',
      finalPlayerStates: FinalCombatantState[],
    ) => void;
  }) => {
    combatMocks.onComplete = options.onComplete ?? null;
    return {
      processTurn: vi.fn(),
      submitAction: vi.fn(),
      getAvailableActions: vi.fn(() => []),
      getFinalPlayerStates: vi.fn(() => []),
      getManager: vi.fn(() => ({
        getFinalPlayerStates: () => combatMocks.finalPlayerStates,
      })),
    };
  },
}));

vi.mock('@/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: vi.fn(),
}));

vi.mock('@/hooks/useRunImagePreload', () => ({
  useRunImagePreload: vi.fn(),
}));

vi.mock('@/components/CombatUI/AbilityBar', () => ({ AbilityBar: () => null }));
vi.mock('@/components/CombatUI/BattleSpeedControl', () => ({ BattleSpeedControl: () => null }));
vi.mock('@/components/CombatUI/CombatantPortrait', () => ({ CombatantPortrait: () => null }));
vi.mock('@/components/CombatUI/CombatLog', () => ({ CombatLog: () => null }));
vi.mock('@/components/CombatUI/TurnIndicator', () => ({ TurnIndicator: () => null }));

const RUN_UUID = 'attempt_22222222-2222-4222-8222-222222222222';
const realEndRun = useRunStore.getState().endRun;

function attempt(): RunAuthorityAttempt {
  return {
    attemptId: '11111111-1111-4111-8111-111111111111',
    runUuid: RUN_UUID,
    ownerUserId: 'user-1',
    seed: 42,
    rulesetVersion: 1,
    engineVersion: 'run-engine-v1',
    difficulty: 'normal',
    mode: 'normal',
    initialTeam: ['Garen'],
    runeIds: [],
    enhancementSnapshot: { Garen: {} },
    startedAt: '2026-07-23T12:00:00.000Z',
    expiresAt: '2026-07-24T12:00:00.000Z',
    status: 'started',
    commands: [],
    nextSequence: 1,
    lastAcknowledgedSequence: 0,
    journalHash: 'initial-hash',
    finishCommandId: null,
  };
}

describe('CombatPage authority finalization', () => {
  beforeEach(() => {
    combatMocks.navigate.mockReset();
    combatMocks.onComplete = null;
    combatMocks.finalPlayerStates = [];
    runStatsTracker.reset();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    useAuthStore.setState({
      isAuthenticated: true,
      isGuest: false,
      user: { id: 'user-1' } as User,
    });
    useBattleStore.getState().resetBattle();
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: RUN_UUID,
      seed: 42,
      startedAt: '2026-07-23T12:00:00.000Z',
      authorityAttempt: attempt(),
      team: [{ championId: 'Garen' }],
      currentBiome: 'top_lane',
      currentBiomeIndex: 0,
      currentNodeId: 'fight',
      pendingEncounter: { nodeId: 'fight', nodeType: 'combat' },
      currentEncounter: {
        id: 'fight',
        name: 'Fight',
        description: 'Fight',
        type: 'combat',
        minRunLevel: 1,
        enemies: [{ championId: 'Garen', statMultiplier: 1 }],
        goldReward: 50,
        itemDropChance: 0,
      },
      endRun: vi.fn().mockResolvedValue(true),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    runStatsTracker.reset();
    useBattleStore.getState().resetBattle();
    useRunStore.setState({ ...RUN_INITIAL_STATE, endRun: realEndRun });
    useAuthStore.setState({
      isAuthenticated: false,
      isGuest: false,
      user: null,
    });
  });

  it('persists before navigation and route unmount cannot cancel finalization', async () => {
    let resolveSave: ((saved: boolean) => void) | undefined;
    const endRun = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    useRunStore.setState({ endRun });
    const view = render(<CombatPage />);
    expect(combatMocks.onComplete).not.toBeNull();

    act(() => {
      combatMocks.onComplete?.('enemy', [
        { championId: 'Garen', currentHp: 0, maxHp: 620, currentMp: 17, maxMp: 100 },
      ]);
    });

    expect(endRun).toHaveBeenCalledWith(false, RUN_UUID, expect.objectContaining({ won: false }));
    expect(combatMocks.navigate).not.toHaveBeenCalled();
    expect(useRunStore.getState().team[0]).toMatchObject({ currentHp: 0, currentMp: 17 });
    view.unmount();

    await act(async () => {
      resolveSave?.(true);
      await Promise.resolve();
    });

    expect(combatMocks.navigate).toHaveBeenCalledWith(
      ROUTES.GAME_OVER,
      expect.objectContaining({ state: expect.any(Object) }),
    );
    expect(endRun).toHaveBeenCalledTimes(1);
  });

  it('keeps pre-combat HP persisted until the delayed completion callback runs', () => {
    useRunStore.setState({ team: [{ championId: 'Garen', currentHp: 400 }] });
    combatMocks.finalPlayerStates = [
      { championId: 'Garen', currentHp: 12, maxHp: 620, currentMp: 8, maxMp: 100 },
    ];
    useBattleStore.setState({
      phase: 'finished',
      winner: 'player',
      playerTeam: [
        {
          id: 'Garen',
          name: 'Garen',
          level: 1,
          currentHp: 12,
          maxHp: 620,
          currentMp: 0,
          maxMp: 0,
          iconUrl: '',
          isDefeated: false,
          side: 'player',
          spells: [],
        },
      ],
    });

    const view = render(<CombatPage />);

    expect(combatMocks.onComplete).not.toBeNull();
    expect(useRunStore.getState().team[0]?.currentHp).toBe(400);
    expect(
      useRunStore
        .getState()
        .authorityAttempt?.commands.some((command) => command.kind === 'resolve_combat'),
    ).toBe(false);
    view.unmount();
  });

  it('uses the completed manager snapshot even if the global battle store is replaced', () => {
    useRunStore.setState({ team: [{ championId: 'Garen', currentHp: 400 }] });
    const view = render(<CombatPage />);
    const completedCallback = combatMocks.onComplete;
    expect(completedCallback).not.toBeNull();

    act(() => {
      useBattleStore.setState({
        playerTeam: [
          {
            id: 'Garen',
            name: 'Different combat',
            level: 1,
            currentHp: 333,
            maxHp: 620,
            currentMp: 0,
            maxMp: 0,
            iconUrl: '',
            isDefeated: false,
            side: 'player',
            spells: [],
          },
        ],
      });
    });
    act(() => {
      completedCallback?.('player', [
        { championId: 'Garen', currentHp: 12, maxHp: 620, currentMp: 8, maxMp: 100 },
      ]);
    });

    expect(useRunStore.getState().team[0]?.currentHp).toBe(12);
    expect(useRunStore.getState().team[0]?.currentMp).toBe(8);
    view.unmount();
  });
});
