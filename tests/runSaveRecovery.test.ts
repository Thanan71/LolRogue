import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRunSummaryFromLedger, cloneRunLedger, createRunLedger } from '@/game/run/runLedger';
import { useAuthStore } from '@/stores/authStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { Player } from '@/types/models';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

const attemptMocks = vi.hoisted(() => {
  class RejectedError extends Error {
    readonly terminal = true;

    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'RunVerificationRejectedError';
    }
  }

  return {
    start: vi.fn(),
    append: vi.fn(),
    seal: vi.fn(),
    verify: vi.fn(),
    recover: vi.fn(),
    RejectedError,
  };
});
const getChampionMastery = vi.hoisted(() => vi.fn());

vi.mock('@/services/runAttemptService', () => ({
  startRunAttempt: attemptMocks.start,
  appendRunAttemptCommands: attemptMocks.append,
  sealRunAttempt: attemptMocks.seal,
  verifyRunAttempt: attemptMocks.verify,
  recoverVerifiedRunAttempt: attemptMocks.recover,
  RunVerificationRejectedError: attemptMocks.RejectedError,
}));

vi.mock('@/services/container', () => ({
  RepositoryContainerFactory: {
    create: () => ({
      auth: { onAuthStateChange: vi.fn() },
      mastery: { getChampionMastery },
    }),
  },
}));

vi.mock('@/services/supabaseClient', () => ({ supabase: {} }));

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_UUID = '22222222-2222-4222-8222-222222222222';

function authorityAttempt(overrides: Partial<RunAuthorityAttempt> = {}): RunAuthorityAttempt {
  return {
    attemptId: ATTEMPT_ID,
    runUuid: RUN_UUID,
    ownerUserId: 'user-1',
    seed: 4242,
    rulesetVersion: 1,
    engineVersion: 'run-engine-v1',
    difficulty: 'normal',
    mode: 'normal',
    initialTeam: ['Garen'],
    runeIds: ['press_the_attack'],
    enhancementSnapshot: { Garen: {} },
    startedAt: '2026-07-23T12:00:00.000Z',
    expiresAt: '2026-07-24T12:00:00.000Z',
    status: 'started',
    commands: [],
    nextSequence: 1,
    lastAcknowledgedSequence: 0,
    journalHash: 'initial-hash',
    finishCommandId: null,
    ...overrides,
  };
}

function setActiveVerifiedRun(): void {
  const ledger = createRunLedger(['Garen']);
  ledger.gold.earned = 120;
  useRunStore.setState({
    ...RUN_INITIAL_STATE,
    isActive: true,
    mode: 'normal',
    runId: RUN_UUID,
    seed: 4242,
    startedAt: '2026-07-23T12:00:00.000Z',
    authorityAttempt: authorityAttempt(),
    team: [{ championId: 'Garen', currentHp: 320, level: 2 }],
    runLevel: 2,
    biomesVisited: ['top_lane'],
    currentBiome: 'top_lane',
    runeIds: ['press_the_attack'],
    augmentIds: ['golden_touch'],
    gold: 120,
    currentWave: 4,
    totalWavesCompleted: 3,
    ledger,
  });
}

const progression = {
  runId: '33333333-3333-4333-8333-333333333333',
  replayed: false,
  candiesEarned: 13,
  candiesPerChampion: 13,
  progressionVersion: 1,
  progressionSource: 'verified' as const,
};

function verifiedStartResponse() {
  return {
    data: {
      attemptId: ATTEMPT_ID,
      runUuid: RUN_UUID,
      status: 'started' as const,
      rulesetVersion: 1,
      engineVersion: 'run-engine-v1',
      seed: 987654,
      mode: 'normal' as const,
      difficulty: 'normal' as const,
      initialTeam: ['Garen'],
      runeIds: [],
      enhancementSnapshot: { Garen: {} },
      startedAt: '2026-07-23T12:00:00.000Z',
      expiresAt: '2026-07-24T12:00:00.000Z',
      lastSequence: 0,
      journalHash: 'initial-hash',
      replayed: false,
    },
    error: null,
  };
}

describe('authoritative run lifecycle and recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChampionMastery.mockResolvedValue({ data: [], error: null });
    attemptMocks.append.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        status: 'started',
        lastSequence: 1,
        journalHash: 'journal-1',
        accepted: 1,
        replayed: false,
      },
      error: null,
    });
    attemptMocks.seal.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        runUuid: RUN_UUID,
        status: 'finished',
        lastSequence: 1,
        journalHash: 'journal-1',
        accepted: true,
        replayed: false,
      },
      error: null,
    });
    attemptMocks.verify.mockResolvedValue({
      data: { progression, summary: null },
      error: null,
    });
    attemptMocks.recover.mockResolvedValue({
      data: { progression: { ...progression, replayed: true }, summary: null },
      error: null,
    });
    useAuthStore.setState({
      authStatus: 'ready',
      isAuthenticated: true,
      isGuest: false,
      user: { id: 'user-1' } as User,
      player: { id: 'player-1' } as Player,
      refreshPlayer: vi.fn().mockResolvedValue(undefined),
    });
    setActiveVerifiedRun();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    useAuthStore.setState({
      isAuthenticated: false,
      isGuest: false,
      user: null,
      player: null,
    });
  });

  it('keeps a frozen snapshot and retries the same journal after a network failure', async () => {
    let releaseRetry:
      | ((value: {
          data: {
            attemptId: string;
            status: string;
            lastSequence: number;
            journalHash: string;
            accepted: number;
            replayed: boolean;
          };
          error: null;
        }) => void)
      | undefined;
    attemptMocks.append
      .mockResolvedValueOnce({ data: null, error: new TypeError('Failed to fetch') })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseRetry = resolve;
          }),
      );
    const ledger = cloneRunLedger(useRunStore.getState().ledger);
    ledger.champions.Garen.kills = 1;
    ledger.champions.Garen.damageDealt = 450;
    ledger.gold.earned = 120;
    useRunStore.setState({ ledger });
    const summary = buildRunSummaryFromLedger({
      ledger,
      team: useRunStore.getState().team,
      won: false,
      wavesCompleted: 3,
      biomesVisited: ['top_lane'],
      goldBalance: 120,
      runLevel: 2,
    });

    await expect(useRunStore.getState().endRun(false, RUN_UUID, summary)).resolves.toMatchObject({
      success: false,
      code: 'finalization_failed',
      retryable: true,
    });
    const frozenSnapshot = structuredClone(useRunStore.getState().completedRunSnapshot);
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      isEnding: false,
      saveStatus: 'failed',
      saveFailureKind: 'retryable',
    });
    expect(
      useRunStore
        .getState()
        .authorityAttempt?.commands.filter((command) => command.kind === 'abandon_run'),
    ).toHaveLength(1);
    await expect(useRunStore.getState().startRun(['Lux'])).resolves.toMatchObject({
      success: false,
      code: 'active_run',
    });
    expect(useRunStore.getState().completedRunSnapshot).toEqual(frozenSnapshot);
    expect(attemptMocks.start).not.toHaveBeenCalled();

    useRunStore.setState({ gold: 999, totalWavesCompleted: 99, team: [] });
    const retry = useRunStore.getState().endRun(false, RUN_UUID);
    expect(useRunStore.getState().saveStatus).toBe('retrying');
    releaseRetry?.({
      data: {
        attemptId: ATTEMPT_ID,
        status: 'started',
        lastSequence: 1,
        journalHash: 'journal-1',
        accepted: 1,
        replayed: false,
      },
      error: null,
    });
    await expect(retry).resolves.toMatchObject({ success: true, outcome: 'saved' });

    expect(attemptMocks.append).toHaveBeenCalledTimes(2);
    expect(attemptMocks.append.mock.calls[1][1]).toHaveLength(1);
    expect(attemptMocks.seal).toHaveBeenCalledTimes(1);
    expect(attemptMocks.verify).toHaveBeenCalledWith(ATTEMPT_ID);
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'saved',
      completedRunSnapshot: frozenSnapshot,
      serverProgression: progression,
    });
  });

  it('recovers an already verified seal without invoking Edge again', async () => {
    attemptMocks.seal.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        runUuid: RUN_UUID,
        status: 'verified',
        lastSequence: 1,
        journalHash: 'journal-1',
        accepted: true,
        replayed: true,
      },
      error: null,
    });

    await expect(useRunStore.getState().endRun(false, RUN_UUID)).resolves.toMatchObject({
      success: true,
      outcome: 'saved',
    });

    expect(attemptMocks.recover).toHaveBeenCalledWith(ATTEMPT_ID);
    expect(attemptMocks.verify).not.toHaveBeenCalled();
    expect(useRunStore.getState().serverProgression).toMatchObject({
      progressionSource: 'verified',
      replayed: true,
    });
  });

  it('does not let a hanging profile refresh block a durable verification', async () => {
    useAuthStore.setState({
      refreshPlayer: vi.fn(() => new Promise<{ success: boolean }>(() => undefined)),
    });

    await expect(useRunStore.getState().endRun(false, RUN_UUID)).resolves.toMatchObject({
      success: true,
      outcome: 'saved',
    });

    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'saved',
      serverProgression: progression,
    });
  });

  it('coalesces simultaneous end commands into one persisted result', async () => {
    let releaseAppend:
      | ((value: {
          data: {
            attemptId: string;
            status: string;
            lastSequence: number;
            journalHash: string;
            accepted: number;
            replayed: boolean;
          };
          error: null;
        }) => void)
      | undefined;
    attemptMocks.append.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseAppend = resolve;
        }),
    );

    const first = useRunStore.getState().endRun(false, RUN_UUID);
    const second = useRunStore.getState().endRun(false, RUN_UUID);

    expect(useRunStore.getState().saveStatus).toBe('saving');
    expect(attemptMocks.append).toHaveBeenCalledOnce();
    releaseAppend?.({
      data: {
        attemptId: ATTEMPT_ID,
        status: 'started',
        lastSequence: 1,
        journalHash: 'journal-1',
        accepted: 1,
        replayed: false,
      },
      error: null,
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { success: true, runId: RUN_UUID, outcome: 'saved' },
      { success: true, runId: RUN_UUID, outcome: 'saved' },
    ]);
    expect(attemptMocks.append).toHaveBeenCalledOnce();
    expect(attemptMocks.seal).toHaveBeenCalledOnce();
    expect(attemptMocks.verify).toHaveBeenCalledOnce();
    expect(useRunStore.getState().saveStatus).toBe('saved');
  });

  it('closes a rejected attempt without granting progression and without offering a retry', async () => {
    attemptMocks.verify.mockResolvedValue({
      data: null,
      error: new attemptMocks.RejectedError('illegal_trace', 'The run trace was rejected.'),
    });

    await expect(useRunStore.getState().endRun(false, RUN_UUID)).resolves.toMatchObject({
      success: true,
      outcome: 'terminal',
    });

    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'failed',
      saveFailureKind: 'terminal',
      serverProgression: null,
      rewardsApplied: false,
    });
    expect(useRunStore.getState().completedRunSnapshot?.runId).toBe(RUN_UUID);
  });

  it('refuses to replace an active run without an explicit abandonment', async () => {
    const before = structuredClone({
      runId: useRunStore.getState().runId,
      team: useRunStore.getState().team,
      authorityAttempt: useRunStore.getState().authorityAttempt,
    });

    await expect(useRunStore.getState().startRun(['Lux'])).resolves.toMatchObject({
      success: false,
      code: 'active_run',
    });

    expect(attemptMocks.start).not.toHaveBeenCalled();
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      runId: before.runId,
      team: before.team,
      authorityAttempt: before.authorityAttempt,
    });
  });

  it('allows only one start command during a same-tab double click', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    let releaseStart: ((value: ReturnType<typeof verifiedStartResponse>) => void) | undefined;
    attemptMocks.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseStart = resolve;
        }),
    );

    const first = useRunStore.getState().startRun(['Garen']);
    const second = useRunStore.getState().startRun(['Garen']);
    await expect(second).resolves.toMatchObject({
      success: false,
      code: 'start_in_progress',
      retryable: true,
    });
    expect(attemptMocks.start).toHaveBeenCalledOnce();

    releaseStart?.(verifiedStartResponse());
    await expect(first).resolves.toMatchObject({
      success: true,
      runId: RUN_UUID,
    });
    expect(useRunStore.getState().runId).toBe(RUN_UUID);
  });

  it('does not activate a run if identity changes while the start is in flight', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    let releaseStart: ((value: ReturnType<typeof verifiedStartResponse>) => void) | undefined;
    attemptMocks.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseStart = resolve;
        }),
    );

    const start = useRunStore.getState().startRun(['Garen']);
    useAuthStore.setState({ user: { id: 'user-2' } as User });
    releaseStart?.(verifiedStartResponse());

    await expect(start).resolves.toMatchObject({
      success: false,
      code: 'account_changed',
      retryable: true,
    });
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      runId: '',
      authorityAttempt: null,
      pendingAuthorityStart: { ownerUserId: 'user-1' },
    });
  });

  it('refuses a start when persisted state reports an active run in another tab', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() =>
        JSON.stringify({
          state: { isActive: true, runId: 'other-tab-run', mode: 'daily' },
          version: 2,
        }),
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    await expect(useRunStore.getState().startRun(['Garen'])).resolves.toMatchObject({
      success: false,
      code: 'active_run_another_tab',
      retryable: true,
    });
    expect(attemptMocks.start).not.toHaveBeenCalled();
    expect(useRunStore.getState().isActive).toBe(false);
  });

  it('starts authenticated gameplay only from the canonical server seed and run UUID', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    attemptMocks.start.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        runUuid: RUN_UUID,
        status: 'started',
        rulesetVersion: 1,
        engineVersion: 'run-engine-v1',
        seed: 987654,
        mode: 'normal',
        difficulty: 'normal',
        initialTeam: ['Garen'],
        runeIds: ['press_the_attack'],
        enhancementSnapshot: { Garen: { hp_1: 1 } },
        startedAt: '2026-07-23T12:00:00.000Z',
        expiresAt: '2026-07-24T12:00:00.000Z',
        lastSequence: 0,
        journalHash: 'initial-hash',
        replayed: false,
      },
      error: null,
    });

    await expect(
      useRunStore.getState().startRun(['Garen'], {
        seed: 123,
        runeIds: ['press_the_attack'],
      }),
    ).resolves.toEqual({ success: true, runId: RUN_UUID, mode: 'normal' });

    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      runId: RUN_UUID,
      seed: 987654,
      startedAt: '2026-07-23T12:00:00.000Z',
      team: [{ championId: 'Garen' }],
      authorityAttempt: {
        attemptId: ATTEMPT_ID,
        ownerUserId: 'user-1',
        enhancementSnapshot: { Garen: { hp_1: 1 } },
      },
    });
  });

  it('keeps the start idempotency key and does not create a local run when start fails', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    attemptMocks.start.mockResolvedValue({
      data: null,
      error: new TypeError('Failed to fetch'),
    });

    await expect(useRunStore.getState().startRun(['Garen'])).resolves.toMatchObject({
      success: false,
    });
    const firstCommandId = attemptMocks.start.mock.calls[0][0].commandId;
    await expect(useRunStore.getState().startRun(['Garen'])).resolves.toMatchObject({
      success: false,
    });

    expect(attemptMocks.start.mock.calls[1][0].commandId).toBe(firstCommandId);
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      runId: '',
      biomeMaps: [],
      authorityAttempt: null,
      pendingAuthorityStart: { commandId: firstCommandId },
    });
  });

  it('drops a stale Daily start after the server rejects its starter offer', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    attemptMocks.start.mockResolvedValue({
      data: null,
      error: new Error('daily_starter_not_offered | 22023'),
    });

    await expect(
      useRunStore.getState().startRun(['Annie'], { mode: 'daily' }),
    ).resolves.toMatchObject({
      success: false,
      code: 'start_failed',
      retryable: false,
    });

    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      pendingAuthorityStart: null,
      saveError: 'daily_starter_not_offered | 22023',
    });
  });

  it('replays the exact pending start after a torn response instead of opening another attempt', async () => {
    const pendingCommandId = '44444444-4444-4444-8444-444444444444';
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      pendingAuthorityStart: {
        commandId: pendingCommandId,
        ownerUserId: 'user-1',
        mode: 'daily',
        team: ['Garen'],
        runeIds: ['press_the_attack'],
        difficulty: 'hard',
      },
    });
    attemptMocks.start.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        runUuid: RUN_UUID,
        status: 'started',
        rulesetVersion: 1,
        engineVersion: 'run-engine-v1',
        seed: 987654,
        mode: 'daily',
        difficulty: 'hard',
        initialTeam: ['Garen'],
        runeIds: ['press_the_attack'],
        enhancementSnapshot: { Garen: {} },
        startedAt: '2026-07-23T12:00:00.000Z',
        expiresAt: '2026-07-24T12:00:00.000Z',
        lastSequence: 0,
        journalHash: 'initial-hash',
        replayed: true,
      },
      error: null,
    });

    await expect(
      useRunStore.getState().startRun(['Lux'], {
        mode: 'normal',
        runeIds: [],
      }),
    ).resolves.toEqual({ success: true, runId: RUN_UUID, mode: 'daily' });

    expect(attemptMocks.start).toHaveBeenCalledWith({
      commandId: pendingCommandId,
      mode: 'daily',
      team: ['Garen'],
      runeIds: ['press_the_attack'],
      difficulty: 'hard',
    });
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      mode: 'daily',
      runId: RUN_UUID,
      team: [{ championId: 'Garen' }],
      runeIds: ['press_the_attack'],
      pendingAuthorityStart: null,
    });
  });
});
