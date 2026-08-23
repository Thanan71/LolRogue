import { MAX_TEAM_SIZE } from '@/types/run';
import type { AuthorityRunMode } from '@/types/runAttempt';
import { validateTeamChampionIds } from './teamRules';

export const NORMAL_STARTER_COUNT = 2;
export const DAILY_STARTER_COUNT = 1;

type RunStartTeamErrorCode =
  | 'invalid_team_size'
  | 'duplicate_champion'
  | 'unknown_champion'
  | 'unsupported_champion'
  | 'invalid_starter_count';

export type RunStartTeamValidation =
  | { valid: true; championIds: string[]; error: null; code: null }
  | {
      valid: false;
      championIds: [];
      error: string;
      code: RunStartTeamErrorCode;
    };

export function getRequiredStarterCount(mode: AuthorityRunMode): 1 | 2 {
  return mode === 'daily' ? DAILY_STARTER_COUNT : NORMAL_STARTER_COUNT;
}

export function validateRunStartTeam(
  requestedChampionIds: readonly string[],
  requiredStarterCount: number,
): RunStartTeamValidation {
  if (requestedChampionIds.length < 1 || requestedChampionIds.length > MAX_TEAM_SIZE) {
    return {
      valid: false,
      championIds: [],
      error: `Select between 1 and ${MAX_TEAM_SIZE} champions.`,
      code: 'invalid_team_size',
    };
  }

  const teamValidation = validateTeamChampionIds(requestedChampionIds, {
    minimumSize: 1,
    maximumSize: MAX_TEAM_SIZE,
  });
  if (!teamValidation.valid) {
    return {
      valid: false,
      championIds: [],
      error: teamValidation.message,
      code: teamValidation.code === 'team_full' ? 'invalid_team_size' : teamValidation.code,
    };
  }
  const canonicalIds = teamValidation.value;

  if (canonicalIds.length !== requiredStarterCount) {
    return {
      valid: false,
      championIds: [],
      error: `This mode requires exactly ${requiredStarterCount} starter${requiredStarterCount === 1 ? '' : 's'}.`,
      code: 'invalid_starter_count',
    };
  }

  return { valid: true, championIds: canonicalIds, error: null, code: null };
}
