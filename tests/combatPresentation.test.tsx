// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CombatStage } from '@/components/CombatUI/CombatStage';
import { riotSpellIconUrl } from '@/config/riotSpellAssets';
import { championDB } from '@/data/championDatabase';
import { ActionType } from '@/game/battle/types';
import { isActionTargeting } from '@/game/battle/targetResolver';
import { getCombatVisualProfile } from '@/game/presentation/combatVisuals';
import { type CombatantInfo, useBattleStore } from '@/stores/battleStore';
import { useSettingsStore } from '@/stores/settingsStore';

const implementedChampionIds = [
  'Annie',
  'Ashe',
  'Darius',
  'Garen',
  'Jinx',
  'Leona',
  'Lux',
  'Malphite',
  'Soraka',
  'Warwick',
] as const;

const actions = [
  ActionType.SpellQ,
  ActionType.SpellW,
  ActionType.SpellE,
  ActionType.SpellR,
] as const;

function combatant(id: string, side: 'player' | 'enemy', targetId: string): CombatantInfo {
  const champion = championDB.getById(id);
  if (!champion) throw new Error(`Missing champion ${id}`);
  return {
    targetId,
    id,
    name: champion.name,
    level: 1,
    currentHp: 420,
    maxHp: 600,
    currentMp: 80,
    maxMp: 100,
    iconUrl: champion.iconUrl,
    isDefeated: false,
    side,
    spells: champion.spells.map((spell, index) => {
      if (!isActionTargeting(spell.targeting)) {
        throw new Error(`Unsupported targeting for ${id} ${spell.name}`);
      }
      return {
        slot: (['Q', 'W', 'E', 'R'] as const)[index],
        name: spell.name,
        cooldownMax: 5,
        cooldownCurrent: 0,
        cost: 20,
        isReady: true,
        targeting: spell.targeting,
        iconUrl: riotSpellIconUrl(id, spell.image),
      };
    }),
  };
}

describe('combat presentation', () => {
  afterEach(() => {
    useBattleStore.getState().resetBattle();
    useSettingsStore.setState({ particlesEnabled: true, battleSpeed: 1 });
  });

  it('defines a distinct visual profile and a packaged Data Dragon icon for every ability', () => {
    for (const championId of implementedChampionIds) {
      const champion = championDB.getById(championId);
      expect(champion?.spells).toHaveLength(4);
      actions.forEach((action, index) => {
        const profile = getCombatVisualProfile(championId, action);
        expect(profile.title).not.toMatch(/^Compétence/);
        expect(profile.glyph).not.toHaveLength(0);
        expect(riotSpellIconUrl(championId, champion!.spells[index].image)).toMatch(
          /^\/assets\/riot\/16\.6\.1\/spells\/.+\.png$/,
        );
      });
    }
  });

  it('aggregates all targets from one synchronous area action into one visual cue', () => {
    const store = useBattleStore.getState();
    store.showVisualEvent({
      kind: 'cast',
      action: ActionType.SpellR,
      sourceId: 'Lux',
      sourceSide: 'player',
    });
    const castId = useBattleStore.getState().visualEvent?.id;
    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.SpellR,
      sourceId: 'Lux',
      sourceCombatantId: 'player-Lux',
      sourceSide: 'player',
      targetId: 'Garen',
      targetCombatantId: 'enemy-Garen',
      targetSide: 'enemy',
      amount: 120,
    });
    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.SpellR,
      sourceId: 'Lux',
      sourceCombatantId: 'player-Lux',
      sourceSide: 'player',
      targetId: 'Darius',
      targetCombatantId: 'enemy-Darius',
      targetSide: 'enemy',
      amount: 90,
    });

    expect(useBattleStore.getState().visualEvent).toMatchObject({
      id: castId,
      kind: 'damage',
      amount: 210,
      targetIds: ['Garen', 'Darius'],
      targetCombatantIds: ['enemy-Garen', 'enemy-Darius'],
    });
  });

  it('shows the real attacker, target, spell name and DDragon icon in the arena', () => {
    const lux = combatant('Lux', 'player', 'player-Lux');
    const garen = combatant('Garen', 'enemy', 'enemy-Garen');
    render(
      <CombatStage
        round={2}
        currentTurnChampionId="player-Lux"
        currentTurnSide="player"
        playerTeam={[lux]}
        enemyTeam={[garen]}
        visualEvent={{
          id: 7,
          kind: 'damage',
          action: ActionType.SpellR,
          sourceId: 'Lux',
          sourceCombatantId: 'player-Lux',
          sourceSide: 'player',
          targetId: 'Garen',
          targetCombatantId: 'enemy-Garen',
          targetSide: 'enemy',
          targetIds: ['Garen'],
          targetCombatantIds: ['enemy-Garen'],
          amount: 320,
        }}
        status="Mode manuel"
      />,
    );

    expect(screen.getByLabelText('Attaquant : Lux')).toBeInTheDocument();
    expect(screen.getByLabelText('Cible : Garen')).toBeInTheDocument();
    expect(screen.getByText('Éclat final')).toBeInTheDocument();
    expect(document.querySelector('img[src*="/spells/LuxR.png"]')).toBeInTheDocument();
  });
});
