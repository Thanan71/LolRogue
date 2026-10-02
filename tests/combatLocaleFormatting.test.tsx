// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionType } from '@/game/battle/types';
import type { CombatantInfo } from '@/stores/battleStore';

function setStoredLocale(locale: 'fr-FR' | 'en-US'): void {
  window.localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: locale } }));
}

function combatant(
  id: string,
  name: string,
  side: 'player' | 'enemy',
  currentHp: number,
  maxHp: number,
): CombatantInfo {
  return {
    targetId: `${side}-${id}`,
    id,
    name,
    level: 1,
    currentHp,
    maxHp,
    currentMp: 0,
    maxMp: 0,
    iconUrl: '',
    isDefeated: false,
    side,
    spells: [],
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.resetModules();
});

describe('combat locale formatting', () => {
  it.each([
    {
      locale: 'fr-FR' as const,
      round: 'Tour 1 280',
      health: '1 280 / 2 400 PV',
      damage: '-1 280 PV',
      speed: 'Vitesse 2×',
      phase: 'Phase : Tour en cours',
    },
    {
      locale: 'en-US' as const,
      round: 'Round 1,280',
      health: '1,280 / 2,400 HP',
      damage: '-1,280 HP',
      speed: 'Speed 2×',
      phase: 'Phase: Turn in progress',
    },
  ])('formats arena values and speed controls in $locale', async (expected) => {
    setStoredLocale(expected.locale);
    vi.resetModules();

    const [
      { CombatStage },
      { BattleSpeedControl },
      { CombatUI },
      { useBattleStore },
      { useSettingsStore },
    ] = await Promise.all([
      import('@/components/CombatUI/CombatStage'),
      import('@/components/CombatUI/BattleSpeedControl'),
      import('@/components/CombatUI/CombatUI'),
      import('@/stores/battleStore'),
      import('@/stores/settingsStore'),
    ]);
    useSettingsStore.setState({ battleSpeed: 1, particlesEnabled: true });
    useBattleStore.setState({
      phase: 'turn_active',
      round: 1_280,
      currentTurnChampionId: null,
      currentTurnSide: null,
      playerTeam: [],
      enemyTeam: [],
      winner: null,
      isPlayerTurn: false,
    });

    const source = combatant('Lux', 'Lux', 'player', 1_280, 2_400);
    const target = combatant('Garen', 'Garen', 'enemy', 640, 2_000);
    const view = render(
      <>
        <CombatStage
          round={1_280}
          currentTurnChampionId={source.targetId}
          currentTurnSide="player"
          playerTeam={[source]}
          enemyTeam={[target]}
          visualEvent={{
            id: 1,
            kind: 'damage',
            action: ActionType.BasicAttack,
            sourceId: source.id,
            sourceCombatantId: source.targetId,
            sourceSide: 'player',
            targetId: target.id,
            targetCombatantId: target.targetId,
            targetSide: 'enemy',
            amount: 1_280,
          }}
          status=""
        />
        <BattleSpeedControl />
        <CombatUI />
      </>,
    );

    expect(view.container.querySelector('.combat-stage__topline span')?.textContent).toBe(
      expected.round,
    );
    expect(view.container.querySelector('.combat-stage__health-copy')?.textContent).toBe(
      expected.health,
    );
    expect(view.container.querySelector('.combat-stage__amount')?.textContent).toBe(
      expected.damage,
    );
    expect(screen.getByRole('radio', { name: expected.speed })).toHaveTextContent('2×');
    expect(view.container.querySelector('.combat-overlay__round')?.textContent).toBe(
      expected.round,
    );
    expect(view.container.querySelector('.combat-overlay__phase')).toHaveTextContent(
      expected.phase,
    );
  });
});
