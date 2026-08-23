import { describe, expect, it } from 'vitest';
import { getRequiredStarterCount, validateRunStartTeam } from '@/game/run/runStartValidation';

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

  it('enforces fixed comparable starter counts and returns canonical champion IDs', () => {
    expect(getRequiredStarterCount('normal')).toBe(2);
    expect(getRequiredStarterCount('daily')).toBe(1);

    expect(validateRunStartTeam(['Garen', 'Lux'], 1)).toMatchObject({
      valid: false,
      code: 'invalid_starter_count',
    });
    expect(validateRunStartTeam(['garen', 'lux'], 2)).toEqual({
      valid: true,
      championIds: ['Garen', 'Lux'],
      error: null,
      code: null,
    });
    expect(validateRunStartTeam(['garen'], getRequiredStarterCount('daily'))).toEqual({
      valid: true,
      championIds: ['Garen'],
      error: null,
      code: null,
    });
  });
});
