import { describe, expect, it } from 'vitest';
import { replayAuthorityRun } from '@/game/authority';
import { buildVerifiedEconomyResult } from '../supabase/functions/verify-run/champion-economy';

const terminal = { terminal: true, won: false, totalWavesCompleted: 0, currentBiomeIndex: 0 };

describe('verified economic replay facts', () => {
  it('ignores visited biome counts, client reward assertions and team size', () => {
    expect(
      buildVerifiedEconomyResult({
        ...terminal,
        totalWavesCompleted: 4,
        currentBiomeIndex: 1,
        biomesVisited: ['top_lane', 'jungle'],
        team: [{ championId: 'Garen' }, { championId: 'Annie' }],
        shards_earned: 100000,
        biomes_completed: 6,
      }),
    ).toEqual({ version: 1, waves_completed: 4, biomes_completed: 1 });
  });

  it('does not grant a completed biome for an early defeat/abandon and counts Base only on victory', () => {
    expect(buildVerifiedEconomyResult(terminal)).toEqual({
      version: 1,
      waves_completed: 0,
      biomes_completed: 0,
    });
    expect(
      buildVerifiedEconomyResult({ ...terminal, currentBiomeIndex: 5, totalWavesCompleted: 20 }),
    ).toEqual({
      version: 1,
      waves_completed: 20,
      biomes_completed: 5,
    });
    expect(
      buildVerifiedEconomyResult({
        ...terminal,
        won: true,
        currentBiomeIndex: 5,
        totalWavesCompleted: 21,
      }),
    ).toEqual({
      version: 1,
      waves_completed: 21,
      biomes_completed: 6,
    });
  });

  it('accepts a real terminal v21 replay without altering combat or mastery semantics', () => {
    const replay = replayAuthorityRun(
      {
        runUuid: '11111111-1111-4111-8111-111111111111',
        seed: 4242,
        difficulty: 'normal',
        mode: 'normal',
        team: [{ championId: 'Garen' }],
        runeIds: [],
        enhancementSnapshot: {},
        masterySnapshot: {},
      },
      [{ sequence: 1, kind: 'abandon_run', payload: {} }],
    );
    expect(buildVerifiedEconomyResult({ ...replay.snapshot })).toEqual({
      version: 1,
      waves_completed: 0,
      biomes_completed: 0,
    });
    expect(replay.snapshot.ledger.version).toBe(2);
    expect(replay.engineVersion).toBe('run-engine-v21');
  });

  it.each([
    { terminal: false },
    { totalWavesCompleted: -1 },
    { totalWavesCompleted: 1.5 },
    { totalWavesCompleted: Number.NaN },
    { totalWavesCompleted: 10001 },
    { currentBiomeIndex: -1 },
    { currentBiomeIndex: 6 },
    { currentBiomeIndex: 0.5 },
    { won: 'true' },
    { won: true },
    { won: true, currentBiomeIndex: 5 },
  ])('rejects inconsistent or nonterminal replay facts %j', (extra) => {
    expect(buildVerifiedEconomyResult({ ...terminal, ...extra })).toBeNull();
  });
});
