import { resolveHistoricalAuthorityCombat } from '@/game/authority/historicalAuthority';
import type { AuthorityReplayResult } from '@/game/authority/types';
import { loadHistoricalAuthorityVerifier } from '@/game/authority/versionClientReplay.generated';
import { buildRunSummaryFromLedger } from '@/game/run/runLedger';
import { useAuthStore } from '@/stores/authStore';
import type { RunFinalizationOutcome } from '@/stores/runCombatFinalization';
import { useRunStore } from '@/stores/runStore';
import { projectHistoricalCombat } from './historicalCombatProjection';

export interface HistoricalCombatOutcome {
  replay: AuthorityReplayResult;
  finalization: RunFinalizationOutcome | null;
}

/** The lazy archive is loaded before reading the state that will be committed. */
export async function resumeHistoricalCombat(): Promise<HistoricalCombatOutcome> {
  const initial = useRunStore.getState();
  const identity = {
    runId: initial.runId,
    attemptId: initial.authorityAttempt?.attemptId,
    engineVersion: initial.authorityAttempt?.engineVersion,
    nodeId: initial.currentNodeId,
  };
  if (!identity.engineVersion) throw new Error('No historical authority attempt.');
  const verifier = await loadHistoricalAuthorityVerifier(identity.engineVersion);
  const state = useRunStore.getState();
  if (
    !verifier ||
    state.runId !== identity.runId ||
    state.authorityAttempt?.attemptId !== identity.attemptId ||
    state.currentNodeId !== identity.nodeId
  ) {
    throw new Error('The historical combat changed while its rules were loading.');
  }
  const resolution = resolveHistoricalAuthorityCombat(
    state,
    useAuthStore.getState().user?.id ?? null,
    verifier,
  );
  useRunStore.setState(
    projectHistoricalCombat(state, resolution.authorityAttempt, resolution.result),
  );
  if (!resolution.result.snapshot.terminal) {
    return { replay: resolution.result, finalization: null };
  }

  const terminal = useRunStore.getState();
  const summary = buildRunSummaryFromLedger({
    ledger: terminal.ledger,
    team: terminal.team,
    won: resolution.result.snapshot.won,
    wavesCompleted: terminal.totalWavesCompleted,
    biomesVisited: terminal.biomesVisited,
    goldBalance: terminal.gold,
    runLevel: terminal.runLevel,
  });
  const completion = await terminal.endRun(resolution.result.snapshot.won, state.runId, summary);
  const after = useRunStore.getState();
  return {
    replay: resolution.result,
    finalization: {
      runId: state.runId,
      summary,
      completed: completion.success,
      queuedForRetry:
        !completion.success &&
        after.completedRunSnapshot?.runId === state.runId &&
        after.saveFailureKind === 'retryable',
    },
  };
}
