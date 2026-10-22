import { projectHistoricalCombat } from '@/features/combat/application/historicalCombatProjection';
import type { HistoricalAuthorityVerifier } from '@/game/authority/historicalAuthority';
import {
  historicalAuthorityAttempt,
  historicalAuthorityCommands,
} from '@/game/authority/historicalAuthority';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { getRunChampionCatalog } from '@/game/run/runChampionCatalog';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import type { RunState } from '@/types/run';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

export const HISTORICAL_COMBAT_ENGINE = 'run-engine-0.2.5';
export const HISTORICAL_COMBAT_HASH =
  '9009950fe0b1c6944a26486e65b0bb0f1379129b42d7499f2bf1c0a8ce3391fa';

export function historicalCombatFixture(
  verifier: HistoricalAuthorityVerifier,
  overrides: Partial<
    Pick<
      RunAuthorityAttempt,
      'seed' | 'initialTeam' | 'difficulty' | 'enhancementSnapshot' | 'masterySnapshot'
    >
  > = {},
): RunState {
  const authorityAttempt: RunAuthorityAttempt = {
    attemptId: 'e5555555-5555-4555-8555-555555555555',
    runUuid: 'e4444444-4444-4444-8444-444444444444',
    ownerUserId: 'historical-player',
    seed: 0,
    rulesetVersion: 1,
    gameplayRulesetVersion: 24,
    engineVersion: HISTORICAL_COMBAT_ENGINE,
    difficulty: 'easy',
    mode: 'normal',
    initialTeam: ['Garen', 'Ashe'],
    runeIds: [],
    enhancementSnapshot: {
      Garen: { fighter_core_1: 1, fighter_bruiser_1: 1, fighter_bruiser_2: 1 },
    },
    masterySnapshot: { Garen: 4, Ashe: 4 },
    startedAt: '2026-10-22T10:00:00.000Z',
    expiresAt: '2026-10-23T10:00:00.000Z',
    status: 'active',
    commands: [
      {
        commandId: 'e6666666-6666-4666-8666-666666666666',
        sequence: 1,
        kind: 'move_node',
        payload: { node_id: 'node_top_lane_0' },
        dedupeKey: 'move_node:0:node_top_lane_0',
      },
    ],
    nextSequence: 2,
    lastAcknowledgedSequence: 0,
    journalHash: 'historical-journal-hash',
    finishCommandId: null,
    ...overrides,
  };
  const state = {
    ...structuredClone(RUN_INITIAL_STATE),
    isActive: true,
    runId: authorityAttempt.runUuid,
    seed: authorityAttempt.seed,
    startedAt: authorityAttempt.startedAt,
    authorityAttempt,
    biomeMaps: generateRunMap(
      authorityAttempt.seed,
      getRunChampionCatalog(authorityAttempt.engineVersion),
    ),
  };
  const result = verifier.replay(
    historicalAuthorityAttempt(authorityAttempt),
    historicalAuthorityCommands(authorityAttempt),
  );
  return { ...state, ...projectHistoricalCombat(state, authorityAttempt, result) };
}
