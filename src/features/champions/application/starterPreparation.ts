import type { IDailyRunRepository } from '@/services/interfaces/IDailyRunRepository';
import type { DailyChallenge } from '@/types/dailyRun';
import type { RunActions, RunLifecycleErrorCode } from '@/types/run';

export interface StarterPreparationInput {
  isDaily: boolean;
  isGuest: boolean;
  resumable: boolean;
  hasCompletedToday: boolean;
  challenge: DailyChallenge | null;
  championIds: string[];
  runeIds: string[];
  selectionSeed: number;
  dailySeed: number;
}

export interface StarterPreparationDependencies {
  startRun: RunActions['startRun'];
  daily: Pick<IDailyRunRepository, 'getDailyChallenge'>;
  isCurrent: () => boolean;
}

export type StarterPreparationResult =
  | { status: 'started' }
  | { status: 'stale' }
  | { status: 'blocked'; code: RunLifecycleErrorCode | 'daily_used' | 'daily_unavailable' }
  | { status: 'daily_offer_changed'; challenge: DailyChallenge | null };

/** UI orchestration only: canonical team/access/version validation stays in startRun. */
export async function prepareStarterRun(
  input: StarterPreparationInput,
  dependencies: StarterPreparationDependencies,
): Promise<StarterPreparationResult> {
  if (!dependencies.isCurrent()) return { status: 'stale' };
  if (input.isDaily) {
    if (input.hasCompletedToday && !input.resumable) {
      return { status: 'blocked', code: 'daily_used' };
    }
    if (
      !input.isGuest &&
      (!input.challenge || (input.challenge.hasAttempted && !input.resumable))
    ) {
      return {
        status: 'blocked',
        code: input.challenge?.hasAttempted ? 'daily_used' : 'daily_unavailable',
      };
    }
  }

  try {
    const result = await dependencies.startRun(input.championIds, {
      ...(input.isDaily
        ? {
            mode: 'daily' as const,
            seed: input.challenge?.seed ?? input.dailySeed,
            difficulty: input.challenge?.difficulty,
          }
        : { seed: input.selectionSeed }),
      runeIds: input.runeIds,
    });
    if (!dependencies.isCurrent()) return { status: 'stale' };
    if (result.success) return { status: 'started' };
    if (input.isDaily && result.code === 'daily_starter_not_offered') {
      // A guest has no authoritative offer to refresh.
      const refreshed = input.isGuest ? null : await dependencies.daily.getDailyChallenge();
      if (!dependencies.isCurrent()) return { status: 'stale' };
      return {
        status: 'daily_offer_changed',
        challenge: refreshed?.error ? null : (refreshed?.data ?? null),
      };
    }
    return { status: 'blocked', code: result.code };
  } catch {
    return dependencies.isCurrent()
      ? { status: 'blocked', code: 'start_failed' }
      : { status: 'stale' };
  }
}
