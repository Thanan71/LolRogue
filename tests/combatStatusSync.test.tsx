// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { CCEffect } from '@/game/effects/CCEffect';
import { CCType } from '@/game/effects/types';
import { useBattleManager } from '@/hooks/useBattleManager';
import { useBattleStore } from '@/stores/battleStore';

describe('combat status store synchronization', () => {
  afterEach(() => {
    vi.useRealTimers();
    act(() => useBattleStore.getState().resetBattle());
  });

  it('syncs both teams from real effects after turn resolution and keeps silenced spells unavailable', async () => {
    vi.useFakeTimers();
    const players = [new ChampionInstance(championDB.getById('Annie')!, 1)];
    const enemies = [new ChampionInstance(championDB.getById('Ashe')!, 1)];
    const random = () => 0.5;
    const { result } = renderHook(() =>
      useBattleManager({
        playerTeam: players,
        enemyTeam: enemies,
        autoPlay: false,
        random,
      }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const manager = result.current.getManager()!;
    const ally = manager.getPlayerCombatants()[0];
    const enemy = manager.getEnemyCombatants()[0];
    const silence = new CCEffect({
      sourceId: enemy.targetId,
      targetId: ally.targetId,
      ccType: CCType.Silence,
      duration: 2,
    });
    const stun = new CCEffect({
      sourceId: ally.targetId,
      targetId: enemy.targetId,
      ccType: CCType.Stun,
      duration: 3,
    });
    act(() => {
      ally.effectManager.apply(silence);
      enemy.effectManager.apply(stun);
      if (manager.currentTurnEntry?.side === 'player')
        expect(
          result.current.submitAction({ type: ActionType.BasicAttack, targetId: enemy.targetId }),
        ).toBe(true);
      else result.current.processTurn();
    });
    const store = useBattleStore.getState();
    expect(store.playerTeam[0].statuses).toEqual([
      { id: silence.id, kind: CCType.Silence, turnsRemaining: silence.remainingRounds },
    ]);
    expect(store.enemyTeam[0].statuses).toEqual([
      { id: stun.id, kind: CCType.Stun, turnsRemaining: stun.remainingRounds },
    ]);
    expect(store.playerTeam[0].spells.every((spell) => !spell.isReady)).toBe(true);
  });
});
