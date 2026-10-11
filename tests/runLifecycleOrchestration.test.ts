import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRunLedger } from '@/game/run/runLedger';
import type {
  RunAuthenticationSnapshot,
  RunLifecycleDependencies,
  RunLifecycleStatePort,
} from '@/services/runLifecycle/contracts';
import { createRunAuthorityJournal } from '@/services/runLifecycle/runAuthorityJournal';
import { submitRunAuthoritySnapshot } from '@/services/runLifecycle/runAuthoritySubmission';
import { createRunFinalizationOrchestrator } from '@/services/runLifecycle/runFinalization';
import {
  type RunProgressionDependencies,
  synchronizeVerifiedRunProgression,
} from '@/services/runLifecycle/runProgressionSync';
import { createCompletedRunSnapshot } from '@/services/runLifecycle/runSnapshot';
import { createRunStartOrchestrator } from '@/services/runLifecycle/runStart';
import { RunLifecycleService } from '@/services/runLifecycleService';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import type { RunState, ServerRunProgression } from '@/types/run';
import type { RunAuthorityAttempt, StartRunAttemptResult } from '@/types/runAttempt';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function authentication(userId: string | null): RunAuthenticationSnapshot {
  return {
    user: userId ? { id: userId, email: `${userId}@example.test` } : null,
    player: userId
      ? {
          id: `player-${userId}`,
          user_id: userId,
          username: userId,
          avatar_url: null,
          display_name: null,
          public_display_name: null,
          is_admin: false,
          leaderboard_opt_out: false,
          level: 1,
          total_candies: 0,
          total_runs_completed: 0,
          total_waves_completed: 0,
          total_wins: 0,
          created_at: '2026-10-11T12:00:00.000Z',
          updated_at: '2026-10-11T12:00:00.000Z',
          last_login_at: null,
        }
      : null,
    ready: true,
    isAuthenticated: userId !== null,
  };
}

function attempt(): RunAuthorityAttempt {
  return {
    attemptId: 'attempt-owner-a',
    runUuid: 'run-owner-a',
    ownerUserId: 'owner-a',
    seed: 42,
    rulesetVersion: 3,
    gameplayRulesetVersion: 23,
    engineVersion: 'run-engine-0.2.0',
    difficulty: 'normal',
    mode: 'normal',
    initialTeam: ['Garen', 'Annie'],
    runeIds: [],
    enhancementSnapshot: {},
    masterySnapshot: {},
    startedAt: '2026-10-11T12:00:00.000Z',
    expiresAt: '2026-10-12T12:00:00.000Z',
    status: 'active',
    commands: [
      {
        commandId: 'move-first',
        kind: 'move_node',
        payload: { node_id: 'first-node' },
        sequence: 1,
        dedupeKey: 'move_node:first-node',
      },
    ],
    nextSequence: 2,
    lastAcknowledgedSequence: 0,
    journalHash: 'original-journal',
    finishCommandId: 'stable-finish',
  };
}

function startedAttempt(): StartRunAttemptResult {
  const original = attempt();
  return {
    ...original,
    status: 'started',
    dailyDate: null,
    dailyRulesetVersion: null,
    dailyScoreVersion: null,
    masterySnapshot: {},
    lastSequence: 0,
    replayed: false,
  };
}

const progression: ServerRunProgression = {
  runId: 'run-owner-a',
  replayed: true,
  candiesEarned: 12,
  candiesPerChampion: 6,
  progressionVersion: 3,
  progressionSource: 'verified',
};

function harness() {
  let state = structuredClone(RUN_INITIAL_STATE);
  let auth = authentication(null);
  const authority = {
    startAttempt: vi.fn<RunLifecycleDependencies['authority']['startAttempt']>(),
    findOpenAttempt: vi
      .fn<RunLifecycleDependencies['authority']['findOpenAttempt']>()
      .mockResolvedValue({ data: null, error: null }),
    appendCommands: vi.fn<RunLifecycleDependencies['authority']['appendCommands']>(),
    sealAttempt: vi.fn<RunLifecycleDependencies['authority']['sealAttempt']>(),
    verifyAttempt: vi.fn<RunLifecycleDependencies['authority']['verifyAttempt']>(),
    recoverAttempt: vi
      .fn<RunLifecycleDependencies['authority']['recoverAttempt']>()
      .mockResolvedValue({ data: { progression, summary: null }, error: null }),
  };
  const dependencies: RunLifecycleDependencies = {
    lifecycle: new RunLifecycleService(),
    authority,
    readAuthentication: () => auth,
    readDifficulty: () => 'normal',
    initializeGuestRoster: vi.fn(async () => {}),
    readChampionRoster: () => ({
      available: true,
      ready: true,
      enabled: false,
      getAccess: () => 'permanent_free',
    }),
    refreshChampionRoster: vi.fn(async () => {}),
    readEnhancements: () => ({ unlockedNodes: {}, totalCandiesSpent: 0 }),
    readMasteryLevel: () => 0,
    awardGuestCandies: vi.fn(() => ({})),
    readDailyContext: () => ({ dateKey: '2026-10-11', seed: 42 }),
    calculateDailyScore: () => 0,
    recordDailyCompletion: vi.fn(),
    refreshVerifiedProgression: vi.fn(async () => {}),
    readPersistedActiveRun: () => null,
    withExclusiveStart: async (operation) => operation(),
    isOnline: () => false,
    now: () => Date.parse('2026-10-11T12:00:00.000Z'),
    random: () => 0.125,
    initialState: structuredClone(RUN_INITIAL_STATE),
  };
  const context: RunLifecycleStatePort = {
    read: () => ({ ...state, recordRunCommand: journal.recordRunCommand }),
    update: vi.fn((patch: Partial<RunState>) => {
      state = { ...state, ...patch };
    }),
  };
  const journal = createRunAuthorityJournal(context, dependencies);
  return {
    authority,
    context,
    dependencies,
    journal,
    read: () => state,
    replace: (next: RunState) => {
      state = next;
    },
    authenticate: (userId: string | null) => {
      auth = authentication(userId);
    },
  };
}

function prepareSubmission(
  h: ReturnType<typeof harness>,
  status = 'active' as RunAuthorityAttempt['status'],
) {
  h.authenticate('owner-a');
  h.replace({
    ...structuredClone(RUN_INITIAL_STATE),
    isActive: true,
    runId: 'run-owner-a',
    seed: 42,
    startedAt: '2026-10-11T12:00:00.000Z',
    authorityAttempt: { ...attempt(), status },
    team: [{ championId: 'Garen' }, { championId: 'Annie' }],
    ledger: createRunLedger(['Garen', 'Annie']),
    totalWavesCompleted: 2,
  });
  const snapshot = createCompletedRunSnapshot(h.read(), false, undefined, false, h.dependencies);
  h.replace({ ...h.read(), completedRunSnapshot: snapshot });
  return { snapshot, originalAttempt: h.read().authorityAttempt! };
}

describe('run orchestration through injected state and account ports', () => {
  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('blocks a second start while guest roster preparation is pending, then starts offline without authority', async () => {
    const h = harness();
    const roster = deferred<void>();
    h.dependencies.initializeGuestRoster = vi.fn(() => roster.promise);
    const start = createRunStartOrchestrator(h.context, h.dependencies);

    const first = start(['Garen', 'Annie'], { seed: 42 });
    expect(h.dependencies.initializeGuestRoster).toHaveBeenCalledOnce();
    expect(h.read().isActive).toBe(false);
    await expect(start(['Garen', 'Annie'])).resolves.toMatchObject({
      success: false,
      code: 'start_in_progress',
    });
    roster.resolve();
    await expect(first).resolves.toMatchObject({ success: true, mode: 'normal' });

    expect(h.read()).toMatchObject({
      isActive: true,
      seed: 42,
      team: [{ championId: 'Garen' }, { championId: 'Annie' }],
      authorityAttempt: null,
    });
    expect(h.read().biomeMaps).toHaveLength(6);
    for (const remoteCall of Object.values(h.authority)) expect(remoteCall).not.toHaveBeenCalled();
  });

  it('does not publish a guest run if an account signs in while roster preparation is pending', async () => {
    const h = harness();
    const roster = deferred<void>();
    h.dependencies.initializeGuestRoster = () => roster.promise;
    const start = createRunStartOrchestrator(h.context, h.dependencies);
    const pending = start(['Garen', 'Annie']);
    h.authenticate('owner-b');
    roster.resolve();

    await expect(pending).resolves.toMatchObject({ success: false, code: 'account_changed' });
    expect(h.read()).toEqual(RUN_INITIAL_STATE);
    expect(h.authority.startAttempt).not.toHaveBeenCalled();
    expect(h.dependencies.lifecycle.beginStart()).toBe(true);
    h.dependencies.lifecycle.finishStart();
  });

  it('ignores a started authority attempt when its owner changed during the request', async () => {
    const h = harness();
    h.authenticate('owner-a');
    h.dependencies.isOnline = () => true;
    const started = deferred<Awaited<ReturnType<typeof h.authority.startAttempt>>>();
    h.authority.startAttempt.mockReturnValue(started.promise);
    const pending = createRunStartOrchestrator(h.context, h.dependencies)(['Garen', 'Annie']);
    await vi.waitFor(() => expect(h.authority.startAttempt).toHaveBeenCalledOnce());
    h.authenticate('owner-b');
    started.resolve({ data: startedAttempt(), error: null });

    await expect(pending).resolves.toMatchObject({ success: false, code: 'account_changed' });
    expect(h.read()).toMatchObject({ isActive: false, authorityAttempt: null });
    expect(h.read().team).toEqual([]);
    expect(h.dependencies.refreshVerifiedProgression).not.toHaveBeenCalled();
  });

  describe.each(['other account', 'original account again'] as const)(
    'late start errors after switching to %s',
    (identity) => {
      function replaceAuthenticationAndUi(h: ReturnType<typeof harness>) {
        h.authenticate('owner-b');
        if (identity === 'original account again') h.authenticate('owner-a');
        // Retain the same pending command: the return to A must be recognized
        // by the captured session reference, even though its user ID matches.
        h.replace({ ...h.read(), saveError: 'current account UI error' });
        return structuredClone(h.read());
      }

      it.each(['champion_locked', 'run_attempt_already_open', 'network unavailable'] as const)(
        'ignores %s without changing current UI or making another authority request',
        async (error) => {
          const h = harness();
          h.authenticate('owner-a');
          h.dependencies.isOnline = () => true;
          const started = deferred<Awaited<ReturnType<typeof h.authority.startAttempt>>>();
          h.authority.startAttempt.mockReturnValue(started.promise);
          const pending = createRunStartOrchestrator(h.context, h.dependencies)(['Garen', 'Annie']);
          await vi.waitFor(() => expect(h.authority.startAttempt).toHaveBeenCalledOnce());
          const retained = replaceAuthenticationAndUi(h);
          expect(retained.pendingAuthorityStart).not.toBeNull();
          started.resolve({ data: null, error: new Error(error) });

          await expect(pending).resolves.toMatchObject({ success: false, code: 'account_changed' });
          expect(h.read()).toEqual(retained);
          expect(h.dependencies.refreshChampionRoster).not.toHaveBeenCalled();
          expect(h.dependencies.refreshVerifiedProgression).not.toHaveBeenCalled();
          expect(h.authority.findOpenAttempt).toHaveBeenCalledOnce();
          expect(h.authority.startAttempt).toHaveBeenCalledOnce();
          expect(h.authority.verifyAttempt).not.toHaveBeenCalled();
        },
      );

      it('ignores an error from the retry request after the account changed', async () => {
        const h = harness();
        h.authenticate('owner-a');
        h.dependencies.isOnline = () => true;
        const retried = deferred<Awaited<ReturnType<typeof h.authority.startAttempt>>>();
        h.authority.startAttempt
          .mockResolvedValueOnce({ data: null, error: new Error('run_attempt_already_open') })
          .mockReturnValueOnce(retried.promise);
        const pending = createRunStartOrchestrator(h.context, h.dependencies)(['Garen', 'Annie']);
        await vi.waitFor(() => expect(h.authority.startAttempt).toHaveBeenCalledTimes(2));
        expect(h.authority.findOpenAttempt).toHaveBeenCalledTimes(2);
        const retained = replaceAuthenticationAndUi(h);
        retried.resolve({ data: null, error: new Error('champion_locked') });

        await expect(pending).resolves.toMatchObject({ success: false, code: 'account_changed' });
        expect(h.read()).toEqual(retained);
        expect(h.dependencies.refreshChampionRoster).not.toHaveBeenCalled();
        expect(h.dependencies.refreshVerifiedProgression).not.toHaveBeenCalled();
        expect(h.authority.findOpenAttempt).toHaveBeenCalledTimes(2);
        expect(h.authority.startAttempt).toHaveBeenCalledTimes(2);
        expect(h.authority.verifyAttempt).not.toHaveBeenCalled();
      });
    },
  );

  it.each(['new run', 'new account'] as const)(
    'stops after a late append receipt for a %s, without sealing or publishing its journal',
    async (change) => {
      const h = harness();
      const { snapshot, originalAttempt } = prepareSubmission(h);
      const appended = deferred<Awaited<ReturnType<typeof h.authority.appendCommands>>>();
      h.authority.appendCommands.mockReturnValue(appended.promise);
      const pending = submitRunAuthoritySnapshot(
        h.context,
        h.dependencies,
        snapshot,
        originalAttempt,
        authentication('owner-a').user,
      );
      expect(h.authority.appendCommands).toHaveBeenCalledOnce();
      if (change === 'new run') {
        h.replace({
          ...structuredClone(RUN_INITIAL_STATE),
          isActive: true,
          runId: 'replacement-run',
        });
      } else {
        h.authenticate('owner-b');
      }
      const retainedAttempt = h.read().authorityAttempt;
      appended.resolve({
        data: {
          attemptId: originalAttempt.attemptId,
          status: 'active',
          lastSequence: 1,
          journalHash: 'late-journal',
          accepted: 1,
          replayed: false,
        },
        error: null,
      });

      await expect(pending).resolves.toEqual({ status: 'retryable' });
      expect(h.read().authorityAttempt).toEqual(retainedAttempt);
      expect(h.read().serverProgression).toBeNull();
      expect(h.authority.sealAttempt).not.toHaveBeenCalled();
      expect(h.authority.verifyAttempt).not.toHaveBeenCalled();
      expect(h.dependencies.refreshVerifiedProgression).not.toHaveBeenCalled();
      if (change === 'new run') expect(h.read().runId).toBe('replacement-run');
    },
  );

  it.each(['new run', 'new account'] as const)(
    'stops after a late seal receipt for a %s, without verifying or publishing its status',
    async (change) => {
      const h = harness();
      const { snapshot, originalAttempt } = prepareSubmission(h);
      const acknowledged = { ...originalAttempt, lastAcknowledgedSequence: 1 };
      h.replace({ ...h.read(), authorityAttempt: acknowledged });
      const sealed = deferred<Awaited<ReturnType<typeof h.authority.sealAttempt>>>();
      h.authority.sealAttempt.mockReturnValue(sealed.promise);
      const pending = submitRunAuthoritySnapshot(
        h.context,
        h.dependencies,
        snapshot,
        acknowledged,
        authentication('owner-a').user,
      );
      expect(h.authority.sealAttempt).toHaveBeenCalledOnce();
      if (change === 'new run') {
        h.replace({
          ...structuredClone(RUN_INITIAL_STATE),
          isActive: true,
          runId: 'replacement-run',
        });
      } else {
        h.authenticate('owner-b');
      }
      const retainedAttempt = h.read().authorityAttempt;
      sealed.resolve({
        data: {
          attemptId: originalAttempt.attemptId,
          runUuid: originalAttempt.runUuid,
          status: 'finished',
          lastSequence: 1,
          journalHash: 'late-seal',
          accepted: true,
          replayed: false,
        },
        error: null,
      });

      await expect(pending).resolves.toEqual({ status: 'retryable' });
      expect(h.read().authorityAttempt).toEqual(retainedAttempt);
      expect(h.read().serverProgression).toBeNull();
      expect(h.authority.appendCommands).not.toHaveBeenCalled();
      expect(h.authority.verifyAttempt).not.toHaveBeenCalled();
      expect(h.authority.recoverAttempt).not.toHaveBeenCalled();
      if (change === 'new run') expect(h.read().runId).toBe('replacement-run');
    },
  );

  it('recovers a verified receipt without append/seal/verify and completes before account refresh finishes', async () => {
    const h = harness();
    prepareSubmission(h, 'verified');
    const refreshed = deferred<void>();
    h.dependencies.refreshVerifiedProgression = vi.fn(() => refreshed.promise);
    const end = createRunFinalizationOrchestrator(h.context, h.dependencies);

    await expect(end(false, 'run-owner-a')).resolves.toMatchObject({
      success: true,
      outcome: 'saved',
    });
    expect(h.authority.recoverAttempt).toHaveBeenCalledExactlyOnceWith('attempt-owner-a');
    expect(h.authority.appendCommands).not.toHaveBeenCalled();
    expect(h.authority.sealAttempt).not.toHaveBeenCalled();
    expect(h.authority.verifyAttempt).not.toHaveBeenCalled();
    expect(h.read()).toMatchObject({
      isActive: false,
      saveStatus: 'saved',
      serverProgression: progression,
    });
    expect(h.dependencies.awardGuestCandies).not.toHaveBeenCalled();
    refreshed.resolve();
  });

  it('deduplicates commands through the same injected journal and rejects a different owner', () => {
    const h = harness();
    prepareSubmission(h);
    h.replace({ ...h.read(), completedRunSnapshot: null });
    const dedupeKey = 'abandon_run:run-owner-a';
    expect(h.journal.recordRunCommand({ kind: 'abandon_run' }, dedupeKey)).toBe(true);
    expect(h.journal.recordRunCommand({ kind: 'abandon_run' }, dedupeKey)).toBe(true);
    expect(
      h.read().authorityAttempt?.commands.filter((command) => command.kind === 'abandon_run'),
    ).toHaveLength(1);
    const retained = h.read().authorityAttempt;
    h.authenticate('owner-b');
    expect(h.journal.recordRunCommand({ kind: 'move_node', nodeId: 'other-node' })).toBe(false);
    expect(h.read().authorityAttempt).toEqual(retained);
    expect(h.authority.appendCommands).not.toHaveBeenCalled();
  });
});

describe('verified progression refresh through account ports', () => {
  function progressionHarness() {
    let userId: string | null = 'owner-a';
    const dependencies: RunProgressionDependencies = {
      readCurrentUserId: () => userId,
      refreshPlayer: vi.fn(async () => undefined),
      loadMasteries: vi.fn(async () => [
        { champion_id: 'Garen', total_candies: 50, unlocked_ids: [] },
      ]),
      hydrateMasteries: vi.fn(),
    };
    return {
      dependencies,
      switchAccount: () => {
        userId = 'owner-b';
      },
    };
  }

  it('keeps a saved result successful when account refresh fails', async () => {
    const h = progressionHarness();
    h.dependencies.refreshPlayer = vi.fn(async () => {
      throw new Error('network unavailable');
    });
    await expect(
      synchronizeVerifiedRunProgression('owner-a', h.dependencies),
    ).resolves.toBeUndefined();
    expect(h.dependencies.loadMasteries).not.toHaveBeenCalled();
    expect(h.dependencies.hydrateMasteries).not.toHaveBeenCalled();
  });

  it('does not load mastery after an identity change during the player refresh', async () => {
    const h = progressionHarness();
    const player = deferred<void>();
    h.dependencies.refreshPlayer = () => player.promise;
    const pending = synchronizeVerifiedRunProgression('owner-a', h.dependencies);
    h.switchAccount();
    player.resolve();
    await pending;
    expect(h.dependencies.loadMasteries).not.toHaveBeenCalled();
    expect(h.dependencies.hydrateMasteries).not.toHaveBeenCalled();
  });

  it('does not hydrate a mastery response received after the account changed', async () => {
    const h = progressionHarness();
    const masteries = deferred<Awaited<ReturnType<RunProgressionDependencies['loadMasteries']>>>();
    h.dependencies.loadMasteries = vi.fn(() => masteries.promise);
    const pending = synchronizeVerifiedRunProgression('owner-a', h.dependencies);
    await vi.waitFor(() =>
      expect(h.dependencies.loadMasteries).toHaveBeenCalledExactlyOnceWith('owner-a'),
    );
    h.switchAccount();
    masteries.resolve([{ champion_id: 'Garen', total_candies: 50, unlocked_ids: [] }]);
    await pending;
    expect(h.dependencies.hydrateMasteries).not.toHaveBeenCalled();
  });
});
