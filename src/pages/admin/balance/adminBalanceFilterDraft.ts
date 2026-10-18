import { validateAdminBalanceFilters } from './adminBalanceClient';
import type { BalanceFilters } from './balanceTypes';

export interface AdminBalanceDraft {
  from: string;
  to: string;
  engineVersion: string;
  gameplayVersion: string;
  progressionVersion: string;
  commandVersion: string;
  contentHash: string;
  mode: 'all' | 'normal' | 'daily';
  difficulty: 'all' | 'easy' | 'normal' | 'hard';
  championId: string;
}

export function defaultAdminBalanceDraft(now = new Date()): AdminBalanceDraft {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    from: new Date(midnight - 28 * 86_400_000).toISOString().slice(0, 10),
    to: new Date(midnight - 86_400_000).toISOString().slice(0, 10),
    engineVersion: '',
    gameplayVersion: '',
    progressionVersion: '',
    commandVersion: '',
    contentHash: '',
    mode: 'all',
    difficulty: 'all',
    championId: '',
  };
}

function version(value: string): number | undefined {
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) throw new Error('Invalid balance version.');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1) throw new Error('Invalid balance version.');
  return result;
}

export function adminBalanceAppliedFilters(draft: AdminBalanceDraft): BalanceFilters {
  return validateAdminBalanceFilters({
    from: draft.from,
    to: draft.to,
    mode: draft.mode,
    difficulty: draft.difficulty,
    engineVersion: draft.engineVersion || undefined,
    gameplayVersion: version(draft.gameplayVersion),
    progressionVersion: version(draft.progressionVersion),
    commandVersion: version(draft.commandVersion),
    contentHash: draft.contentHash || undefined,
    championId: draft.championId || undefined,
  });
}
