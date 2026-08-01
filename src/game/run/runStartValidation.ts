import { MAX_TEAM_SIZE } from '@/types/run';
import { validateTeamChampionIds } from './teamRules';

const STARTER_SLOT_UNLOCKS = ['starter_slot_2', 'starter_slot_3'] as const;

type RunStartTeamErrorCode =
  | 'invalid_team_size'
  | 'duplicate_champion'
  | 'unknown_champion'
  | 'unsupported_champion'
  | 'starter_slots_locked';

export type RunStartTeamValidation =
  | { valid: true; championIds: string[]; error: null; code: null }
  | {
      valid: false;
      championIds: [];
      error: string;
      code: RunStartTeamErrorCode;
    };

export function getUnlockedStarterSlotCount(unlockedIds: Iterable<string>): number {
  const unlocks = new Set(unlockedIds);
  let slots = 1;
  for (const unlockId of STARTER_SLOT_UNLOCKS) {
    if (unlocks.has(unlockId)) slots += 1;
  }
  return Math.min(slots, MAX_TEAM_SIZE);
}

export function validateRunStartTeam(
  requestedChampionIds: readonly string[],
  unlockedStarterSlots: number,
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

  if (canonicalIds.length > unlockedStarterSlots) {
    return {
      valid: false,
      championIds: [],
      error: `Only ${unlockedStarterSlots} starting team slot${unlockedStarterSlots === 1 ? ' is' : 's are'} unlocked.`,
      code: 'starter_slots_locked',
    };
  }

  return { valid: true, championIds: canonicalIds, error: null, code: null };
}
