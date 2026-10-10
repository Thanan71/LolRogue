// @vitest-environment jsdom

import type { User } from '@supabase/supabase-js';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationRegion } from '@/components/NotificationRegion';
import { createRunLedger } from '@/game/run/runLedger';
import { fr } from '@/i18n/fr';
import { GameOverPage } from '@/pages/GameOverPage';
import { runAuthorityService } from '@/services/runAuthorityService';
import { runLifecycleService } from '@/services/runLifecycleService';
import { useAuthStore } from '@/stores/authStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { CompletedRunSnapshot, RunSummary, ServerRunProgression } from '@/types/run';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

vi.mock('@/audio', () => ({ playSFX: vi.fn(), playUIClick: vi.fn() }));

const USER_ID = 'user-1';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
type RecoveryResult = Awaited<ReturnType<typeof runAuthorityService.recoverAttempt>>;

function savedCompletion(): CompletedRunSnapshot {
  const summary: RunSummary = {
    won: true,
    runLevel: 2,
    wavesCompleted: 3,
    biomesVisited: ['top_lane'],
    goldEarned: 100,
    goldSpent: 25,
    goldBalance: 75,
    itemEvents: [],
    totalKills: 1,
    totalDamage: 250,
    championStats: [],
  };
  return {
    mode: 'normal',
    runId: RUN_ID,
    won: true,
    runLevel: 2,
    wavesCompleted: 3,
    biomesVisited: ['top_lane'],
    goldEarned: 100,
    goldSpent: 25,
    goldBalance: 75,
    ledger: createRunLedger(['Garen']),
    summary,
    teamMembers: [{ championId: 'Garen', level: 1, currentHp: 100, currentMp: 0 }],
    startedAt: '2026-10-10T12:00:00.000Z',
    seed: 42,
    runeIds: [],
    augmentIds: [],
    daily: null,
  };
}

function verifiedAttempt(): RunAuthorityAttempt {
  return {
    attemptId: ATTEMPT_ID,
    runUuid: RUN_ID,
    ownerUserId: USER_ID,
    seed: 42,
    rulesetVersion: 1,
    engineVersion: 'run-engine-v22',
    difficulty: 'normal',
    mode: 'normal',
    initialTeam: ['Garen'],
    runeIds: [],
    enhancementSnapshot: { Garen: {} },
    startedAt: '2026-10-10T12:00:00.000Z',
    expiresAt: '2026-10-11T12:00:00.000Z',
    status: 'verified',
    commands: [],
    nextSequence: 1,
    lastAcknowledgedSequence: 0,
    journalHash: 'persisted-journal-hash',
    finishCommandId: '33333333-3333-4333-8333-333333333333',
  };
}

const progression: ServerRunProgression = {
  runId: RUN_ID,
  replayed: true,
  candiesEarned: 13,
  candiesPerChampion: 13,
  progressionVersion: 1,
  progressionSource: 'verified',
};

describe('saved run recovery presentation', () => {
  let finishRecovery: (() => void) | null = null;

  beforeEach(() => {
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: RUN_ID,
      saveStatus: 'recovering',
      completedRunSnapshot: savedCompletion(),
      authorityAttempt: verifiedAttempt(),
      team: [{ championId: 'Garen', level: 1, currentHp: 100 }],
    });
    useAuthStore.setState({
      ...useAuthStore.getInitialState(),
      user: { id: USER_ID } as User,
      isAuthenticated: true,
      isGuest: false,
      authStatus: 'bootstrapping',
    });
    useEnhancementStore.setState({ error: null });
    vi.spyOn(runLifecycleService, 'refreshVerifiedProgression').mockResolvedValue();
    vi.spyOn(runAuthorityService, 'appendCommands');
    vi.spyOn(runAuthorityService, 'sealAttempt');
    vi.spyOn(runAuthorityService, 'verifyAttempt');
  });

  afterEach(async () => {
    cleanup();
    finishRecovery?.();
    const finalization = runLifecycleService.getFinalization();
    if (finalization) {
      await finalization.promise;
      runLifecycleService.clearFinalization(finalization.promise);
    }
    finishRecovery = null;
    vi.restoreAllMocks();
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    useAuthStore.setState(useAuthStore.getInitialState());
  });

  function deferReceipt() {
    const receipt = new Promise<RecoveryResult>((resolve) => {
      finishRecovery = () =>
        resolve({ data: { progression, summary: savedCompletion().summary }, error: null });
    });
    return vi.spyOn(runAuthorityService, 'recoverAttempt').mockReturnValue(receipt);
  }

  function expectReadOnlyRecovery() {
    expect(runAuthorityService.appendCommands).not.toHaveBeenCalled();
    expect(runAuthorityService.sealAttempt).not.toHaveBeenCalled();
    expect(runAuthorityService.verifyAttempt).not.toHaveBeenCalled();
  }

  it('waits for authentication readiness and then reads the receipt without presenting a save failure', async () => {
    const recover = deferReceipt();
    render(<NotificationRegion />);

    expect(screen.getByRole('status')).toHaveTextContent(fr.gameOver.recovering);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: fr.notifications.retrySave }),
    ).not.toBeInTheDocument();
    expect(recover).not.toHaveBeenCalled();

    act(() => useAuthStore.setState({ authStatus: 'profileLoading', isInitialized: true }));
    expect(recover).not.toHaveBeenCalled();

    act(() => useAuthStore.setState({ authStatus: 'ready', isLoading: false }));
    await waitFor(() => expect(recover).toHaveBeenCalledExactlyOnceWith(ATTEMPT_ID));
    expect(screen.getByRole('status')).toHaveTextContent(fr.gameOver.recovering);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expectReadOnlyRecovery();

    await act(async () => {
      finishRecovery?.();
      await runLifecycleService.getFinalization()?.promise;
    });
    expect(screen.getByRole('status')).toHaveTextContent(fr.notifications.runSaved);
    expect(useRunStore.getState().serverProgression).toEqual(progression);
    expect(useRunStore.getState().saveStatus).toBe('saved');
  });

  it('deduplicates StrictMode effects while recovering on Game Over with global save notifications hidden', async () => {
    const recover = deferReceipt();
    useAuthStore.setState({ authStatus: 'ready', isInitialized: true, isLoading: false });

    const view = render(
      <StrictMode>
        <MemoryRouter initialEntries={['/game-over']}>
          <NotificationRegion showRunSaveNotifications={false} />
          <GameOverPage />
        </MemoryRouter>
      </StrictMode>,
    );
    await waitFor(() => expect(recover).toHaveBeenCalledExactlyOnceWith(ATTEMPT_ID));
    expect(screen.getByRole('status')).toHaveTextContent(fr.gameOver.recovering);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: fr.gameOver.newRun })).toBeDisabled();
    expect(screen.getByRole('button', { name: fr.gameOver.mainMenu })).toBeDisabled();

    view.rerender(
      <StrictMode>
        <MemoryRouter initialEntries={['/game-over']}>
          <NotificationRegion showRunSaveNotifications={false} />
          <GameOverPage />
        </MemoryRouter>
      </StrictMode>,
    );
    expect(recover).toHaveBeenCalledTimes(1);
    expectReadOnlyRecovery();

    await act(async () => {
      finishRecovery?.();
      await runLifecycleService.getFinalization()?.promise;
    });
    expect(screen.getByRole('status')).toHaveTextContent(fr.gameOver.verifiedSaved);
    expect(screen.getByTestId('server-progression')).toBeVisible();
    expect(screen.getByRole('button', { name: fr.gameOver.newRun })).toBeEnabled();
    expect(screen.getByRole('button', { name: fr.gameOver.mainMenu })).toBeEnabled();
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it.each(['guest', 'signedOut'] as const)(
    'does not recover a verified receipt in the %s auth state',
    (authStatus) => {
      const recover = deferReceipt();
      useAuthStore.setState({
        authStatus,
        user: null,
        isAuthenticated: false,
        isGuest: authStatus === 'guest',
      });
      render(<NotificationRegion />);

      expect(recover).not.toHaveBeenCalled();
      expect(useRunStore.getState().saveStatus).toBe('recovering');
      expect(useRunStore.getState().serverProgression).toBeNull();
      expectReadOnlyRecovery();
    },
  );
});
