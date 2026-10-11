import { generateRunMap as generateBiomeMaps } from '@/game/map/MapGenerator-core';
import { synchronizeMapFrontier } from '@/game/map/mapProgression';
import {
  createRunCommandId as createCommandId,
  isSamePendingRunStart as samePendingStart,
} from '@/game/run/runAuthorityJournal';
import { getRunChampionCatalog } from '@/game/run/runChampionCatalog';
import { createRunLedger } from '@/game/run/runLedger';
import { getRequiredStarterCount, validateRunStartTeam } from '@/game/run/runStartValidation';
import { runError, runStartValidationMessage } from '@/i18n/runErrorContent';
import { RunVerificationRejectedError } from '@/services/runAttemptService';
import { runStartFailure as startFailure } from '@/services/runLifecycleService';
import { MAX_TEAM_SIZE, type TeamMember } from '@/types/run';
import type { PendingRunAttemptStart, RunAuthorityAttempt } from '@/types/runAttempt';
import { measureTransition, setTechnicalCorrelation } from '@/utils/observability';
import type {
  RunLifecycleActions,
  RunLifecycleDependencies,
  RunLifecycleStatePort,
} from './contracts';

type OpenAttemptResolution =
  | { ready: true }
  | {
      ready: false;
      code: 'account_changed' | 'start_failed';
      error: string;
      retryable: boolean;
    };

async function resolveOpenAttemptBeforeStart(
  ownerUserId: string,
  commandId: string,
  dependencies: RunLifecycleDependencies,
  isCurrent: () => boolean,
): Promise<OpenAttemptResolution> {
  const openResult = await dependencies.authority.findOpenAttempt();
  if (!isCurrent()) {
    return {
      ready: false,
      code: 'account_changed',
      error: runError.accountChanged,
      retryable: true,
    };
  }
  if (openResult.error) {
    return {
      ready: false,
      code: 'start_failed',
      error: runError.previousRunCheckFailed,
      retryable: true,
    };
  }

  const openAttempt = openResult.data;
  if (!openAttempt || Date.parse(openAttempt.expiresAt) <= dependencies.now()) {
    return { ready: true };
  }
  if (openAttempt.status === 'started') {
    if (openAttempt.startCommandId === commandId) return { ready: true };
    return {
      ready: false,
      code: 'start_failed',
      error: runError.activeRunElsewhere(openAttempt.expiresAt),
      retryable: true,
    };
  }

  const verification = await dependencies.authority.verifyAttempt(openAttempt.attemptId);
  if (!isCurrent()) {
    return {
      ready: false,
      code: 'account_changed',
      error: runError.accountChanged,
      retryable: true,
    };
  }
  if (verification.error && !(verification.error instanceof RunVerificationRejectedError)) {
    return {
      ready: false,
      code: 'start_failed',
      error: runError.previousVerificationPending,
      retryable: true,
    };
  }
  if (verification.data) {
    void dependencies.refreshVerifiedProgression(ownerUserId);
  }
  return { ready: true };
}

export function createRunStartOrchestrator(
  context: RunLifecycleStatePort,
  dependencies: RunLifecycleDependencies,
): RunLifecycleActions['startRun'] {
  const { read: get, update: set } = context;
  return async (championIds, options = {}) => {
    const finishTransition = measureTransition('run_start');
    if (!dependencies.lifecycle.beginStart()) {
      finishTransition('error');
      return startFailure('start_in_progress', runError.startInProgress, true);
    }
    let transitionOutcome: 'ok' | 'error' = 'error';
    try {
      const result = await dependencies.withExclusiveStart(async () => {
        const currentState = get();
        if (currentState.isActive || currentState.isEnding) {
          return startFailure('active_run', runError.activeRun, currentState.isEnding);
        }
        const persistedActiveRun = dependencies.readPersistedActiveRun();
        if (persistedActiveRun) {
          return startFailure(
            'active_run_another_tab',
            runError.activeRunAnotherTab(persistedActiveRun.runId),
            true,
          );
        }

        const authState = dependencies.readAuthentication();
        if (
          authState.user &&
          (!authState.ready || !authState.player || !authState.isAuthenticated)
        ) {
          return startFailure('auth_not_ready', runError.profileNotReady, true);
        }
        const authUser = authState.ready ? authState.user : null;
        if (authUser && !dependencies.isOnline()) {
          return startFailure('start_failed', runError.onlineStartRequired, true);
        }
        const resumableStart =
          authUser && get().pendingAuthorityStart?.ownerUserId === authUser.id
            ? get().pendingAuthorityStart
            : null;
        const mode = resumableStart?.mode ?? options.mode ?? 'normal';
        const requestedChampionIds = resumableStart?.team ?? championIds;
        const teamValidation = validateRunStartTeam(
          requestedChampionIds,
          resumableStart ? requestedChampionIds.length : getRequiredStarterCount(mode),
        );
        if (!teamValidation.valid) {
          return startFailure(
            teamValidation.code ?? 'invalid_team_size',
            runStartValidationMessage(
              teamValidation.code,
              getRequiredStarterCount(mode),
              MAX_TEAM_SIZE,
            ),
          );
        }
        const team: TeamMember[] = teamValidation.championIds.map((id) => ({
          championId: id,
        }));
        if (!authUser && mode === 'normal') {
          await dependencies.initializeGuestRoster();
          const economyStore = dependencies.readChampionRoster();
          if (dependencies.readAuthentication().user)
            return startFailure('account_changed', runError.accountChanged, true);
          if (!economyStore.available || !economyStore.ready)
            return startFailure(
              'champion_roster_unavailable',
              runError.championRosterUnavailable,
              true,
            );
          if (
            economyStore.enabled &&
            team.some((member) => economyStore.getAccess(member.championId) === 'locked')
          ) {
            void dependencies.refreshChampionRoster();
            return startFailure('champion_locked', runError.championLocked);
          }
        }

        let canonicalMode = mode;
        const requestedRuneIds = resumableStart
          ? [...resumableStart.runeIds]
          : [...new Set((options.runeIds ?? []).filter(Boolean))].slice(0, 3);

        let runId: string;
        let seed: number;
        let startedAt: string;
        let authorityAttempt: RunAuthorityAttempt | null = null;
        let canonicalTeam = team;
        let canonicalRuneIds = requestedRuneIds;

        if (authUser) {
          const difficulty =
            resumableStart?.difficulty ?? options.difficulty ?? dependencies.readDifficulty();
          const requestedStart = {
            ownerUserId: authUser.id,
            mode,
            team: team.map((member) => member.championId),
            runeIds: requestedRuneIds,
            difficulty,
          } satisfies Omit<PendingRunAttemptStart, 'commandId'>;
          const pending = get().pendingAuthorityStart;
          const commandId =
            resumableStart?.commandId ??
            (samePendingStart(pending, requestedStart) ? pending.commandId : createCommandId());
          if (!commandId) {
            const error = runError.secureStartCommandUnavailable;
            set({ saveError: error });
            return startFailure('secure_command_unavailable', error);
          }

          const pendingAuthorityStart = { commandId, ...requestedStart };
          set({ pendingAuthorityStart, saveError: null });
          const isCurrentStart = () => {
            const state = get();
            return (
              dependencies.readAuthentication().user === authUser &&
              state.pendingAuthorityStart === pendingAuthorityStart &&
              !state.isActive &&
              !state.isEnding
            );
          };
          const accountChangedFailure = () =>
            startFailure('account_changed', runError.accountChanged, true);
          const startInput = {
            commandId,
            mode,
            team: requestedStart.team,
            runeIds: requestedRuneIds,
            difficulty,
          };
          const openAttemptResolution = await resolveOpenAttemptBeforeStart(
            authUser.id,
            commandId,
            dependencies,
            isCurrentStart,
          );
          if (!isCurrentStart()) return accountChangedFailure();
          if (!openAttemptResolution.ready) {
            set({ saveError: openAttemptResolution.error });
            return startFailure(
              openAttemptResolution.code,
              openAttemptResolution.error,
              openAttemptResolution.retryable,
            );
          }

          let attemptResult = await dependencies.authority.startAttempt(startInput);
          if (!isCurrentStart()) return accountChangedFailure();
          if (attemptResult.error?.message.includes('run_attempt_already_open')) {
            const racedAttemptResolution = await resolveOpenAttemptBeforeStart(
              authUser.id,
              commandId,
              dependencies,
              isCurrentStart,
            );
            if (!isCurrentStart()) return accountChangedFailure();
            if (!racedAttemptResolution.ready) {
              set({ saveError: racedAttemptResolution.error });
              return startFailure(
                racedAttemptResolution.code,
                racedAttemptResolution.error,
                racedAttemptResolution.retryable,
              );
            }
            attemptResult = await dependencies.authority.startAttempt(startInput);
            if (!isCurrentStart()) return accountChangedFailure();
          }
          if (attemptResult.error || !attemptResult.data) {
            const rawError = attemptResult.error?.message ?? '';
            const staleDailyOffer =
              mode === 'daily' && rawError.includes('daily_starter_not_offered');
            const expiredRotation =
              rawError.includes('champion_rotation_expired') ||
              rawError.includes('champion_access_expired');
            const lockedChampion = rawError.includes('champion_locked');
            const staleRoster = expiredRotation || lockedChampion;
            const error = rawError.includes('run_attempt_already_open')
              ? runError.previousAttemptOpen
              : staleDailyOffer
                ? runError.dailyStarterChanged
                : expiredRotation
                  ? runError.championRotationExpired
                  : lockedChampion
                    ? runError.championLocked
                    : runError.startFailed;
            set({
              saveError: error,
              ...(staleDailyOffer || staleRoster ? { pendingAuthorityStart: null } : {}),
            });
            if (staleRoster) void dependencies.refreshChampionRoster();
            return startFailure(
              staleDailyOffer
                ? 'daily_starter_not_offered'
                : expiredRotation
                  ? 'champion_rotation_expired'
                  : lockedChampion
                    ? 'champion_locked'
                    : 'start_failed',
              error,
              !staleDailyOffer && !staleRoster,
            );
          }
          const attempt = attemptResult.data;
          canonicalMode = attempt.mode;
          runId = attempt.runUuid;
          seed = attempt.seed;
          startedAt = attempt.startedAt;
          canonicalTeam = attempt.initialTeam.map((championId) => ({ championId }));
          canonicalRuneIds = attempt.runeIds;
          authorityAttempt = {
            attemptId: attempt.attemptId,
            runUuid: attempt.runUuid,
            ownerUserId: authUser.id,
            seed: attempt.seed,
            rulesetVersion: attempt.rulesetVersion,
            gameplayRulesetVersion: attempt.gameplayRulesetVersion,
            engineVersion: attempt.engineVersion,
            difficulty: attempt.difficulty,
            mode: attempt.mode,
            dailyDate: attempt.dailyDate,
            dailyRulesetVersion: attempt.dailyRulesetVersion,
            dailyScoreVersion: attempt.dailyScoreVersion,
            initialTeam: [...attempt.initialTeam],
            runeIds: [...attempt.runeIds],
            enhancementSnapshot: attempt.enhancementSnapshot,
            masterySnapshot: attempt.masterySnapshot,
            ...(attempt.championAccessSnapshot !== undefined
              ? {
                  championAccessSnapshot: attempt.championAccessSnapshot,
                  economyVersion: attempt.economyVersion ?? null,
                }
              : {}),
            startedAt: attempt.startedAt,
            expiresAt: attempt.expiresAt,
            status: attempt.status,
            commands: [],
            nextSequence: attempt.lastSequence + 1,
            lastAcknowledgedSequence: attempt.lastSequence,
            journalHash: attempt.journalHash,
            finishCommandId: null,
          };
        } else {
          runId = `run_${dependencies.now()}_${dependencies.random().toString(36).slice(2, 9)}`;
          seed = options.seed ?? dependencies.now();
          startedAt = new Date(dependencies.now()).toISOString();
        }

        // Authenticated content is generated only after the server has frozen
        // the seed/ruleset; guest mode keeps its local deterministic seed.
        const biomeMaps = generateBiomeMaps(
          seed,
          getRunChampionCatalog(authorityAttempt?.engineVersion),
        );
        const startBiome = biomeMaps[0]?.biome ?? null;
        const frontierNodeIds = biomeMaps[0]?.startNodeId ? [biomeMaps[0].startNodeId] : [];
        synchronizeMapFrontier(biomeMaps, 0, frontierNodeIds);

        set({
          isActive: true,
          mode: canonicalMode,
          runId,
          seed,
          startedAt,
          authorityAttempt,
          pendingAuthorityStart: null,
          isEnding: false,
          saveStatus: 'idle',
          saveError: null,
          saveFailureKind: null,
          saveDiagnostic: null,
          completedRunSnapshot: null,
          serverProgression: null,
          rewardsApplied: false,
          ledger: createRunLedger(canonicalTeam.map((member) => member.championId)),
          nextItemInstanceId: 1,
          team: canonicalTeam,
          runLevel: 1,
          biomesVisited: startBiome ? [startBiome] : [],
          currentBiome: startBiome,
          inventory: [],
          runeIds: canonicalRuneIds,
          runeStacks: {},
          augmentIds: [],
          pendingAugmentIds: [],
          lastCombatRewards: null,
          pendingSpellUpgradeChampionIds: [],
          gold: 0,
          currentWave: 1,
          totalWavesCompleted: 0,
          biomeMaps,
          currentBiomeIndex: 0,
          currentNodeId: null,
          frontierNodeIds,
          chosenPathNodeIds: [],
          completedNodeIds: [],
          claimedEncounterNodeIds: [],
          shopNodeStates: {},
          pendingEncounter: null,
          currentEncounter: null,
          combatCheckpointNodeId: null,
          combatRecoveryRequired: false,
        });
        setTechnicalCorrelation({ runId });
        return { success: true as const, runId, mode: canonicalMode };
      });
      transitionOutcome = result.success ? 'ok' : 'error';
      return result;
    } finally {
      dependencies.lifecycle.finishStart();
      finishTransition(transitionOutcome);
    }
  };
}
