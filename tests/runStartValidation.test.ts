import { describe, expect, it } from 'vitest';
import { getUnlockedStarterSlotCount, validateRunStartTeam } from '@/game/run/runStartValidation';

describe('run start team validation', () => {
  it('rejects empty, duplicate, unknown and unsupported teams instead of filtering them', () => {
    expect(validateRunStartTeam([], 1)).toMatchObject({
      valid: false,
      code: 'invalid_team_size',
    });
    expect(validateRunStartTeam(['Garen', 'Garen'], 2)).toMatchObject({
      valid: false,
      code: 'duplicate_champion',
    });
    expect(validateRunStartTeam(['DefinitelyUnknown'], 1)).toMatchObject({
      valid: false,
      code: 'unknown_champion',
    });
    expect(validateRunStartTeam(['Aatrox'], 1)).toMatchObject({
      valid: false,
      code: 'unsupported_champion',
    });
  });

  it('enforces unlocked starter slots and returns canonical champion IDs', () => {
    expect(getUnlockedStarterSlotCount([])).toBe(1);
    expect(getUnlockedStarterSlotCount(['starter_slot_2'])).toBe(2);
    expect(getUnlockedStarterSlotCount(['starter_slot_3', 'starter_slot_2'])).toBe(3);

    expect(validateRunStartTeam(['Garen', 'Lux'], 1)).toMatchObject({
      valid: false,
      code: 'starter_slots_locked',
    });
    expect(validateRunStartTeam(['garen', 'lux'], 2)).toEqual({
      valid: true,
      championIds: ['Garen', 'Lux'],
      error: null,
      code: null,
    });
  });
});
