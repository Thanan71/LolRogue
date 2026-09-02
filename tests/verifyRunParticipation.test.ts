import { describe, expect, it } from 'vitest';
import { deriveCompletedParticipation } from '../supabase/functions/verify-run/participation';

describe('verify-run v20 participation normalization', () => {
  it('excludes a terminal lost combat while preserving prior successful participation', () => {
    const participation = deriveCompletedParticipation([
      {
        winner: 'player',
        biome: 'top_lane',
        playerTeam: {
          initial: [{ championId: 'Garen' }, { championId: 'Lux' }],
        },
      },
      {
        winner: 'player',
        biome: 'jungle',
        playerTeam: {
          initial: [{ championId: 'Garen' }, { championId: 'Lux' }, { championId: 'Soraka' }],
        },
      },
      {
        winner: 'enemy',
        biome: 'mid_lane',
        playerTeam: {
          initial: [{ championId: 'Garen' }, { championId: 'Lux' }, { championId: 'Soraka' }],
        },
      },
    ]);

    expect(participation).toEqual({
      Garen: { wavesParticipated: 2, biomesParticipated: ['top_lane', 'jungle'] },
      Lux: { wavesParticipated: 2, biomesParticipated: ['top_lane', 'jungle'] },
      Soraka: { wavesParticipated: 1, biomesParticipated: ['jungle'] },
    });
  });

  it('returns zero participation for a champion whose first combat is the terminal loss', () => {
    const participation = deriveCompletedParticipation([
      {
        winner: 'enemy',
        biome: 'top_lane',
        playerTeam: { initial: [{ championId: 'Garen' }] },
      },
    ]);

    expect(participation).toEqual({});
  });
});
