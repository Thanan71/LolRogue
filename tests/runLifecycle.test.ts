import { describe, expect, it } from 'vitest';
import { createRunLedger } from '@/game/run/runLedger';
import { getRunRouteRedirect } from '@/game/run/runLifecycle';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import type { CompletedRunSnapshot, RunState, RunSummary } from '@/types/run';

const RUN_ID = 'attempt_22222222-2222-4222-8222-222222222222';

function recoveringRun(): RunState {
  const summary: RunSummary = {
    won: true,
    runLevel: 2,
    wavesCompleted: 3,
    biomesVisited: ['top_lane'],
    goldEarned: 100,
    goldSpent: 25,
    goldBalance: 75,
    itemEvents: [],
    totalKills: 1,
    totalDamage: 250,
    championStats: [],
  };
  const snapshot: CompletedRunSnapshot = {
    mode: 'normal',
    runId: RUN_ID,
    won: true,
    runLevel: 2,
    wavesCompleted: 3,
    biomesVisited: ['top_lane'],
    goldEarned: 100,
    goldSpent: 25,
    goldBalance: 75,
    ledger: createRunLedger(['Garen']),
    summary,
    teamMembers: [{ championId: 'Garen', level: 1, currentHp: 100, currentMp: 0 }],
    startedAt: '2026-10-10T12:00:00.000Z',
    seed: 42,
    runeIds: [],
    augmentIds: [],
    daily: null,
  };
  return {
    ...RUN_INITIAL_STATE,
    isActive: true,
    runId: RUN_ID,
    saveStatus: 'recovering',
    completedRunSnapshot: snapshot,
  };
}

describe('saved-result recovery route guards', () => {
  it('allows Game Over while waiting for authentication or the saved server receipt', () => {
    const run = recoveringRun();
    expect(run.isEnding).toBe(false);
    expect(getRunRouteRedirect(run, 'game-over')).toBeNull();
    expect(getRunRouteRedirect({ ...run, isEnding: true }, 'game-over')).toBeNull();
  });

  it.each(['start', 'daily'] as const)(
    'redirects %s to Game Over until recovery completes',
    (intent) => {
      const run = recoveringRun();
      expect(getRunRouteRedirect(run, intent)).toBe('/game-over');
      expect(getRunRouteRedirect({ ...run, isEnding: true }, intent)).toBe('/game-over');
      expect(
        getRunRouteRedirect({ ...run, isActive: false, saveStatus: 'saved' }, intent),
      ).toBeNull();
    },
  );

  it('allows the already completed Game Over route after finalization reset the active run', () => {
    expect(
      getRunRouteRedirect(
        { ...recoveringRun(), isActive: false, runId: '', saveStatus: 'saved' },
        'game-over',
      ),
    ).toBeNull();
  });

  it('does not redirect a different active run using a stale completion snapshot', () => {
    const run = { ...recoveringRun(), runId: 'different-active-run' };
    expect(getRunRouteRedirect(run, 'start')).toBe('/run');
    expect(getRunRouteRedirect(run, 'daily')).toBe('/run');
    expect(getRunRouteRedirect(run, 'game-over')).toBe('/run');
  });
});
