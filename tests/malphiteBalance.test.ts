import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { BattleManager } from '@/game/battle/BattleManager';
import { ActionType, BattlePhase } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { CCType } from '@/game/effects/types';
import type { Champion } from '@/types/champion';

function maintained(id: string): ChampionInstance {
  const definition = championDB.getById(id);
  if (!definition) throw new Error(`Missing maintained champion ${id}.`);
  return new ChampionInstance(definition);
}

function harmlessTarget(): ChampionInstance {
  const source = championDB.getById('Garen');
  if (!source) throw new Error('Missing target fixture.');
  const definition: Champion = {
    ...source,
    id: 'Target',
    key: 'target',
    name: 'Target',
    spells: source.spells.map((spell) => ({ ...spell, effects: [] })),
  };
  return new ChampionInstance(definition);
}

describe('Malphite balance', () => {
  it('publishes the 150/250/350 ultimate and one-turn knock-up contract', () => {
    const ultimate = championDB.getById('Malphite')?.spells[3];
    if (!ultimate) throw new Error('Missing Malphite ultimate.');

    expect(ultimate.effects).toEqual([
      expect.objectContaining({ type: 'damage', baseDamage: [150, 250, 350] }),
      expect.objectContaining({ type: 'cc', ccType: 'knockup', ccDuration: 1 }),
    ]);
  });

  it('keeps the ultimate locked until round three, then applies damage and one lost action', () => {
    const malphite = maintained('Malphite');
    const target = harmlessTarget();
    const battle = new BattleManager(
      { side: 'player', champions: [malphite] },
      { side: 'enemy', champions: [target] },
      { autoActions: false, random: () => 0.5 },
    );
    battle.startBattle();

    expect(
      battle.getAvailableActions(malphite).some((action) => action.type === ActionType.SpellR),
    ).toBe(false);
    let safety = 30;
    while (
      battle.phase === BattlePhase.TurnActive &&
      (battle.round < 3 || battle.currentCombatant?.champion.id !== 'Malphite') &&
      safety-- > 0
    ) {
      battle.processCurrentTurn();
    }

    expect(battle.round).toBe(3);
    expect(battle.currentCombatant?.champion.id).toBe('Malphite');
    const action = battle
      .getAvailableActions(malphite)
      .find((candidate) => candidate.type === ActionType.SpellR);
    if (!action) throw new Error('Malphite ultimate should unlock on round three.');
    const state = battle.getCombatantState('Target', 'enemy')!;
    const hpBefore = state.currentHp;

    expect(
      battle.submitAction({
        type: ActionType.SpellR,
        targetId: action.validTargetIds[0],
      }),
    ).toBe(true);
    expect(state.currentHp).toBeLessThan(hpBefore);
    const knockup = state.effectManager.ccEffects.find(
      (effect) => effect.ccType === CCType.Knockup,
    );
    expect(knockup?.remainingRounds).toBe(1);
    battle.processCurrentTurn();
    expect(
      battle.log.filter(
        (event) =>
          event.type === 'turn_skipped' &&
          event.champion === 'Target' &&
          event.reason === 'hard_crowd_control',
      ),
    ).toHaveLength(1);
  });
});
