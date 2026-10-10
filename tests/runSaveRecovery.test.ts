import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { synchronizeMapFrontier } from '@/game/map/mapProgression';
import { findNode } from '@/game/map/mapUtils';
import { getRunChampionCatalog } from '@/game/run/runChampionCatalog';
import { buildRunSummaryFromLedger, cloneRunLedger, createRunLedger } from '@/game/run/runLedger';
import { runError } from '@/i18n/runErrorContent';
import {
  getTechnicalMetricSnapshot,
  resetTechnicalMetrics,
} from '@/observability/technicalMetrics';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
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

  class RetryableError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }

  return {
    RetryableError,
    start: vi.fn(),
    findOpen: vi.fn(),
    append: vi.fn(),
    seal: vi.fn(),
    verify: vi.fn(),
    recover: vi.fn(),
    RejectedError,
  };
});
const getChampionMastery = vi.hoisted(() => vi.fn());
const economyState = vi.hoisted(() => ({
  snapshot: { enabled: false } as { enabled: boolean } | null,
  status: 'ready',
  initialize: vi.fn(),
  refresh: vi.fn(),
  reset: vi.fn(),
  getAccess: vi.fn(),
}));
vi.mock('@/stores/championEconomyStore', () => ({
  useChampionEconomyStore: { getState: () => economyState },
}));

vi.mock('@/services/runAttemptService', () => ({
  startRunAttempt: attemptMocks.start,
  findOpenRunAttempt: attemptMocks.findOpen,
  appendRunAttemptCommands: attemptMocks.append,
  sealRunAttempt: attemptMocks.seal,
  verifyRunAttempt: attemptMocks.verify,
  recoverVerifiedRunAttempt: attemptMocks.recover,
  RunVerificationRejectedError: attemptMocks.RejectedError,
  RunVerificationRetryableError: attemptMocks.RetryableError,
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
      initialTeam: ['Garen', 'Annie'],
      runeIds: [],
      enhancementSnapshot: { Garen: {}, Annie: {} },
      startedAt: '2026-07-23T12:00:00.000Z',
      expiresAt: '2026-07-24T12:00:00.000Z',
      lastSequence: 0,
      journalHash: 'initial-hash',
      replayed: false,
    },
    error: null,
  };
}

async function reloadSavedAuthoritativeRun({
  mode = 'normal',
  won = false,
}: {
  mode?: 'normal' | 'daily';
  won?: boolean;
} = {}) {
  const entries = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  });
  useRunStore.setState({ mode, authorityAttempt: authorityAttempt({ mode }) });
  if (won) {
    attemptMocks.seal.mockResolvedValueOnce({
      data: {
        attemptId: ATTEMPT_ID,
        runUuid: RUN_UUID,
        status: 'finished',
        lastSequence: 0,
        journalHash: 'initial-hash',
        accepted: true,
        replayed: false,
      },
      error: null,
    });
  }
  await expect(useRunStore.getState().endRun(won, RUN_UUID)).resolves.toMatchObject({
    success: true,
    outcome: 'saved',
  });
  const originalAttempt = structuredClone(useRunStore.getState().authorityAttempt!);
  const snapshot = structuredClone(useRunStore.getState().completedRunSnapshot!);
  const saved = entries.get('lolrogue-run-storage')!;
  useRunStore.setState({ ...RUN_INITIAL_STATE });
  entries.set('lolrogue-run-storage', saved);
  await useRunStore.persist.rehydrate();
  vi.clearAllMocks();
  return { originalAttempt, snapshot };
}

describe('authoritative run lifecycle and recovery', () => {
  it('refuses an offline account start before creating or consuming an attempt', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    useRunStore.setState({ ...RUN_INITIAL_STATE });

    const result = await useRunStore.getState().startRun(['Garen', 'Annie']);

    expect(result).toEqual({
      success: false,
      code: 'start_failed',
      error: runError.onlineStartRequired,
      retryable: true,
    });
    expect(attemptMocks.start).not.toHaveBeenCalled();
    expect(attemptMocks.findOpen).not.toHaveBeenCalled();
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      authorityAttempt: null,
      pendingAuthorityStart: null,
    });
  });

  beforeEach(() => {
    resetTechnicalMetrics();
    vi.clearAllMocks();
    economyState.snapshot = { enabled: false };
    economyState.status = 'ready';
    economyState.initialize.mockResolvedValue(undefined);
    economyState.refresh.mockResolvedValue(undefined);
    economyState.getAccess.mockReturnValue('permanent_free');
    getChampionMastery.mockResolvedValue({ data: [], error: null });
    attemptMocks.findOpen.mockResolvedValue({ data: null, error: null });
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

  it.each([
    ['champion_locked', 'champion_locked'],
    ['champion_rotation_expired', 'champion_rotation_expired'],
    ['champion_access_expired', 'champion_rotation_expired'],
  ])('refreshes stale roster after server refusal %s', async (serverCode, code) => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    attemptMocks.start.mockResolvedValue({ data: null, error: new Error(serverCode) });
    expect(await useRunStore.getState().startRun(['Garen', 'Annie'])).toMatchObject({
      success: false,
      code,
      retryable: false,
    });
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      pendingAuthorityStart: null,
    });
    expect(economyState.refresh).toHaveBeenCalledOnce();
  });

  it('preserves a server access snapshot after its rotation expires locally', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    const frozen = {
      version: 1 as const,
      enabled: true,
      economyVersion: 1 as const,
      catalogVersion: 1,
      rotationId: '2026-W41-v1-r21',
      rotationStartsAt: '2026-10-05T00:00:00Z',
      rotationEndsAt: '2026-10-12T00:00:00Z',
      allowedChampionIds: ['Garen', 'Annie'],
      rotationChampionIds: ['Annie'],
    };
    const started = verifiedStartResponse();
    attemptMocks.start.mockResolvedValue({
      data: { ...started.data, championAccessSnapshot: frozen, economyVersion: 1 },
      error: null,
    });
    economyState.getAccess.mockReturnValue('locked');
    expect(await useRunStore.getState().startRun(['Garen', 'Annie'])).toMatchObject({
      success: true,
    });
    expect(useRunStore.getState().authorityAttempt?.championAccessSnapshot).toEqual(frozen);
    expect(economyState.getAccess).not.toHaveBeenCalled();
  });

  it('blocks a guest normal start until the canonical roster is available', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    useAuthStore.setState({ user: null, player: null, isAuthenticated: false, isGuest: true });
    economyState.snapshot = null;
    economyState.status = 'error';
    expect(await useRunStore.getState().startRun(['Garen', 'Annie'])).toMatchObject({
      success: false,
      code: 'champion_roster_unavailable',
      retryable: true,
    });
    expect(economyState.initialize).toHaveBeenCalledWith(null);
    expect(useRunStore.getState().isActive).toBe(false);
    expect(attemptMocks.start).not.toHaveBeenCalled();
  });

  it('restricts guest standard access while preserving the Daily exemption', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    useAuthStore.setState({ user: null, player: null, isAuthenticated: false, isGuest: true });
    economyState.snapshot = { enabled: true };
    economyState.getAccess.mockReturnValue('locked');
    expect(await useRunStore.getState().startRun(['Garen', 'Annie'])).toMatchObject({
      success: false,
      code: 'champion_locked',
    });
    expect(await useRunStore.getState().startRun(['Garen'], { mode: 'daily' })).toMatchObject({
      success: true,
      mode: 'daily',
    });
    expect(attemptMocks.start).not.toHaveBeenCalled();
  });

  it('refreshes the global wallet only after a verified economic outcome', async () => {
    attemptMocks.verify.mockResolvedValue({
      data: {
        progression: {
          ...progression,
          shardsEarned: 25,
          shardsBalance: 425,
          shardEconomyVersion: 1,
        },
        summary: null,
      },
      error: null,
    });
    expect(await useRunStore.getState().endRun(false, RUN_UUID)).toMatchObject({ success: true });
    expect(economyState.refresh).toHaveBeenCalledOnce();
    expect(useRunStore.getState().serverProgression).toMatchObject({
      candiesEarned: 13,
      shardsEarned: 25,
      shardsBalance: 425,
    });
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
    expect(getTechnicalMetricSnapshot().buckets).toMatchObject([
      {
        metric: 'run_finalization',
        outcome: 'initial',
        engineVersion: 'run-engine-v1',
        gameplayRulesetVersion: null,
        progressionRulesetVersion: 1,
        count: 1,
      },
      {
        metric: 'run_finalization',
        outcome: 'retry',
        engineVersion: 'run-engine-v1',
        gameplayRulesetVersion: null,
        progressionRulesetVersion: 1,
        count: 1,
      },
    ]);
    expect(attemptMocks.verify).toHaveBeenCalledWith(ATTEMPT_ID);
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'saved',
      completedRunSnapshot: frozenSnapshot,
      serverProgression: progression,
    });
  });

  it('recovers an already verified seal without invoking Edge again', async () => {
    useRunStore.setState({
      authorityAttempt: authorityAttempt({ rulesetVersion: 3, gameplayRulesetVersion: 21 }),
    });
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
    expect(attemptMocks.seal).toHaveBeenCalledWith(ATTEMPT_ID, expect.any(String), 1, {
      engineVersion: 'run-engine-v1',
      gameplayRulesetVersion: 21,
      progressionRulesetVersion: 3,
    });
    expect(getTechnicalMetricSnapshot().buckets).toMatchObject([
      { metric: 'run_finalization', gameplayRulesetVersion: 21, progressionRulesetVersion: 3 },
    ]);
    expect(attemptMocks.verify).not.toHaveBeenCalled();
    expect(useRunStore.getState().serverProgression).toMatchObject({
      progressionSource: 'verified',
      replayed: true,
    });
  });

  it('revalidates a persisted success with the same attempt and finish command after reload', async () => {
    const entries = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
    await expect(useRunStore.getState().endRun(false, RUN_UUID)).resolves.toMatchObject({
      success: true,
      outcome: 'saved',
    });
    const originalAttempt = structuredClone(useRunStore.getState().authorityAttempt);
    const canonicalSummary = structuredClone(useRunStore.getState().completedRunSnapshot!.summary);
    expect(originalAttempt?.status).toBe('verified');
    const saved = entries.get('lolrogue-run-storage')!;
    // The cache is attacker-controlled: an inflated displayed reward is not a receipt.
    const forged = JSON.parse(saved);
    forged.state.serverProgression.candiesEarned = 999_999;
    forged.state.serverProgression.candiesPerChampion = 999_999;
    forged.state.completedRunSnapshot.summary.totalKills = 999_999;
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    entries.set('lolrogue-run-storage', JSON.stringify(forged));
    await useRunStore.persist.rehydrate();

    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      isEnding: false,
      runId: RUN_UUID,
      saveStatus: 'recovering',
      saveFailureKind: null,
      serverProgression: null,
      authorityAttempt: originalAttempt,
    });
    // Starting another run cannot bypass the unresolved recovery.
    await expect(useRunStore.getState().startRun(['Garen', 'Annie'])).resolves.toMatchObject({
      success: false,
      code: 'active_run',
    });
    const snapshot = useRunStore.getState().completedRunSnapshot!;
    vi.clearAllMocks();
    attemptMocks.recover.mockResolvedValue({
      data: { progression: { ...progression, replayed: true }, summary: canonicalSummary },
      error: null,
    });
    attemptMocks.recover.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(
      useRunStore.getState().endRun(snapshot.won, snapshot.runId, snapshot.summary),
    ).resolves.toMatchObject({ success: false, retryable: true });
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      isEnding: false,
      saveStatus: 'failed',
      saveFailureKind: 'retryable',
      serverProgression: null,
      completedRunSnapshot: snapshot,
      authorityAttempt: originalAttempt,
    });

    await expect(
      useRunStore.getState().endRun(snapshot.won, snapshot.runId, snapshot.summary),
    ).resolves.toMatchObject({ success: true, outcome: 'saved' });
    expect(attemptMocks.append).not.toHaveBeenCalled();
    expect(attemptMocks.seal).not.toHaveBeenCalled();
    expect(attemptMocks.verify).not.toHaveBeenCalled();
    expect(attemptMocks.recover).toHaveBeenCalledTimes(2);
    expect(attemptMocks.recover.mock.calls).toEqual([[ATTEMPT_ID], [ATTEMPT_ID]]);
    expect(attemptMocks.start).not.toHaveBeenCalled();
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'saved',
      saveError: null,
      saveFailureKind: null,
      authorityAttempt: originalAttempt,
      completedRunSnapshot: { summary: canonicalSummary },
    });
    expect(useRunStore.getState().serverProgression).toEqual({ ...progression, replayed: true });
  });

  it('coalesces simultaneous recovery requests into one server receipt read', async () => {
    const { snapshot, originalAttempt } = await reloadSavedAuthoritativeRun();
    let releaseRecovery!: () => void;
    attemptMocks.recover.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRecovery = () =>
            resolve({
              data: { progression: { ...progression, replayed: true }, summary: snapshot.summary },
              error: null,
            });
        }),
    );

    const first = useRunStore.getState().endRun(snapshot.won, snapshot.runId, snapshot.summary);
    const second = useRunStore.getState().endRun(snapshot.won, snapshot.runId, snapshot.summary);
    await vi.waitFor(() => expect(attemptMocks.recover).toHaveBeenCalledOnce());
    expect(useRunStore.getState().saveStatus).toBe('recovering');
    releaseRecovery();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { success: true, runId: RUN_UUID, outcome: 'saved' },
      { success: true, runId: RUN_UUID, outcome: 'saved' },
    ]);
    expect(attemptMocks.recover).toHaveBeenCalledOnce();
    expect(attemptMocks.append).not.toHaveBeenCalled();
    expect(attemptMocks.seal).not.toHaveBeenCalled();
    expect(attemptMocks.verify).not.toHaveBeenCalled();
    expect(attemptMocks.start).not.toHaveBeenCalled();
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'saved',
      authorityAttempt: originalAttempt,
      completedRunSnapshot: snapshot,
    });
  });

  it('ignores a recovered receipt when the account changed while reading it', async () => {
    const { snapshot, originalAttempt } = await reloadSavedAuthoritativeRun();
    let releaseRecovery!: () => void;
    attemptMocks.recover.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRecovery = () =>
            resolve({
              data: { progression, summary: { ...snapshot.summary, totalKills: 999 } },
              error: null,
            });
        }),
    );
    const pending = useRunStore.getState().endRun(snapshot.won, snapshot.runId, snapshot.summary);
    await vi.waitFor(() => expect(attemptMocks.recover).toHaveBeenCalledOnce());
    useAuthStore.setState({ user: { id: 'user-2' } as User });
    releaseRecovery();

    await expect(pending).resolves.toMatchObject({ success: false });
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      authorityAttempt: originalAttempt,
      completedRunSnapshot: snapshot,
      serverProgression: null,
    });
    expect(useRunStore.getState().saveStatus).not.toBe('saved');
    expect(attemptMocks.append).not.toHaveBeenCalled();
    expect(attemptMocks.seal).not.toHaveBeenCalled();
    expect(attemptMocks.verify).not.toHaveBeenCalled();
    expect(useAuthStore.getState().refreshPlayer).not.toHaveBeenCalled();
  });

  it('ignores a recovered receipt when another run replaced the pending completion', async () => {
    const { snapshot } = await reloadSavedAuthoritativeRun();
    let releaseRecovery!: () => void;
    attemptMocks.recover.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRecovery = () =>
            resolve({ data: { progression, summary: snapshot.summary }, error: null });
        }),
    );
    const pending = useRunStore.getState().endRun(snapshot.won, snapshot.runId, snapshot.summary);
    await vi.waitFor(() => expect(attemptMocks.recover).toHaveBeenCalledOnce());
    const replacementRunId = '44444444-4444-4444-8444-444444444444';
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: replacementRunId,
      team: [{ championId: 'Annie' }],
      authorityAttempt: authorityAttempt({ runUuid: replacementRunId, initialTeam: ['Annie'] }),
    });
    const replacement = useRunStore.getState();
    releaseRecovery();

    await expect(pending).resolves.toMatchObject({ success: false });
    expect(useRunStore.getState()).toBe(replacement);
    expect(useRunStore.getState()).toMatchObject({
      runId: replacementRunId,
      isActive: true,
      saveStatus: 'idle',
      completedRunSnapshot: null,
      serverProgression: null,
      team: [{ championId: 'Annie' }],
    });
    expect(useAuthStore.getState().refreshPlayer).not.toHaveBeenCalled();
  });

  it.each(['trace_rejected', 'run_attempt_expired'])(
    'closes a rejected or expired recovered receipt (%s) without granting progression',
    async (code) => {
      const { snapshot } = await reloadSavedAuthoritativeRun();
      attemptMocks.recover.mockResolvedValueOnce({
        data: null,
        error: new attemptMocks.RejectedError(
          code,
          'The server receipt is unavailable permanently.',
        ),
      });

      await expect(
        useRunStore.getState().endRun(snapshot.won, snapshot.runId, snapshot.summary),
      ).resolves.toMatchObject({ success: true, outcome: 'terminal' });
      expect(useRunStore.getState()).toMatchObject({
        isActive: false,
        isEnding: false,
        saveStatus: 'failed',
        saveFailureKind: 'terminal',
        completedRunSnapshot: snapshot,
        serverProgression: null,
        saveDiagnostic: { attemptId: ATTEMPT_ID, rejectionCode: code },
      });
      expect(attemptMocks.recover).toHaveBeenCalledExactlyOnceWith(ATTEMPT_ID);
      expect(attemptMocks.append).not.toHaveBeenCalled();
      expect(attemptMocks.seal).not.toHaveBeenCalled();
      expect(attemptMocks.verify).not.toHaveBeenCalled();
      expect(attemptMocks.start).not.toHaveBeenCalled();
      expect(useAuthStore.getState().refreshPlayer).not.toHaveBeenCalled();
    },
  );

  it('recovers a completed Daily through its existing receipt without resubmitting a score', async () => {
    useDailyRunStore.setState(useDailyRunStore.getInitialState());
    const { snapshot, originalAttempt } = await reloadSavedAuthoritativeRun({
      mode: 'daily',
      won: true,
    });
    const dailyMetadata = useDailyRunStore.getState();
    expect(snapshot).toMatchObject({ mode: 'daily', daily: { abandoned: false } });
    expect(dailyMetadata.hasCompletedToday).toBe(true);
    expect(useRunStore.getState()).toMatchObject({
      mode: 'daily',
      saveStatus: 'recovering',
      serverProgression: null,
    });
    attemptMocks.recover.mockResolvedValueOnce({
      data: { progression: { ...progression, replayed: true }, summary: snapshot.summary },
      error: null,
    });

    await expect(
      useRunStore.getState().endRun(snapshot.won, snapshot.runId, snapshot.summary),
    ).resolves.toMatchObject({ success: true, outcome: 'saved' });
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'saved',
      authorityAttempt: originalAttempt,
      completedRunSnapshot: snapshot,
      serverProgression: { ...progression, replayed: true },
    });
    expect(useDailyRunStore.getState().getLeaderboard()).toEqual([]);
    expect(useDailyRunStore.getState().dateKey).toBe(dailyMetadata.dateKey);
    expect(useDailyRunStore.getState().hasCompletedToday).toBe(true);
    expect(attemptMocks.recover).toHaveBeenCalledExactlyOnceWith(ATTEMPT_ID);
    expect(attemptMocks.append).not.toHaveBeenCalled();
    expect(attemptMocks.seal).not.toHaveBeenCalled();
    expect(attemptMocks.verify).not.toHaveBeenCalled();
    expect(attemptMocks.start).not.toHaveBeenCalled();
  });

  it('preserves exit, augment and next-biome commands through the final seal', async () => {
    const maps = generateRunMap(4242);
    const exit = findNode(maps[0], maps[0].exitNodeId)!;
    useRunStore.setState({
      authorityAttempt: authorityAttempt({ engineVersion: 'run-engine-v13' }),
      biomeMaps: maps,
      currentBiomeIndex: 0,
      currentBiome: maps[0].biome,
      currentNodeId: exit.id,
      frontierNodeIds: [],
      chosenPathNodeIds: [exit.id],
      completedNodeIds: [],
      pendingEncounter: null,
      pendingAugmentIds: [],
      pendingSpellUpgradeChampionIds: [],
      runLevel: 1,
      currentWave: 4,
      totalWavesCompleted: 3,
      augmentIds: [],
    });
    attemptMocks.append.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        status: 'active',
        lastSequence: 3,
        journalHash: 'journal-3',
        accepted: 3,
        replayed: false,
      },
      error: null,
    });
    attemptMocks.seal.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        runUuid: RUN_UUID,
        status: 'finished',
        lastSequence: 3,
        journalHash: 'journal-3',
        accepted: true,
        replayed: false,
      },
      error: null,
    });

    expect(useRunStore.getState().advanceToNextBiome()).toBe(true);
    const afterExit = useRunStore.getState();
    expect(afterExit).toMatchObject({
      currentBiomeIndex: 1,
      currentNodeId: null,
      frontierNodeIds: [maps[1].startNodeId],
      runLevel: 2,
    });
    expect(afterExit.pendingAugmentIds).toHaveLength(3);
    const augmentId = afterExit.pendingAugmentIds[0];
    expect(useRunStore.getState().chooseAugment(augmentId)).toBe(true);

    await expect(useRunStore.getState().endRun(false, RUN_UUID)).resolves.toMatchObject({
      success: true,
      outcome: 'saved',
    });

    const submittedCommands = attemptMocks.append.mock.calls[0]?.[1];
    expect(submittedCommands).toMatchObject([
      { sequence: 1, kind: 'resolve_node', payload: { node_id: exit.id } },
      { sequence: 2, kind: 'choose_augment', payload: { augment_id: augmentId } },
      { sequence: 3, kind: 'abandon_run', payload: {} },
    ]);
    expect(attemptMocks.seal).toHaveBeenCalledWith(ATTEMPT_ID, expect.any(String), 3, {
      engineVersion: 'run-engine-v13',
      gameplayRulesetVersion: undefined,
      progressionRulesetVersion: 1,
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
    await useRunStore.getState().endRun(false, RUN_UUID);
    expect(attemptMocks.verify).toHaveBeenCalledTimes(1);
    expect(attemptMocks.seal).toHaveBeenCalledTimes(1);
    expect(useRunStore.getState().serverProgression).toBeNull();
  });

  it('retains the exact finish command and snapshot when retrying a server verification error', async () => {
    attemptMocks.verify.mockResolvedValueOnce({
      data: null,
      error: new attemptMocks.RetryableError(
        'verification_in_progress',
        runError.verificationInProgress(12),
      ),
    });
    await expect(useRunStore.getState().endRun(false, RUN_UUID)).resolves.toMatchObject({
      success: false,
      retryable: true,
    });
    const failed = structuredClone({
      snapshot: useRunStore.getState().completedRunSnapshot,
      attempt: useRunStore.getState().authorityAttempt,
    });
    expect(useRunStore.getState().saveDiagnostic).toEqual({
      attemptId: ATTEMPT_ID,
      engineVersion: 'run-engine-v1',
      rejectionCode: 'verification_in_progress',
    });
    useRunStore.setState({ gold: 999, totalWavesCompleted: 99 });
    await expect(useRunStore.getState().endRun(true, RUN_UUID)).resolves.toMatchObject({
      success: true,
      outcome: 'saved',
    });
    expect(attemptMocks.seal.mock.calls).toEqual([
      [
        ATTEMPT_ID,
        failed.attempt!.finishCommandId,
        failed.attempt!.nextSequence - 1,
        {
          engineVersion: failed.attempt!.engineVersion,
          gameplayRulesetVersion: failed.attempt!.gameplayRulesetVersion,
          progressionRulesetVersion: failed.attempt!.rulesetVersion,
        },
      ],
      [
        ATTEMPT_ID,
        failed.attempt!.finishCommandId,
        failed.attempt!.nextSequence - 1,
        {
          engineVersion: failed.attempt!.engineVersion,
          gameplayRulesetVersion: failed.attempt!.gameplayRulesetVersion,
          progressionRulesetVersion: failed.attempt!.rulesetVersion,
        },
      ],
    ]);
    expect(attemptMocks.append).toHaveBeenCalledTimes(1);
    expect(useRunStore.getState().completedRunSnapshot).toEqual(failed.snapshot);
    expect(useRunStore.getState().authorityAttempt?.commands).toEqual(failed.attempt!.commands);
    expect(useRunStore.getState().saveDiagnostic).toBeNull();
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

    const first = useRunStore.getState().startRun(['Garen', 'Annie']);
    const second = useRunStore.getState().startRun(['Garen', 'Annie']);
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

    const start = useRunStore.getState().startRun(['Garen', 'Annie']);
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

  it('starts authenticated gameplay only from the canonical server seed, UUID and catalogue', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    attemptMocks.start.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        runUuid: RUN_UUID,
        status: 'started',
        rulesetVersion: 3,
        gameplayRulesetVersion: 21,
        engineVersion: 'run-engine-v21',
        seed: 987654,
        mode: 'normal',
        difficulty: 'normal',
        initialTeam: ['Garen', 'Annie'],
        runeIds: ['press_the_attack'],
        enhancementSnapshot: { Garen: { hp_1: 1 }, Annie: {} },
        startedAt: '2026-07-23T12:00:00.000Z',
        expiresAt: '2026-07-24T12:00:00.000Z',
        lastSequence: 0,
        journalHash: 'initial-hash',
        replayed: false,
      },
      error: null,
    });

    await expect(
      useRunStore.getState().startRun(['Garen', 'Annie'], {
        seed: 123,
        runeIds: ['press_the_attack'],
      }),
    ).resolves.toEqual({ success: true, runId: RUN_UUID, mode: 'normal' });

    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      runId: RUN_UUID,
      seed: 987654,
      startedAt: '2026-07-23T12:00:00.000Z',
      team: [{ championId: 'Garen' }, { championId: 'Annie' }],
      authorityAttempt: {
        attemptId: ATTEMPT_ID,
        ownerUserId: 'user-1',
        rulesetVersion: 3,
        gameplayRulesetVersion: 21,
        enhancementSnapshot: { Garen: { hp_1: 1 } },
      },
    });
    const expectedMaps = generateRunMap(987654, getRunChampionCatalog('run-engine-v21'));
    synchronizeMapFrontier(expectedMaps, 0, [expectedMaps[0]!.startNodeId]);
    expect(useRunStore.getState().biomeMaps).toEqual(expectedMaps);
    expect(JSON.stringify(useRunStore.getState().biomeMaps)).not.toContain('Veigar');
  });

  it('keeps the start idempotency key and does not create a local run when start fails', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    attemptMocks.start.mockResolvedValue({
      data: null,
      error: new TypeError('Failed to fetch'),
    });

    await expect(useRunStore.getState().startRun(['Garen', 'Annie'])).resolves.toMatchObject({
      success: false,
    });
    const firstCommandId = attemptMocks.start.mock.calls[0][0].commandId;
    await expect(useRunStore.getState().startRun(['Garen', 'Annie'])).resolves.toMatchObject({
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
      code: 'daily_starter_not_offered',
      retryable: false,
    });

    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      pendingAuthorityStart: null,
      saveError: runError.dailyStarterChanged,
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
    attemptMocks.findOpen.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        startCommandId: pendingCommandId,
        status: 'started',
        expiresAt: '2099-07-24T12:00:00.000Z',
      },
      error: null,
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
    expect(attemptMocks.verify).not.toHaveBeenCalled();
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      mode: 'daily',
      runId: RUN_UUID,
      team: [{ championId: 'Garen' }],
      runeIds: ['press_the_attack'],
      pendingAuthorityStart: null,
    });
  });

  it('verifies a finished attempt recovered from another device before starting', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    const previousAttemptId = '55555555-5555-4555-8555-555555555555';
    attemptMocks.findOpen.mockResolvedValue({
      data: {
        attemptId: previousAttemptId,
        startCommandId: '66666666-6666-4666-8666-666666666666',
        status: 'finished',
        expiresAt: '2099-07-24T12:00:00.000Z',
      },
      error: null,
    });
    attemptMocks.start.mockResolvedValue(verifiedStartResponse());

    await expect(useRunStore.getState().startRun(['Garen', 'Annie'])).resolves.toMatchObject({
      success: true,
      runId: RUN_UUID,
    });

    expect(attemptMocks.findOpen).toHaveBeenCalledOnce();
    expect(attemptMocks.verify).toHaveBeenCalledWith(previousAttemptId);
    expect(attemptMocks.start).toHaveBeenCalledOnce();
  });

  it('keeps the pending start when previous verification is temporarily unavailable', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    attemptMocks.findOpen.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        startCommandId: '66666666-6666-4666-8666-666666666666',
        status: 'finished',
        expiresAt: '2099-07-24T12:00:00.000Z',
      },
      error: null,
    });
    attemptMocks.verify.mockResolvedValue({
      data: null,
      error: new Error('temporary Edge failure'),
    });

    await expect(useRunStore.getState().startRun(['Garen', 'Annie'])).resolves.toMatchObject({
      success: false,
      code: 'start_failed',
      retryable: true,
      error: runError.previousVerificationPending,
    });

    expect(attemptMocks.start).not.toHaveBeenCalled();
    expect(useRunStore.getState().pendingAuthorityStart).toMatchObject({ ownerUserId: 'user-1' });
  });

  it('does not replace an active attempt owned by another device', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    attemptMocks.findOpen.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        startCommandId: '66666666-6666-4666-8666-666666666666',
        status: 'started',
        expiresAt: '2099-07-24T12:00:00.000Z',
      },
      error: null,
    });

    await expect(useRunStore.getState().startRun(['Garen', 'Annie'])).resolves.toMatchObject({
      success: false,
      code: 'start_failed',
      retryable: true,
      error: runError.activeRunElsewhere('2099-07-24T12:00:00.000Z'),
    });

    expect(attemptMocks.verify).not.toHaveBeenCalled();
    expect(attemptMocks.start).not.toHaveBeenCalled();
  });

  it('recovers one concurrent finished attempt and retries the start only once', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    const previousAttemptId = '55555555-5555-4555-8555-555555555555';
    attemptMocks.findOpen.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({
      data: {
        attemptId: previousAttemptId,
        startCommandId: '66666666-6666-4666-8666-666666666666',
        status: 'finished',
        expiresAt: '2099-07-24T12:00:00.000Z',
      },
      error: null,
    });
    attemptMocks.start
      .mockResolvedValueOnce({
        data: null,
        error: new Error('run_attempt_already_open | 55000 | status=500'),
      })
      .mockResolvedValueOnce(verifiedStartResponse());

    await expect(useRunStore.getState().startRun(['Garen', 'Annie'])).resolves.toMatchObject({
      success: true,
      runId: RUN_UUID,
    });

    expect(attemptMocks.findOpen).toHaveBeenCalledTimes(2);
    expect(attemptMocks.verify).toHaveBeenCalledWith(previousAttemptId);
    expect(attemptMocks.start).toHaveBeenCalledTimes(2);
  });

  it('stops recovered startup if the authenticated account changes', async () => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    attemptMocks.findOpen.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        startCommandId: '66666666-6666-4666-8666-666666666666',
        status: 'finished',
        expiresAt: '2099-07-24T12:00:00.000Z',
      },
      error: null,
    });
    attemptMocks.verify.mockImplementation(async () => {
      useAuthStore.setState({ user: { id: 'user-2' } as User });
      return { data: { progression, summary: null }, error: null };
    });

    await expect(useRunStore.getState().startRun(['Garen', 'Annie'])).resolves.toMatchObject({
      success: false,
      code: 'account_changed',
      retryable: true,
    });

    expect(attemptMocks.start).not.toHaveBeenCalled();
  });
});
