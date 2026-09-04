import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { BattleManager } from '@/game/battle/BattleManager';
import { ActionType, BattlePhase } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { ExecuteEffect } from '@/game/effects/ExecuteEffect';
import { ShieldEffect } from '@/game/effects/ShieldEffect';
import type { Champion } from '@/types/champion';

function maintained(id: string, moveSpeed?: number): ChampionInstance {
  const source = championDB.getById(id);
  if (!source) throw new Error(`Missing maintained champion ${id}.`);
  const definition: Champion = {
    ...source,
    stats: { ...source.stats, moveSpeed: moveSpeed ?? source.stats.moveSpeed },
  };
  return new ChampionInstance(definition);
}

function harmlessTarget(id: string): ChampionInstance {
  const source = championDB.getById('Garen');
  if (!source) throw new Error('Missing target fixture.');
  const definition: Champion = {
    ...source,
    id,
    key: id.toLowerCase(),
    name: id,
    stats: { ...source.stats, hp: 5_000, moveSpeed: 100, attackSpeed: 0 },
    spells: source.spells.map((spell) => ({ ...spell, effects: [] })),
  };
  return new ChampionInstance(definition);
}

describe('Garen and Jinx execute balance', () => {
  it.each([
    ['Garen', 30],
    ['Jinx', 25],
  ] as const)(
    '%s evaluates its inclusive threshold after the declared damage effect',
    (id, percent) => {
      const ultimate = championDB.getById(id)?.spells[3];
      if (!ultimate) throw new Error(`Missing ${id} ultimate.`);
      expect(ultimate.effects.map((effect) => effect.type)).toEqual(['damage', 'execute']);
      expect(ultimate.effects[1]).toMatchObject({ type: 'execute', threshold: percent });

      const execute = new ExecuteEffect({
        sourceId: id,
        targetId: 'Target',
        threshold: percent / 100,
      });
      expect(execute.canExecute(percent, 100)).toBe(true);
      expect(execute.canExecute(percent + Number.EPSILON * 100, 100)).toBe(false);
    },
  );

  it('limits Jinx R execution to the shielded primary while preserving area falloff', () => {
    const jinx = maintained('Jinx', 500);
    const battle = new BattleManager(
      { side: 'player', champions: [jinx] },
      {
        side: 'enemy',
        champions: [
          harmlessTarget('Primary'),
          harmlessTarget('Secondary'),
          harmlessTarget('Tertiary'),
        ],
      },
      { autoActions: false, random: () => 0.5 },
    );
    battle.setActionCallback((_champion, _side, enemies) => ({
      type: ActionType.BasicAttack,
      targetId: enemies[0]?.targetId,
    }));
    battle.startBattle();

    let safety = 60;
    while (
      battle.phase === BattlePhase.TurnActive &&
      (battle.round < 3 || battle.currentCombatant?.champion.id !== 'Jinx') &&
      safety-- > 0
    ) {
      battle.processCurrentTurn();
    }
    expect(battle.round).toBe(3);
    expect(battle.currentCombatant?.champion.id).toBe('Jinx');

    const primary = battle.getCombatantState('Primary', 'enemy')!;
    const secondary = battle.getCombatantState('Secondary', 'enemy')!;
    const tertiary = battle.getCombatantState('Tertiary', 'enemy')!;
    primary.currentHp = 1_000;
    secondary.currentHp = 1_000;
    tertiary.currentHp = 3_000;
    primary.effectManager.apply(
      new ShieldEffect({
        name: 'Primary shield',
        sourceId: primary.targetId,
        targetId: primary.targetId,
        magnitude: 200,
        duration: 3,
      }),
    );
    primary.currentShield = 200;

    expect(battle.submitAction({ type: ActionType.SpellR, targetId: 'Primary' })).toBe(true);
    expect(primary.currentHp).toBe(0);
    expect(primary.currentShield).toBe(0);
    expect(primary.isDefeated).toBe(true);
    expect(secondary.currentHp).toBeGreaterThan(0);
    expect(secondary.currentHp).toBeLessThan(1_000);
    expect(secondary.currentHp / secondary.maxHp).toBeLessThanOrEqual(0.25);
    expect(secondary.isDefeated).toBe(false);
    expect(tertiary.currentHp).toBeGreaterThan(0);
    expect(tertiary.currentHp).toBeLessThan(3_000);
  });
});
