import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  AuthorityDifficulty as ReplayDifficulty,
  AuthorityRunMode as ReplayMode,
} from '@/game/authority/types';
import { isPersistedRunState } from '@/game/run/runPersistenceValidation';
import type { RunHistoryFilters } from '@/services/interfaces/IRunRepository';
import type { CandyAwardResult } from '@/services/masteryService';
import type {
  CombatantInfo as LegacyCombatantInfo,
  CombatStatusInfo as LegacyCombatStatusInfo,
  SpellInfo as LegacySpellInfo,
} from '@/stores/battleStore';
import { migratePersistedRunState } from '@/stores/persistence/runPersistence';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import type { Difficulty, BattleSpeed as LegacyBattleSpeed } from '@/stores/settingsStore';
import type { AccountWallet } from '@/types/championEconomy';
import type {
  BattleSpeed,
  CombatantInfo,
  CombatStatusInfo,
  SpellInfo,
} from '@/types/combatPresentation';
import type { Tables } from '@/types/database';
import type { ChampionMastery, MasteryActions, MasteryMap } from '@/types/mastery';
import type { ChampionMastery as ChampionMasteryRow } from '@/types/models';
import type { RunState } from '@/types/run';
import type {
  AuthorityDifficulty,
  AuthorityRunMode,
  RunAuthorityAttempt,
} from '@/types/runAttempt';

/** Pre-v8 attempt: optional mastery/gameplay/economy metadata was not retained. */
function legacyAttempt(): RunAuthorityAttempt {
  return {
    attemptId: 'historical-attempt',
    runUuid: 'historical-run',
    ownerUserId: 'historical-player',
    seed: 42,
    rulesetVersion: 3,
    engineVersion: 'run-engine-v7',
    difficulty: 'hard',
    mode: 'normal',
    initialTeam: ['Garen'],
    runeIds: [],
    enhancementSnapshot: {},
    startedAt: '2026-08-01T12:00:00.000Z',
    expiresAt: '2026-08-02T12:00:00.000Z',
    status: 'active',
    commands: [],
    nextSequence: 1,
    lastAcknowledgedSequence: 0,
    journalHash: 'historical-hash',
    finishCommandId: null,
  };
}

function legacyCache(): RunState {
  return {
    ...structuredClone(RUN_INITIAL_STATE),
    isActive: true,
    runId: 'historical-run',
    seed: 42,
    startedAt: '2026-08-01T12:00:00.000Z',
    authorityAttempt: legacyAttempt(),
    gold: 123.5,
    runLevel: 4,
    currentWave: 13,
    totalWavesCompleted: 12,
    team: [
      {
        championId: 'Garen',
        level: 4,
        currentHp: 88.75,
        currentMp: 22.5,
        currentXp: 13,
        statMultiplier: 1.125,
        statBoosts: { armor: 2.5 },
        spellRanks: { Q: 2, W: 1, E: 1, R: 1 },
      },
    ],
  };
}

describe('stable domain data contracts', () => {
  it('keeps browser/settings/history difficulty and run modes identical to replay values', () => {
    expectTypeOf<AuthorityDifficulty>().toEqualTypeOf<ReplayDifficulty>();
    expectTypeOf<AuthorityRunMode>().toEqualTypeOf<ReplayMode>();
    expectTypeOf<Difficulty>().toEqualTypeOf<ReplayDifficulty>();
    expectTypeOf<RunState['mode']>().toEqualTypeOf<ReplayMode>();
    expectTypeOf<RunHistoryFilters['difficulty']>().toEqualTypeOf<ReplayDifficulty | undefined>();
    expectTypeOf<RunHistoryFilters['mode']>().toEqualTypeOf<ReplayMode | undefined>();
    expectTypeOf<CandyAwardResult['updatedMasteries']>().toEqualTypeOf<MasteryMap>();
  });

  it('keeps generated rows distinct from calculated mastery and account wallet models', () => {
    expectTypeOf<ChampionMasteryRow>().toEqualTypeOf<Tables<'champion_mastery'>>();
    expectTypeOf<Parameters<MasteryActions['hydrateFromDatabase']>[0][number]>().toEqualTypeOf<
      Pick<ChampionMasteryRow, 'champion_id' | 'total_candies' | 'unlocked_ids'>
    >();
    expectTypeOf<ChampionMasteryRow>().not.toMatchTypeOf<ChampionMastery>();
    expectTypeOf<Tables<'account_wallets'>>().not.toMatchTypeOf<AccountWallet>();
    expectTypeOf<ChampionMastery['totalCandies']>().toEqualTypeOf<number>();
    expectTypeOf<AccountWallet['shardsBalance']>().toEqualTypeOf<number>();
  });

  it('keeps store compatibility exports identical to the shared combat display contract', () => {
    expectTypeOf<LegacyCombatantInfo>().toEqualTypeOf<CombatantInfo>();
    expectTypeOf<LegacyCombatStatusInfo>().toEqualTypeOf<CombatStatusInfo>();
    expectTypeOf<LegacySpellInfo>().toEqualTypeOf<SpellInfo>();
    expectTypeOf<LegacyBattleSpeed>().toEqualTypeOf<BattleSpeed>();
    expectTypeOf<BattleSpeed>().toEqualTypeOf<1 | 2 | 3>();
  });

  it('preserves schema-v7 fractional stats, enum values and exact historical authority metadata', () => {
    const cache = legacyCache();
    const serialized = JSON.stringify(cache);
    const parsed: unknown = JSON.parse(serialized);
    expect(isPersistedRunState(parsed)).toBe(true);
    const restored = migratePersistedRunState(parsed, 7);

    expect(restored.team).toEqual(cache.team);
    expect(restored.gold).toBe(123.5);
    expect(restored.runLevel).toBe(4);
    expect(restored.currentWave).toBe(13);
    expect(restored.totalWavesCompleted).toBe(12);
    expect(restored.mode).toBe('normal');
    expect(restored.authorityAttempt).toEqual(cache.authorityAttempt);
    expect(restored.authorityAttempt).not.toHaveProperty('masterySnapshot');
    expect(restored.authorityAttempt).not.toHaveProperty('gameplayRulesetVersion');
    expect(restored.authorityAttempt).not.toHaveProperty('championAccessSnapshot');
    expect(JSON.stringify(parsed)).toBe(serialized);
  });

  const invalidCaches: Array<[string, (state: Record<string, unknown>) => void]> = [
    [
      'gold string',
      (state) => {
        state.gold = '123.5';
      },
    ],
    [
      'mode case conversion',
      (state) => {
        state.mode = 'NORMAL';
      },
    ],
    [
      'mode ordinal',
      (state) => {
        state.mode = 0;
      },
    ],
    [
      'level string',
      (state) => {
        (state.team as Array<Record<string, unknown>>)[0].level = '4';
      },
    ],
    [
      'spell rank string',
      (state) => {
        (state.team as Array<Record<string, unknown>>)[0].spellRanks = { Q: '2' };
      },
    ],
    [
      'difficulty case conversion',
      (state) => {
        (state.authorityAttempt as Record<string, unknown>).difficulty = 'HARD';
      },
    ],
    [
      'progression version string',
      (state) => {
        (state.authorityAttempt as Record<string, unknown>).rulesetVersion = '3';
      },
    ],
    [
      'journal sequence string',
      (state) => {
        (state.authorityAttempt as Record<string, unknown>).nextSequence = '1';
      },
    ],
  ];

  it.each(invalidCaches)('rejects %s instead of coercing the historical cache', (_name, mutate) => {
    const parsed: Record<string, unknown> = JSON.parse(JSON.stringify(legacyCache()));
    mutate(parsed);
    expect(isPersistedRunState(parsed)).toBe(false);
  });
});
