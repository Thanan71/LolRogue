import type { RunState } from '@/types/run';

export type RunLifecyclePhase =
  | 'inactive'
  | 'starting'
  | 'active'
  | 'finalizing'
  | 'recovery'
  | 'completed';

type LifecycleState = Pick<
  RunState,
  | 'isActive'
  | 'runId'
  | 'pendingAuthorityStart'
  | 'isEnding'
  | 'saveStatus'
  | 'saveFailureKind'
  | 'completedRunSnapshot'
>;

export function getRunLifecyclePhase(state: LifecycleState): RunLifecyclePhase {
  const hasCurrentCompletion =
    state.completedRunSnapshot !== null && state.completedRunSnapshot.runId === state.runId;
  if (hasCurrentCompletion && state.isActive) {
    if (state.isEnding || state.saveStatus === 'saving' || state.saveStatus === 'retrying') {
      return 'finalizing';
    }
    if (state.saveStatus === 'failed' && state.saveFailureKind === 'retryable') {
      return 'recovery';
    }
  }
  if (state.isActive) return 'active';
  if (state.completedRunSnapshot) return 'completed';
  if (state.pendingAuthorityStart) return 'starting';
  return 'inactive';
}

export type RunRouteIntent = 'start' | 'daily' | 'game-over';

export function getRunRouteRedirect(state: LifecycleState, intent: RunRouteIntent): string | null {
  const phase = getRunLifecyclePhase(state);
  if (intent === 'game-over') {
    if (phase === 'completed' || phase === 'finalizing' || phase === 'recovery') return null;
    return phase === 'active' ? '/run' : '/';
  }

  if (phase === 'finalizing' || phase === 'recovery') {
    return '/game-over';
  }
  if (phase === 'active') return '/run';
  return null;
}
