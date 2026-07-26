import { championDB, implementedChampions } from '@/data';
import { MAX_TEAM_SIZE } from '@/types/run';

const STARTER_SLOT_UNLOCKS = ['starter_slot_2', 'starter_slot_3'] as const;

export interface RunStartTeamValidation {
  valid: boolean;
  championIds: string[];
  error: string | null;
  code:
    | 'invalid_team_size'
    | 'duplicate_champion'
    | 'unknown_champion'
    | 'unsupported_champion'
    | 'starter_slots_locked'
    | null;
}

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

  if (new Set(requestedChampionIds).size !== requestedChampionIds.length) {
    return {
      valid: false,
      championIds: [],
      error: 'A champion can only appear once in the starting team.',
      code: 'duplicate_champion',
    };
  }

  const supportedChampionIds = new Set(implementedChampions.map((champion) => champion.id));
  const canonicalIds: string[] = [];
  for (const championId of requestedChampionIds) {
    if (typeof championId !== 'string' || championId.length === 0) {
      return {
        valid: false,
        championIds: [],
        error: 'The starting team contains an invalid champion.',
        code: 'unknown_champion',
      };
    }
    const champion = championDB.getById(championId);
    if (!champion) {
      return {
        valid: false,
        championIds: [],
        error: `Unknown champion: ${championId}.`,
        code: 'unknown_champion',
      };
    }
    if (!supportedChampionIds.has(champion.id)) {
      return {
        valid: false,
        championIds: [],
        error: `Unsupported champion: ${championId}.`,
        code: 'unsupported_champion',
      };
    }
    canonicalIds.push(champion.id);
  }

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
