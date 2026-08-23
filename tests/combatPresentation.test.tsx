// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CombatLog } from '@/components/CombatUI/CombatLog';
import { CombatStage } from '@/components/CombatUI/CombatStage';
import { riotSpellIconUrl } from '@/config/riotSpellAssets';
import { championDB } from '@/data/championDatabase';
import { isActionTargeting } from '@/game/battle/targetResolver';
import { ActionType } from '@/game/battle/types';
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

  it('renders explicit crowd-control and skipped-turn log entries', () => {
    const store = useBattleStore.getState();
    store.addLog({
      type: 'crowd_control',
      message: 'Annie → Malphite: étourdissement (2 tours)',
    });
    store.addLog({
      type: 'turn_skipped',
      message: 'Malphite perd son action (étourdissement)',
    });

    render(<CombatLog />);

    expect(screen.getByText('Annie → Malphite: étourdissement (2 tours)')).toHaveClass(
      'combat-log__entry--crowd_control',
    );
    expect(screen.getByText('Malphite perd son action (étourdissement)')).toHaveClass(
      'combat-log__entry--turn_skipped',
    );
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
    const damageCueId = useBattleStore.getState().visualEvent?.id;
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
      id: damageCueId,
      kind: 'damage',
      amount: 210,
      targetIds: ['Garen', 'Darius'],
      targetCombatantIds: ['enemy-Garen', 'enemy-Darius'],
    });
  });

  it('keeps hostile damage as the visual target when the same action then buffs its caster', () => {
    const store = useBattleStore.getState();
    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.SpellQ,
      sourceId: 'Soraka',
      sourceSide: 'player',
      targetId: 'Garen',
      targetCombatantId: 'enemy-Garen',
      targetSide: 'enemy',
      amount: 80,
    });
    const damageCueId = useBattleStore.getState().visualEvent?.id;

    store.showVisualEvent({
      kind: 'shield',
      action: ActionType.SpellQ,
      sourceId: 'Soraka',
      sourceCombatantId: 'player-Soraka',
      sourceSide: 'player',
      targetId: 'Soraka',
      targetCombatantId: 'player-Soraka',
      targetSide: 'player',
      amount: 20,
    });

    expect(useBattleStore.getState().visualEvent).toMatchObject({
      kind: 'damage',
      targetSide: 'enemy',
      targetIds: ['Garen'],
      targetCombatantIds: ['enemy-Garen'],
      amount: 80,
    });
    expect(useBattleStore.getState().visualEvent?.id).toBe(damageCueId);
  });

  it('replaces an early self buff when the same action later damages an enemy', () => {
    const store = useBattleStore.getState();
    store.showVisualEvent({
      kind: 'shield',
      action: ActionType.SpellW,
      sourceId: 'Leona',
      sourceSide: 'player',
      targetId: 'Leona',
      targetCombatantId: 'player-Leona',
      targetSide: 'player',
      amount: 45,
    });
    const supportCueId = useBattleStore.getState().visualEvent?.id;

    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.SpellW,
      sourceId: 'Leona',
      sourceSide: 'player',
      targetId: 'Garen',
      targetCombatantId: 'enemy-Garen',
      targetSide: 'enemy',
      amount: 90,
    });

    expect(useBattleStore.getState().visualEvent).toMatchObject({
      kind: 'damage',
      targetSide: 'enemy',
      targetIds: ['Garen'],
      amount: 90,
    });
    expect(useBattleStore.getState().visualEvent?.id).not.toBe(supportCueId);
  });

  it('does not merge effects emitted by duplicate casters sharing a champion ID', () => {
    const store = useBattleStore.getState();
    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.SpellQ,
      sourceId: 'Malphite',
      sourceCombatantId: 'Malphite#1',
      sourceSide: 'enemy',
      targetId: 'Garen',
      targetCombatantId: 'Garen',
      targetSide: 'player',
      amount: 40,
    });
    const firstCasterCueId = useBattleStore.getState().visualEvent?.id;

    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.SpellQ,
      sourceId: 'Malphite',
      sourceCombatantId: 'Malphite#2',
      sourceSide: 'enemy',
      targetId: 'Lux',
      targetCombatantId: 'Lux',
      targetSide: 'player',
      amount: 55,
    });

    expect(useBattleStore.getState().visualEvent).toMatchObject({
      sourceCombatantId: 'Malphite#2',
      targetCombatantIds: ['Lux'],
      amount: 55,
    });
    expect(useBattleStore.getState().visualEvent?.id).not.toBe(firstCasterCueId);
  });

  it('aggregates duplicate targets by their stable combat-local IDs', () => {
    const store = useBattleStore.getState();
    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.SpellR,
      sourceId: 'Lux',
      sourceCombatantId: 'Lux',
      sourceSide: 'player',
      targetId: 'Malphite',
      targetCombatantId: 'Malphite#1',
      targetSide: 'enemy',
      amount: 70,
    });
    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.SpellR,
      sourceId: 'Lux',
      sourceCombatantId: 'Lux',
      sourceSide: 'player',
      targetId: 'Malphite',
      targetCombatantId: 'Malphite#2',
      targetSide: 'enemy',
      amount: 65,
    });

    expect(useBattleStore.getState().visualEvent).toMatchObject({
      targetIds: ['Malphite'],
      targetCombatantIds: ['Malphite#1', 'Malphite#2'],
      amount: 135,
    });
  });

  it('does not merge same-name combatants across opposing sides', () => {
    const store = useBattleStore.getState();
    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.BasicAttack,
      sourceId: 'Garen',
      sourceCombatantId: 'Garen',
      sourceSide: 'player',
      targetId: 'Malphite',
      targetCombatantId: 'Malphite',
      targetSide: 'enemy',
      amount: 35,
    });
    const alliedCueId = useBattleStore.getState().visualEvent?.id;

    store.showVisualEvent({
      kind: 'damage',
      action: ActionType.BasicAttack,
      sourceId: 'Garen',
      sourceCombatantId: 'Garen',
      sourceSide: 'enemy',
      targetId: 'Lux',
      targetCombatantId: 'Lux',
      targetSide: 'player',
      amount: 42,
    });

    expect(useBattleStore.getState().visualEvent).toMatchObject({
      sourceSide: 'enemy',
      targetCombatantIds: ['Lux'],
      amount: 42,
    });
    expect(useBattleStore.getState().visualEvent?.id).not.toBe(alliedCueId);
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

  it('never reuses a selected ally as the opposing fighter', () => {
    const lux = combatant('Lux', 'player', 'player-Lux');
    const garen = combatant('Garen', 'enemy', 'enemy-Garen');
    render(
      <CombatStage
        round={1}
        currentTurnChampionId="player-Lux"
        currentTurnSide="player"
        playerTeam={[lux]}
        enemyTeam={[garen]}
        selectedTarget={lux}
        visualEvent={null}
        status="Mode manuel"
      />,
    );

    expect(screen.getByLabelText('Attaquant : Lux')).toBeInTheDocument();
    expect(screen.getByLabelText('Cible : Garen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cible : Lux')).not.toBeInTheDocument();
  });

  it('presents a self effect without duplicating the champion as an opponent', () => {
    const garen = combatant('Garen', 'player', 'player-Garen');
    render(
      <CombatStage
        round={1}
        currentTurnChampionId="player-Garen"
        currentTurnSide="player"
        playerTeam={[garen]}
        enemyTeam={[]}
        visualEvent={{
          id: 8,
          kind: 'shield',
          action: ActionType.SpellW,
          sourceId: 'Garen',
          sourceCombatantId: 'player-Garen',
          sourceSide: 'player',
          targetId: 'Garen',
          targetCombatantId: 'player-Garen',
          targetSide: 'player',
          targetIds: ['Garen'],
          targetCombatantIds: ['player-Garen'],
          amount: 70,
        }}
        status="Mode manuel"
      />,
    );

    expect(screen.getByLabelText('Attaquant : Garen')).toBeInTheDocument();
    expect(screen.getByLabelText('Effet personnel : Garen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cible : Garen')).not.toBeInTheDocument();
    expect(screen.getByText('SUR SOI')).toBeInTheDocument();
  });
});
