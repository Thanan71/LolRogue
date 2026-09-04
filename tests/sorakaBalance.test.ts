import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { BattleManager } from '@/game/battle/BattleManager';
import { ActionType, BattlePhase } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { CCType } from '@/game/effects/types';
import type { Champion } from '@/types/champion';
import { TargetingType } from '@/types/champion';

function maintained(id: string, moveSpeed?: number): ChampionInstance {
  const source = championDB.getById(id);
  if (!source) throw new Error(`Missing maintained champion ${id}.`);
  const definition: Champion = {
    ...source,
    stats: { ...source.stats, moveSpeed: moveSpeed ?? source.stats.moveSpeed },
  };
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
    stats: { ...source.stats, hp: 5_000, moveSpeed: 100, attackSpeed: 0 },
    spells: source.spells.map((spell) => ({ ...spell, effects: [] })),
  };
  return new ChampionInstance(definition);
}

function basicAttackCallback(
  _champion: ChampionInstance,
  _side: 'player' | 'enemy',
  enemies: ReturnType<BattleManager['getAliveEnemies']>,
) {
  return { type: ActionType.BasicAttack, targetId: enemies[0]?.targetId };
}

describe('Soraka balance', () => {
  it('replaces Equinox double-lock with one-turn silence and an explicit 30% slow', () => {
    const soraka = maintained('Soraka', 500);
    const target = harmlessTarget();
    const battle = new BattleManager(
      { side: 'player', champions: [soraka] },
      { side: 'enemy', champions: [target] },
      { autoActions: false, random: () => 0.5 },
    );
    battle.startBattle();
    const state = battle.getCombatantState('Target', 'enemy')!;
    const hpBefore = state.currentHp;

    expect(battle.submitAction({ type: ActionType.SpellE, targetId: 'Target' })).toBe(true);
    expect(state.currentHp).toBeLessThan(hpBefore);
    const controls = state.effectManager.ccEffects;
    const silence = controls.find((effect) => effect.ccType === CCType.Silence);
    const slow = controls.find((effect) => effect.ccType === CCType.Slow);
    expect(silence?.remainingRounds).toBe(1);
    expect(slow?.remainingRounds).toBe(1);
    expect(slow?.slowAmount).toBeCloseTo(0.3);
    expect(controls.some((effect) => effect.ccType === CCType.Snare)).toBe(false);
  });

  it('unlocks Wish on round three and heals every living ally without a target id', () => {
    const soraka = maintained('Soraka', 500);
    const garen = maintained('Garen', 400);
    const ashe = maintained('Ashe', 300);
    const battle = new BattleManager(
      { side: 'player', champions: [soraka, garen, ashe] },
      { side: 'enemy', champions: [harmlessTarget()] },
      { autoActions: false, random: () => 0.5 },
    );
    battle.setActionCallback(basicAttackCallback);
    battle.startBattle();

    expect(soraka.getSpell('R')?.targeting).toBe(TargetingType.Allies);
    let safety = 50;
    while (
      battle.phase === BattlePhase.TurnActive &&
      (battle.round < 3 || battle.currentCombatant?.champion.id !== 'Soraka') &&
      safety-- > 0
    ) {
      battle.processCurrentTurn();
    }
    expect(battle.round).toBe(3);
    expect(battle.currentCombatant?.champion.id).toBe('Soraka');

    const livingAllies = battle.getAliveCombatants('player');
    for (const ally of livingAllies) ally.currentHp = Math.round(ally.maxHp * 0.5);
    const before = new Map(livingAllies.map((ally) => [ally.targetId, ally.currentHp]));
    const wish = battle
      .getAvailableActions(soraka)
      .find((action) => action.type === ActionType.SpellR);

    expect(wish).toMatchObject({ targeting: TargetingType.Allies, requiresTarget: false });
    expect(battle.submitAction({ type: ActionType.SpellR })).toBe(true);
    for (const ally of livingAllies) {
      expect(ally.currentHp, ally.targetId).toBeGreaterThan(before.get(ally.targetId) ?? 0);
    }
  });
});
