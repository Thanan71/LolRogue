import { runStatsTracker } from '@/services/RunStatsTracker';
import { useRunStore } from '@/stores/runStore';
import type { FinalCombatantState, RunSummary } from '@/types/run';

export interface RunFinalizationOutcome {
  runId: string;
  summary: RunSummary;
  /** True after a server save, terminal rejection, or complete guest save. */
  completed: boolean;
  /** True when a frozen local outbox remains available for a retry. */
  queuedForRetry: boolean;
}

/**
 * Capture terminal combat resources and freeze the completion snapshot before
 * any route transition. This module is independent from the CombatPage lifecycle.
 */
export async function finalizeCombatRun(
  winner: 'player' | 'enemy' | 'draw',
  finalPlayerStates: FinalCombatantState[],
): Promise<RunFinalizationOutcome> {
  const before = useRunStore.getState();
  const runId = before.runId;
  const won = winner === 'player';
  const byChampionId = new Map(
    finalPlayerStates.map((champion) => [champion.championId, champion] as const),
  );

  before.updateTeamAfterCombat(
    before.team.map((member) => {
      const finalState = byChampionId.get(member.championId);
      return {
        championId: member.championId,
        currentHp: finalState?.currentHp ?? (won ? member.currentHp : 0),
        currentMp: finalState?.currentMp ?? (won ? member.currentMp : 0),
        level: member.level ?? 1,
        currentXp: member.currentXp ?? 0,
      };
    }),
  );

  const terminalState = useRunStore.getState();
  runStatsTracker.markSurvived(
    terminalState.team
      .filter((member) => (member.currentHp ?? (won ? 1 : 0)) > 0)
      .map((member) => member.championId),
  );
  const summary = runStatsTracker.buildSummary({
    won,
    wavesCompleted: terminalState.totalWavesCompleted,
    biomesVisited: terminalState.biomesVisited,
    goldEarned: terminalState.gold,
    runLevel: terminalState.runLevel,
  });

  const completed = await terminalState.endRun(won, runId, summary);
  const after = useRunStore.getState();
  const queuedForRetry =
    !completed &&
    after.completedRunSnapshot?.runId === runId &&
    after.saveFailureKind === 'retryable';
  runStatsTracker.reset();

  return {
    runId,
    summary,
    completed,
    queuedForRetry,
  };
}
