// @vitest-environment jsdom

import type { User } from '@supabase/supabase-js';
import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeType } from '@/game/map/types';
import type { CombatActionTrace } from '@/game/battle/actionTrace';
import { ActionType } from '@/game/battle/types';
import { CombatPage } from '@/pages/CombatPage';
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
    | ((
        winner: 'player' | 'enemy' | 'draw',
        finalPlayerStates: FinalCombatantState[],
        consumedItemInstanceIds?: string[],
        runeStacks?: Record<string, Record<string, number>>,
        playerActionTrace?: CombatActionTrace,
      ) => void),
  finalPlayerStates: [] as FinalCombatantState[],
  autoPlay: null as boolean | null,
  processTurn: vi.fn(),
}));

vi.mock('@/audio', () => ({
  playUIClick: vi.fn(),
}));

vi.mock('@/hooks/useAppNavigate', () => ({
  useAppNavigate: () => combatMocks.navigate,
}));

vi.mock('@/hooks/useBattleManager', () => ({
  useBattleManager: (options: {
    autoPlay?: boolean;
    onComplete?: (
      winner: 'player' | 'enemy' | 'draw',
      finalPlayerStates: FinalCombatantState[],
      consumedItemInstanceIds?: string[],
      runeStacks?: Record<string, Record<string, number>>,
      playerActionTrace?: CombatActionTrace,
    ) => void;
  }) => {
    combatMocks.onComplete = options.onComplete ?? null;
    combatMocks.autoPlay = options.autoPlay ?? null;
    return {
      processTurn: combatMocks.processTurn,
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

function attempt(engineVersion = 'run-engine-v1'): RunAuthorityAttempt {
  return {
    attemptId: '11111111-1111-4111-8111-111111111111',
    runUuid: RUN_UUID,
    ownerUserId: 'user-1',
    seed: 42,
    rulesetVersion: 1,
    engineVersion,
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
    combatMocks.autoPlay = null;
    combatMocks.processTurn.mockReset();
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
      frontierNodeIds: [],
      chosenPathNodeIds: ['fight'],
      biomeMaps: [
        {
          biome: 'top_lane',
          startNodeId: 'fight',
          exitNodeId: 'fight',
          columns: 1,
          rows: 1,
          nodes: [
            {
              id: 'fight',
              type: NodeType.Combat,
              column: 0,
              row: 0,
              nextNodeIds: [],
              prevNodeIds: [],
              biome: 'top_lane',
              completed: false,
              accessible: false,
              encounter: {
                id: 'fight',
                name: 'Fight',
                description: 'Fight',
                type: 'combat',
                minRunLevel: 1,
                enemies: [{ championId: 'Garen', statMultiplier: 1 }],
                goldReward: 50,
                itemDropChance: 0,
              },
              metadata: { title: 'Fight', description: 'Fight', icon: '⚔️' },
            },
          ],
        },
      ],
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
      endRun: vi.fn().mockResolvedValue({
        success: true,
        runId: RUN_UUID,
        outcome: 'saved',
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useBattleStore.getState().resetBattle();
    useRunStore.setState({ ...RUN_INITIAL_STATE, endRun: realEndRun });
    useAuthStore.setState({
      isAuthenticated: false,
      isGuest: false,
      user: null,
    });
  });

  it('persists before navigation and route unmount cannot cancel finalization', async () => {
    let resolveSave: ((saved: Awaited<ReturnType<typeof realEndRun>>) => void) | undefined;
    const endRun = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof realEndRun>>>((resolve) => {
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
      resolveSave?.({ success: true, runId: RUN_UUID, outcome: 'saved' });
      await Promise.resolve();
    });

    expect(combatMocks.navigate).toHaveBeenCalledWith(
      ROUTES.GAME_OVER,
      expect.objectContaining({ state: expect.any(Object) }),
    );
    expect(endRun).toHaveBeenCalledTimes(1);
  });

  it('starts a guest combat in manual mode and toggles auto once from the focused button', async () => {
    const user = userEvent.setup();
    useAuthStore.setState({
      isAuthenticated: true,
      isGuest: true,
      user: null,
    });
    useRunStore.setState({ authorityAttempt: null });

    const view = render(<CombatPage />);
    const autoToggle = view.getByRole('button', { name: 'Activer le mode automatique' });

    expect(autoToggle).toHaveTextContent('Auto : OFF');
    expect(combatMocks.autoPlay).toBe(false);

    autoToggle.focus();
    await user.keyboard(' ');

    expect(autoToggle).toHaveTextContent('Auto : ON');
    expect(combatMocks.autoPlay).toBe(true);
  });

  it.each([
    'run-engine-v3',
    'run-engine-v4',
    'run-engine-v5',
    'run-engine-v6',
    'run-engine-v7',
    'run-engine-v8',
    'run-engine-v9',
  ])(
    'starts a %s verified combat with auto off and journals its manual action trace',
    (engineVersion) => {
      useRunStore.setState({ authorityAttempt: attempt(engineVersion) });
      const view = render(<CombatPage />);

      const autoToggle = view.getByRole('button', { name: 'Activer le mode automatique' });
      expect(autoToggle).toBeEnabled();
      expect(autoToggle).toHaveTextContent('Auto : OFF');
      expect(combatMocks.autoPlay).toBe(false);

      act(() => {
        combatMocks.onComplete?.(
          'enemy',
          [{ championId: 'Garen', currentHp: 0, maxHp: 620, currentMp: 0, maxMp: 100 }],
          [],
          {},
          [{ type: ActionType.SpellQ, targetId: 'enemy:Garen:0', automatic: false }],
        );
      });

      expect(
        useRunStore
          .getState()
          .authorityAttempt?.commands.find((command) => command.kind === 'resolve_combat')?.payload,
      ).toEqual({
        node_id: 'fight',
        actions_json: '[["q","enemy:Garen:0",0]]',
      });
    },
  );

  it('lets the player enable autoplay in the current verified engine', async () => {
    const user = userEvent.setup();
    useRunStore.setState({ authorityAttempt: attempt('run-engine-v9') });
    const view = render(<CombatPage />);
    const autoToggle = view.getByRole('button', { name: 'Activer le mode automatique' });

    expect(autoToggle).toBeEnabled();
    expect(autoToggle).toHaveTextContent('Auto : OFF');
    expect(combatMocks.autoPlay).toBe(false);

    await user.click(autoToggle);

    expect(autoToggle).toHaveTextContent('Auto : ON');
    expect(autoToggle).toHaveAccessibleName('Désactiver le mode automatique');
    expect(combatMocks.autoPlay).toBe(true);
  });

  it('waits on a manual player decision and visibly delays the following enemy turn', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({
      isAuthenticated: true,
      isGuest: true,
      user: null,
    });
    useRunStore.setState({ authorityAttempt: null });
    useBattleStore.setState({
      phase: 'turn_active',
      round: 1,
      currentTurnChampionId: 'player:Garen:0',
      currentTurnSide: 'player',
      isPlayerTurn: true,
    });

    const view = render(<CombatPage />);

    expect(
      view.getByText('Mode manuel — choisissez une action ou appuyez sur Espace.'),
    ).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(combatMocks.processTurn).not.toHaveBeenCalled();

    act(() => {
      useBattleStore.getState().setTurnInfo(1, 'enemy:Garen:0', 'enemy');
    });
    expect(view.getByText('Action ennemie dans 1.2 s')).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(combatMocks.processTurn).toHaveBeenCalledTimes(1);
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
          targetId: 'Garen',
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
            targetId: 'Garen',
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
