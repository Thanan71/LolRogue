import { afterEach, describe, expect, it } from 'vitest';
import { cloneRunLedger, createRunLedger } from '@/game/run/runLedger';
import { finalizeCombatRun } from '@/game/run/runFinalization';
import { useAuthStore } from '@/stores/authStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';

function setGuestRun(runId: string): void {
  useAuthStore.setState({
    isAuthenticated: false,
    isGuest: true,
    user: null,
    player: null,
  });
  useRunStore.setState({
    ...RUN_INITIAL_STATE,
    isActive: true,
    runId,
    seed: 42,
    startedAt: '2026-07-26T12:00:00.000Z',
    team: [{ championId: 'Garen', currentHp: 500, currentMp: 100, level: 2 }],
    biomesVisited: ['top_lane'],
    currentBiome: 'top_lane',
    totalWavesCompleted: 2,
    gold: 80,
    ledger: createRunLedger(['Garen']),
  });
}

describe('terminal run finalization', () => {
  afterEach(() => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    useAuthStore.setState({
      isAuthenticated: false,
      isGuest: false,
      user: null,
      player: null,
    });
  });

  it.each([
    ['victory', 'player' as const, true, 125, 41],
    ['defeat', 'enemy' as const, false, 0, 9],
  ])('freezes and saves a %s with final HP and mana', async (_, winner, won, hp, mp) => {
    setGuestRun(`guest-${winner}`);
    const ledger = cloneRunLedger(useRunStore.getState().ledger);
    ledger.champions.Garen.damageDealt = 250;
    ledger.gold.earned = 80;
    useRunStore.setState({ ledger });

    const result = await finalizeCombatRun(winner, [
      { championId: 'Garen', currentHp: hp, maxHp: 620, currentMp: mp, maxMp: 100 },
    ]);

    expect(result).toMatchObject({ completed: true, queuedForRetry: false });
    expect(result.summary).toMatchObject({ totalDamage: 250, goldEarned: 80 });
    expect(useRunStore.getState()).toMatchObject({
      isActive: false,
      saveStatus: 'saved',
      completedRunSnapshot: {
        won,
        teamMembers: [{ championId: 'Garen', currentHp: hp, currentMp: mp }],
      },
    });
  });

  it('keeps default resources for a non-combat victory fallback', async () => {
    setGuestRun('guest-exit-victory');
    useRunStore.setState({ team: [{ championId: 'Lux', level: 2 }] });

    await expect(finalizeCombatRun('player', [])).resolves.toMatchObject({
      completed: true,
      queuedForRetry: false,
    });

    const member = useRunStore.getState().completedRunSnapshot?.teamMembers[0];
    expect(member?.currentHp).toBeGreaterThan(0);
    expect(member?.currentMp).toBeGreaterThan(0);
  });
});
