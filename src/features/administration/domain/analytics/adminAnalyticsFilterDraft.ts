import { validateAdminAnalyticsFilters } from './adminAnalyticsValidation';
import type { AnalyticsFilters } from './analyticsTypes';

export interface AdminAnalyticsDraft {
  from: string;
  to: string;
  granularity: 'day' | 'week';
  engineVersion: string;
  gameplayVersion: string;
  progressionVersion: string;
  commandVersion: string;
  contentHash: string;
  mode: 'all' | 'normal' | 'daily';
  difficulty: 'all' | 'easy' | 'normal' | 'hard';
  accountAge: 'all' | 'new' | 'existing';
}

export function defaultAdminAnalyticsDraft(now = new Date()): AdminAnalyticsDraft {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const day = 86_400_000;
  return {
    from: new Date(midnight - 28 * day).toISOString().slice(0, 10),
    to: new Date(midnight - day).toISOString().slice(0, 10),
    granularity: 'day',
    engineVersion: '',
    gameplayVersion: '',
    progressionVersion: '',
    commandVersion: '',
    contentHash: '',
    mode: 'all',
    difficulty: 'all',
    accountAge: 'all',
  };
}

function version(value: string): number | undefined {
  if (value === '') return undefined;
  if (!/^\d+$/.test(value)) throw new Error('Invalid analytics version.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error('Invalid analytics version.');
  return parsed;
}

export function adminAnalyticsAppliedFilters(draft: AdminAnalyticsDraft): AnalyticsFilters {
  return validateAdminAnalyticsFilters(
    {
      from: draft.from,
      to: draft.to,
      granularity: draft.granularity,
      mode: draft.mode,
      difficulty: draft.difficulty,
      accountAge: draft.accountAge,
      engineVersion: draft.engineVersion || undefined,
      gameplayVersion: version(draft.gameplayVersion),
      progressionVersion: version(draft.progressionVersion),
      commandVersion: version(draft.commandVersion),
      contentHash: draft.contentHash || undefined,
    },
    'series',
  );
}
