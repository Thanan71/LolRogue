import { shouldApplyRunRewards } from '@/game/run/runState';
import { runError } from '@/i18n/runErrorContent';
import { recordTechnicalMetric } from '@/observability/technicalMetrics';
import { runEndFailure as endFailure } from '@/services/runLifecycleService';
import type { RunSummary } from '@/types/run';
import { logger } from '@/utils/logger';
import { measureTransition, recordTechnicalEvent } from '@/utils/observability';
import type {
  RunLifecycleActions,
  RunLifecycleDependencies,
  RunLifecycleStatePort,
} from './contracts';
import { submitRunAuthoritySnapshot } from './runAuthoritySubmission';
import { createCompletedRunSnapshot } from './runSnapshot';

export function createRunFinalizationOrchestrator(
  context: RunLifecycleStatePort,
  dependencies: RunLifecycleDependencies,
): RunLifecycleActions['endRun'] {
  const { read: get, update: set } = context;
  return async (won = false, expectedRunId?: string, displayedSummary?: RunSummary) => {
    const requestedRunId = expectedRunId ?? get().runId;
    if (expectedRunId !== undefined && get().runId !== expectedRunId) {
      return endFailure(requestedRunId, 'stale_run', runError.staleRun);
    }
    if (!get().isActive) {
      return {
        success: true,
        runId: requestedRunId,
        outcome: 'already_finalized',
      };
    }
    const inFlightFinalization = dependencies.lifecycle.getFinalization();
    if (inFlightFinalization) {
      if (inFlightFinalization.runId !== requestedRunId) {
        return endFailure(
          requestedRunId,
          'finalization_in_progress',
          runError.finalizationInProgress,
          true,
        );
      }
      const succeeded = await inFlightFinalization.promise;
      const state = get();
      return succeeded
        ? {
            success: true,
            runId: requestedRunId,
            outcome: state.saveFailureKind === 'terminal' ? 'terminal' : 'saved',
          }
        : endFailure(
            requestedRunId,
            'finalization_failed',
            state.saveError ?? runError.finalizationFailed,
            state.saveFailureKind !== 'terminal',
          );
    }

    const operation = (async (): Promise<boolean> => {
      let state = get();

      // Guard: Don't end a run that's already ended
      if (!state.isActive) {
        return true;
      }

      // This prevents stale callbacks from a previous run ending a new one.
      if (expectedRunId !== undefined && state.runId !== expectedRunId) {
        return false;
      }

      const authorityCommands = state.authorityAttempt?.commands ?? [];
      const lastCommand = authorityCommands[authorityCommands.length - 1];
      const abandonDedupeKey = `abandon_run:${state.runId}`;
      const hasRecordedAbandonment = authorityCommands.some(
        (command) => command.dedupeKey === abandonDedupeKey,
      );
      const pendingNodeType = state.pendingEncounter?.nodeType;
      const isImmediateCombatLoss =
        (pendingNodeType === 'combat' ||
          pendingNodeType === 'elite' ||
          pendingNodeType === 'boss') &&
        lastCommand?.kind === 'resolve_combat' &&
        lastCommand.payload.node_id === state.pendingEncounter?.nodeId;
      const isExplicitAbandonment =
        !won && displayedSummary === undefined && !isImmediateCombatLoss;
      if (
        !won &&
        state.authorityAttempt &&
        state.completedRunSnapshot?.runId !== state.runId &&
        !isImmediateCombatLoss &&
        !hasRecordedAbandonment &&
        !get().recordRunCommand({ kind: 'abandon_run' }, abandonDedupeKey)
      ) {
        set({
          saveStatus: 'failed',
          saveError: runError.abandonmentFailed,
          saveFailureKind: 'retryable',
        });
        return false;
      }
      state = get();

      recordTechnicalMetric({
        metric: 'run_finalization',
        outcome: state.completedRunSnapshot?.runId === state.runId ? 'retry' : 'initial',
        engineVersion: state.authorityAttempt?.engineVersion,
        gameplayRulesetVersion: state.authorityAttempt?.gameplayRulesetVersion,
        progressionRulesetVersion: state.authorityAttempt?.rulesetVersion,
      });
      if (state.completedRunSnapshot?.runId === state.runId) {
        recordTechnicalEvent(
          { type: 'retry', operation: 'run_finalization', attempt: 1 },
          { runId: state.runId, commandId: state.authorityAttempt?.finishCommandId },
        );
      }

      set({
        isEnding: true,
        saveStatus:
          state.completedRunSnapshot?.runId === state.runId &&
          state.authorityAttempt?.status === 'verified'
            ? 'recovering'
            : state.completedRunSnapshot?.runId === state.runId
              ? 'retrying'
              : 'saving',
        saveError: null,
        saveFailureKind: null,
      });

      let snapshot =
        state.completedRunSnapshot?.runId === state.runId ? state.completedRunSnapshot : null;

      if (!snapshot) {
        snapshot = createCompletedRunSnapshot(
          state,
          won,
          displayedSummary,
          isExplicitAbandonment,
          dependencies,
        );
        set({ completedRunSnapshot: snapshot, serverProgression: null });
      }

      const { user, player } = dependencies.readAuthentication();
      const authorityAttempt = state.authorityAttempt;
      const hasAuthenticatedAccount = user !== null;
      const isVerifiedRun = authorityAttempt !== null;
      const championIds = snapshot.teamMembers.map((member) => member.championId);

      // Only a run that was started without an authenticated account may use
      // local progression. A legacy/authenticated run cannot be promoted into
      // a verified attempt at completion time.
      if (
        !hasAuthenticatedAccount &&
        !isVerifiedRun &&
        shouldApplyRunRewards(state.rewardsApplied, championIds.length, snapshot.wavesCompleted)
      ) {
        dependencies.awardGuestCandies(
          championIds,
          snapshot.wavesCompleted,
          snapshot.biomesVisited.length,
          snapshot.won,
          snapshot.summary.championStats.map((stats) => ({
            championId: stats.championId,
            wavesParticipated: stats.wavesParticipated,
            biomesParticipated: stats.biomesParticipated?.length,
          })),
        );
        set({ rewardsApplied: true });
      }

      // Save run to database (if user is authenticated)
      logger.debug('[runStore.endRun] Checking save conditions:', {
        hasUser: !!user,
        hasPlayer: !!player,
        hasAuthorityAttempt: isVerifiedRun,
        hasRunStartTime: !!snapshot.startedAt,
        totalWavesCompleted: snapshot.wavesCompleted,
        runId: snapshot.runId,
        won: snapshot.won,
      });

      if (hasAuthenticatedAccount && !snapshot.startedAt) {
        set({
          ...dependencies.initialState,
          completedRunSnapshot: snapshot,
          saveStatus: 'failed',
          saveError: runError.missingSaveData,
          saveFailureKind: 'terminal',
        });
        return true;
      }

      let serverProgression = state.serverProgression;
      if (hasAuthenticatedAccount && !authorityAttempt) {
        set({
          ...dependencies.initialState,
          completedRunSnapshot: snapshot,
          saveStatus: 'failed',
          saveError: runError.missingServerAttempt,
          saveFailureKind: 'terminal',
        });
        return true;
      }

      if (authorityAttempt) {
        const submission = await submitRunAuthoritySnapshot(
          context,
          dependencies,
          snapshot,
          authorityAttempt,
          user,
        );
        if (submission.status !== 'verified') return submission.status === 'terminal';
        snapshot = submission.snapshot;
        serverProgression = submission.progression;
      }

      if (snapshot.mode === 'daily' && snapshot.daily) {
        if (!snapshot.daily.abandoned) {
          const refreshedPlayer = dependencies.readAuthentication().player;
          dependencies.recordDailyCompletion({
            playerName:
              refreshedPlayer?.display_name ||
              refreshedPlayer?.username ||
              user?.email?.split('@')[0] ||
              'Guest',
            score: snapshot.daily.score,
            wavesCompleted: snapshot.wavesCompleted,
            runLevel: snapshot.runLevel,
            persistInLocalLeaderboard: !isVerifiedRun,
          });
        }
      }

      set({
        ...dependencies.initialState,
        completedRunSnapshot: snapshot,
        serverProgression,
        // Retain only the existing attempt identity/journal for a reload to
        // recover the durable result, without creating a second attempt.
        authorityAttempt: authorityAttempt ? get().authorityAttempt : null,
        saveStatus: 'saved',
      });
      return true;
    })();

    dependencies.lifecycle.trackFinalization(requestedRunId, operation);
    const finishTransition = measureTransition('run_finalization', { runId: requestedRunId });
    try {
      const succeeded = await operation;
      finishTransition(succeeded ? 'ok' : 'error');
      const state = get();
      return succeeded
        ? {
            success: true,
            runId: requestedRunId,
            outcome: state.saveFailureKind === 'terminal' ? 'terminal' : 'saved',
          }
        : endFailure(
            requestedRunId,
            'finalization_failed',
            state.saveError ?? runError.finalizationFailed,
            state.saveFailureKind !== 'terminal',
          );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finishTransition('error');
      recordTechnicalEvent(
        { type: 'save_failure', reason: message, retryable: true },
        { runId: requestedRunId, commandId: get().authorityAttempt?.finishCommandId },
      );
      logger.error('[runStore.endRun] Unexpected finalization failure:', error);
      if (get().runId !== requestedRunId) {
        return endFailure(requestedRunId, 'stale_run', runError.staleRun);
      }
      set({
        isEnding: false,
        saveStatus: 'failed',
        saveError: runError.finalizationFailed,
        saveFailureKind: 'retryable',
      });
      return endFailure(requestedRunId, 'finalization_failed', runError.finalizationFailed, true);
    } finally {
      dependencies.lifecycle.clearFinalization(operation);
    }
  };
}
