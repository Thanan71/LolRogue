import { createRunCommandId as createCommandId } from '@/game/run/runAuthorityJournal';
import { runError } from '@/i18n/runErrorContent';
import {
  RunVerificationRejectedError,
  RunVerificationRetryableError,
} from '@/services/runAttemptService';
import type { CompletedRunSnapshot, RunState } from '@/types/run';
import type { RunAuthorityAttempt } from '@/types/runAttempt';
import type {
  RunAuthenticationSnapshot,
  RunLifecycleDependencies,
  RunLifecycleStatePort,
} from './contracts';
import { cloneRunSummary } from './runSnapshot';

export type RunAuthoritySubmissionResult =
  | { status: 'terminal' | 'retryable' }
  | {
      status: 'verified';
      snapshot: CompletedRunSnapshot;
      progression: RunState['serverProgression'];
    };

function isCurrentSubmission(
  context: RunLifecycleStatePort,
  dependencies: RunLifecycleDependencies,
  snapshot: CompletedRunSnapshot,
  attempt: RunAuthorityAttempt,
  userId: string,
): boolean {
  const current = context.read();
  if (
    current.runId !== snapshot.runId ||
    current.authorityAttempt?.attemptId !== attempt.attemptId
  ) {
    return false;
  }
  if (dependencies.readAuthentication().user?.id === userId) return true;
  context.update({
    isEnding: false,
    saveStatus: 'failed',
    saveError: runError.attemptOwnerChanged,
    saveFailureKind: 'retryable',
  });
  return false;
}

/** Flush, seal, verify or recover the same frozen attempt. Never create another attempt on retry. */
export async function submitRunAuthoritySnapshot(
  context: RunLifecycleStatePort,
  dependencies: RunLifecycleDependencies,
  snapshot: CompletedRunSnapshot,
  authorityAttempt: RunAuthorityAttempt,
  user: RunAuthenticationSnapshot['user'],
): Promise<RunAuthoritySubmissionResult> {
  const { read: get, update: set } = context;
  let serverProgression = get().serverProgression;

  if (!user || user.id !== authorityAttempt.ownerUserId) {
    set({
      isEnding: false,
      saveStatus: 'failed',
      saveError: runError.attemptOwnerChanged,
      saveFailureKind: 'retryable',
    });
    return { status: 'retryable' };
  }
  if (!isCurrentSubmission(context, dependencies, snapshot, authorityAttempt, user.id)) {
    return { status: 'retryable' };
  }

  let syncedAttempt = authorityAttempt;
  // A persisted success is an untrusted hint to read the durable
  // receipt. Never append commands or seal it again on this path.
  if (syncedAttempt.status !== 'verified') {
    let finishCommandId = syncedAttempt.finishCommandId;
    if (!finishCommandId) {
      finishCommandId = createCommandId();
      if (!finishCommandId) {
        set({
          ...dependencies.initialState,
          completedRunSnapshot: snapshot,
          saveStatus: 'failed',
          saveError: runError.secureFinishCommandUnavailable,
          saveFailureKind: 'terminal',
        });
        return { status: 'terminal' };
      }
      syncedAttempt = { ...syncedAttempt, finishCommandId };
      set({ authorityAttempt: syncedAttempt });
    }

    const pendingCommands = syncedAttempt.commands.filter(
      (command) => command.sequence > syncedAttempt.lastAcknowledgedSequence,
    );
    for (let offset = 0; offset < pendingCommands.length; offset += 50) {
      const batch = pendingCommands.slice(offset, offset + 50);
      const appendResult = await dependencies.authority.appendCommands(
        syncedAttempt.attemptId,
        batch,
      );
      if (!isCurrentSubmission(context, dependencies, snapshot, syncedAttempt, user.id)) {
        return { status: 'retryable' };
      }
      if (appendResult.data?.status === 'expired' || appendResult.data?.status === 'rejected') {
        set({
          ...dependencies.initialState,
          completedRunSnapshot: snapshot,
          saveStatus: 'failed',
          saveError:
            appendResult.data.status === 'expired'
              ? runError.attemptExpired
              : runError.traceRejected(null),
          saveFailureKind: 'terminal',
          saveDiagnostic: {
            attemptId: syncedAttempt.attemptId,
            engineVersion: syncedAttempt.engineVersion,
            rejectionCode:
              appendResult.data.status === 'expired' ? 'run_attempt_expired' : 'trace_rejected',
          },
        });
        return { status: 'terminal' };
      }
      if (appendResult.error || !appendResult.data) {
        set({
          isEnding: false,
          saveStatus: 'failed',
          saveError: runError.journalSyncFailed,
          saveFailureKind: 'retryable',
          saveDiagnostic: {
            attemptId: syncedAttempt.attemptId,
            engineVersion: syncedAttempt.engineVersion,
            rejectionCode: 'journal_sync_failed',
          },
        });
        return { status: 'retryable' };
      }
      syncedAttempt = {
        ...syncedAttempt,
        status: appendResult.data.status,
        lastAcknowledgedSequence: appendResult.data.lastSequence,
        journalHash: appendResult.data.journalHash,
      };
      set({ authorityAttempt: syncedAttempt });
    }

    const expectedSequence = syncedAttempt.nextSequence - 1;
    const sealResult = await dependencies.authority.sealAttempt(
      syncedAttempt.attemptId,
      finishCommandId,
      expectedSequence,
      {
        engineVersion: syncedAttempt.engineVersion,
        gameplayRulesetVersion: syncedAttempt.gameplayRulesetVersion,
        progressionRulesetVersion: syncedAttempt.rulesetVersion,
      },
    );
    if (!isCurrentSubmission(context, dependencies, snapshot, syncedAttempt, user.id)) {
      return { status: 'retryable' };
    }
    if (sealResult.data?.status === 'expired' || sealResult.data?.status === 'rejected') {
      set({
        ...dependencies.initialState,
        completedRunSnapshot: snapshot,
        saveStatus: 'failed',
        saveError:
          sealResult.data.status === 'expired'
            ? runError.attemptExpired
            : runError.traceRejected(null),
        saveFailureKind: 'terminal',
        saveDiagnostic: {
          attemptId: syncedAttempt.attemptId,
          engineVersion: syncedAttempt.engineVersion,
          rejectionCode:
            sealResult.data.status === 'expired' ? 'run_attempt_expired' : 'trace_rejected',
        },
      });
      return { status: 'terminal' };
    }
    if (sealResult.error || !sealResult.data) {
      set({
        isEnding: false,
        saveStatus: 'failed',
        saveError: runError.sealFailed,
        saveFailureKind: 'retryable',
        saveDiagnostic: {
          attemptId: syncedAttempt.attemptId,
          engineVersion: syncedAttempt.engineVersion,
          rejectionCode: 'attempt_seal_failed',
        },
        authorityAttempt: syncedAttempt,
      });
      return { status: 'retryable' };
    }

    syncedAttempt = {
      ...syncedAttempt,
      status: sealResult.data.status === 'verified' ? 'verified' : 'verifying',
      lastAcknowledgedSequence: sealResult.data.lastSequence,
      journalHash: sealResult.data.journalHash,
    };
    set({ authorityAttempt: syncedAttempt });
  }

  const verification =
    syncedAttempt.status === 'verified'
      ? await dependencies.authority.recoverAttempt(syncedAttempt.attemptId)
      : await dependencies.authority.verifyAttempt(syncedAttempt.attemptId);
  // A late receipt must not complete a different run or restore the
  // previous account's rewards after logout/account switching.
  if (
    get().runId !== snapshot.runId ||
    get().authorityAttempt?.attemptId !== syncedAttempt.attemptId
  ) {
    return { status: 'retryable' };
  }
  if (dependencies.readAuthentication().user?.id !== user.id) {
    set({
      isEnding: false,
      saveStatus: 'failed',
      saveError: runError.attemptOwnerChanged,
      saveFailureKind: 'retryable',
    });
    return { status: 'retryable' };
  }
  if (verification.error || !verification.data) {
    if (verification.error instanceof RunVerificationRejectedError) {
      set({
        ...dependencies.initialState,
        completedRunSnapshot: snapshot,
        saveStatus: 'failed',
        saveError: verification.error.message,
        saveFailureKind: 'terminal',
        saveDiagnostic: {
          attemptId: syncedAttempt.attemptId,
          engineVersion: syncedAttempt.engineVersion,
          rejectionCode: verification.error.code,
        },
      });
      return { status: 'terminal' };
    }
    set({
      isEnding: false,
      saveStatus: 'failed',
      saveError: verification.error?.message ?? runError.verificationFailed(),
      saveFailureKind: 'retryable',
      saveDiagnostic: {
        attemptId: syncedAttempt.attemptId,
        engineVersion: syncedAttempt.engineVersion,
        rejectionCode:
          verification.error instanceof RunVerificationRetryableError
            ? verification.error.code
            : 'verification_unavailable',
      },
      authorityAttempt: syncedAttempt,
    });
    return { status: 'retryable' };
  }

  serverProgression = verification.data.progression;
  if (verification.data.summary) {
    const canonicalSummary = cloneRunSummary(verification.data.summary);
    snapshot = {
      ...snapshot,
      won: canonicalSummary.won,
      runLevel: canonicalSummary.runLevel,
      wavesCompleted: canonicalSummary.wavesCompleted,
      biomesVisited: [...canonicalSummary.biomesVisited],
      goldEarned: canonicalSummary.goldEarned,
      goldSpent: canonicalSummary.goldSpent,
      goldBalance: canonicalSummary.goldBalance,
      summary: canonicalSummary,
    };
    set({ completedRunSnapshot: snapshot });
  }
  set({
    serverProgression,
    authorityAttempt: { ...syncedAttempt, status: 'verified' },
  });
  // The durable server result is the completion boundary. Profile and
  // mastery hydration are best-effort and must never block Game Over.
  void dependencies.refreshVerifiedProgression(user.id);
  if (serverProgression.shardEconomyVersion === 1) void dependencies.refreshChampionRoster();
  return { status: 'verified', snapshot, progression: serverProgression };
}
