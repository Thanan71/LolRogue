import { appendRunAuthorityCommand } from '@/game/run/runAuthorityJournal';
import type { RunState } from '@/types/run';
import type { RunAuthorityAttempt, RunCommandInput } from '@/types/runAttempt';
import type { AuthorityReplayResult, AuthorityRunAttempt } from './types';
import { HISTORICAL_AUTHORITY_ENGINES } from './versionClientReplay.generated';

/** The only browser API needed from a byte-for-byte archived authority bundle. */
export interface HistoricalAuthorityVerifier {
  engineVersion: string;
  contentHash: string;
  replay(attempt: AuthorityRunAttempt, commands: unknown[]): AuthorityReplayResult;
}

export function requiresHistoricalAuthorityPlayback(engineVersion?: string): boolean {
  return engineVersion !== undefined && HISTORICAL_AUTHORITY_ENGINES.includes(engineVersion);
}

export function historicalAuthorityAttempt(attempt: RunAuthorityAttempt): AuthorityRunAttempt {
  return {
    runUuid: attempt.runUuid,
    seed: attempt.seed,
    difficulty: attempt.difficulty,
    mode: attempt.mode,
    team: attempt.initialTeam.map((championId) => ({ championId })),
    runeIds: [...attempt.runeIds],
    enhancementSnapshot: structuredClone(attempt.enhancementSnapshot),
    masterySnapshot: { ...attempt.masterySnapshot },
  };
}

/** Journal transport metadata is not part of the frozen engine command schema. */
export function historicalAuthorityCommands(attempt: RunAuthorityAttempt) {
  return attempt.commands.map(({ sequence, kind, payload }) => ({
    sequence,
    kind,
    payload: { ...payload },
  }));
}

export interface HistoricalCombatResolution {
  authorityAttempt: RunAuthorityAttempt;
  result: AuthorityReplayResult;
}

/**
 * Validate the entire saved prefix with its own engine before preparing a single
 * atomic journal/state update. No current battle, stat or reward code runs here.
 */
export function resolveHistoricalAuthorityCombat(
  state: RunState,
  currentUserId: string | null,
  verifier: HistoricalAuthorityVerifier,
): HistoricalCombatResolution {
  const attempt = state.authorityAttempt;
  const nodeId = state.currentNodeId;
  if (
    !attempt ||
    !nodeId ||
    !state.isActive ||
    state.isEnding ||
    state.completedRunSnapshot ||
    state.runId !== attempt.runUuid ||
    state.seed !== attempt.seed ||
    state.mode !== attempt.mode ||
    attempt.engineVersion !== verifier.engineVersion ||
    attempt.ownerUserId !== currentUserId ||
    !['started', 'active'].includes(attempt.status)
  ) {
    throw new Error('Historical combat no longer belongs to this active attempt.');
  }

  let candidate = attempt;
  const trustedAttempt = historicalAuthorityAttempt(attempt);
  const replay = () => verifier.replay(trustedAttempt, historicalAuthorityCommands(candidate));
  let result = replay();
  const pending = result.snapshot.pendingEncounter;
  const isPendingCombat =
    pending?.nodeId === nodeId && ['combat', 'elite', 'boss'].includes(pending.nodeType);
  const previousSummary = [...result.combatSummaries]
    .reverse()
    .find((entry) => entry.nodeId === nodeId);
  if (!isPendingCombat && !previousSummary) {
    throw new Error('The frozen authority has no combat at this saved position.');
  }

  const append = (command: RunCommandInput) => {
    const appended = appendRunAuthorityCommand(
      { ...state, authorityAttempt: candidate },
      currentUserId,
      command,
      `${command.kind}:${state.currentBiomeIndex}:${nodeId}`,
    );
    if (!appended.success || !appended.authorityAttempt) {
      throw new Error('Unable to append the historical combat command.');
    }
    candidate = appended.authorityAttempt;
    result = replay();
  };

  if (isPendingCombat && !pending!.claimed) {
    append({ kind: 'resolve_combat', nodeId });
  }
  if (
    !result.snapshot.terminal &&
    result.snapshot.pendingEncounter?.nodeId === nodeId &&
    result.snapshot.pendingEncounter.claimed
  ) {
    append({ kind: 'resolve_node', nodeId });
  }
  if (
    result.engineVersion !== attempt.engineVersion ||
    result.snapshot.runUuid !== attempt.runUuid
  ) {
    throw new Error('The frozen authority returned a different run identity.');
  }
  return { authorityAttempt: candidate, result };
}
