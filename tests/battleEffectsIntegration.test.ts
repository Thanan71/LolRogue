import { describe, expect, it } from 'vitest';
import { championDB } from '../src/data/championDatabase';
import { BattleManager } from '../src/game/battle/BattleManager';
import { ActionType } from '../src/game/battle/types';
import { ChampionInstance } from '../src/game/ChampionInstance';
import { ShieldEffect } from '../src/game/effects/ShieldEffect';
import type { Champion, ChampionStats, Spell, SpellEffect } from '../src/types';
import { TargetingType } from '../src/types';

const BASE_STATS: ChampionStats = {
  hp: 1000,
  mp: 500,
  moveSpeed: 300,
  armor: 0,
  magicResist: 0,
  attackDamage: 100,
  attackSpeed: 1,
  attackRange: 500,
  hpPerLevel: 0,
  mpPerLevel: 0,
  armorPerLevel: 0,
  magicResistPerLevel: 0,
  attackDamagePerLevel: 0,
  attackSpeedPerLevel: 0,
  hpRegen: 0,
  hpRegenPerLevel: 0,
  mpRegen: 0,
  mpRegenPerLevel: 0,
  crit: 0,
  critPerLevel: 0,
};

function makeChampion(
  id: string,
  moveSpeed: number,
  effect: SpellEffect,
  targeting = TargetingType.Enemy,
  stats: Partial<ChampionStats> = {},
): ChampionInstance {
  const spell = (slot: string, spellEffect: SpellEffect, target = targeting): Spell => ({
    id: `${id}${slot}`,
    name: `${id} ${slot}`,
    description: 'Configured test effect',
    maxRank: 5,
    cooldownTurns: [1, 1, 1, 1, 1],
    cost: [0, 0, 0, 0, 0],
    range: [1000, 1000, 1000, 1000, 1000],
    image: '',
    targeting: target,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [spellEffect],
  });
  const fallback: SpellEffect = {
    type: 'damage',
    damageType: 'true',
    baseDamage: [1, 1, 1, 1, 1],
  };
  const champion: Champion = {
    id,
    key: id,
    name: id,
    title: 'test',
    tags: ['Mage'],
    resourceType: 'Mana',
    stats: { ...BASE_STATS, ...stats, moveSpeed },
    spells: [
      spell('Q', effect),
      spell('W', fallback, TargetingType.Enemy),
      spell('E', fallback, TargetingType.Enemy),
      spell('R', fallback, TargetingType.Enemy),
    ],
    passive: {
      name: 'No passive',
      description: '',
      image: '',
      targeting: TargetingType.Passive,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [],
    },
    iconUrl: '',
  };
  return new ChampionInstance(champion);
}

function manager(players: ChampionInstance[], enemies: ChampionInstance[]): BattleManager {
  const battle = new BattleManager(
    { side: 'player', champions: players },
    { side: 'enemy', champions: enemies },
    { autoActions: false, random: () => 0.5 },
  );
  battle.startBattle();
  return battle;
}

describe('BattleManager effect integration', () => {
  it.each([
    ['Ashe', ActionType.SpellQ, 'damage', 'buff'],
    ['Jinx', ActionType.SpellQ, 'damage', 'buff'],
    ['Leona', ActionType.SpellW, 'damage', 'shield'],
    ['Malphite', ActionType.SpellW, 'damage', 'buff'],
    ['Warwick', ActionType.SpellE, 'cc', 'buff'],
  ] as const)(
    'resolves both the hostile and self-positive parts of %s composite spell',
    (championId, action, hostileEffect, positiveEffect) => {
      const definition = championDB.getById(championId);
      if (!definition) throw new Error(`Missing maintained champion ${championId}`);
      const caster = new ChampionInstance(definition);
      const target = makeChampion('Target', 1, { type: 'damage', baseDamage: [1] });
      const battle = manager([caster], [target]);
      const casterState = battle.getCombatantState(championId, 'player')!;
      const targetState = battle.getCombatantState('Target', 'enemy')!;
      const hpBefore = targetState.currentHp;
      const ccBefore = targetState.effectManager.ccEffects.length;
      const positiveBefore =
        positiveEffect === 'shield'
          ? casterState.effectManager.shields.length
          : casterState.effectManager.buffDebuffs.length;
      const targeting = battle
        .getAvailableActions(caster)
        .find((option) => option.type === action)?.targeting;

      expect(
        battle.submitAction({
          type: action,
          targetId: targeting === TargetingType.Enemy ? 'Target' : undefined,
        }),
      ).toBe(true);
      if (hostileEffect === 'damage') expect(targetState.currentHp).toBeLessThan(hpBefore);
      else expect(targetState.effectManager.ccEffects.length).toBeGreaterThan(ccBefore);
      const positiveAfter =
        positiveEffect === 'shield'
          ? casterState.effectManager.shields.length
          : casterState.effectManager.buffDebuffs.length;
      expect(positiveAfter).toBeGreaterThan(positiveBefore);
    },
  );

  it.each([
    ['Garen', 400, 600],
    ['Jinx', 500, 700],
  ] as const)(
    'resolves %s ultimate damage before evaluating its execute threshold',
    (championId, crossingHp, survivingHp) => {
      const definition = championDB.getById(championId);
      if (!definition) throw new Error(`Missing maintained champion ${championId}`);
      expect(definition.spells[3].effects.map(({ type }) => type)).toEqual(['damage', 'execute']);

      const resolveAtHp = (currentHp: number) => {
        const caster = new ChampionInstance(definition);
        const target = makeChampion('Target', 1, { type: 'damage', baseDamage: [1] });
        const battle = manager([caster], [target]);
        const targetState = battle.getCombatantState('Target', 'enemy')!;
        targetState.currentHp = currentHp;
        expect(
          battle.submitAction({
            type: ActionType.SpellR,
            targetId: definition.spells[3].targeting === TargetingType.Enemy ? 'Target' : undefined,
          }),
        ).toBe(true);
        return targetState;
      };

      const executed = resolveAtHp(crossingHp);
      expect(crossingHp / executed.maxHp).toBeGreaterThan(
        (definition.spells[3].effects[1].threshold ?? 0) / 100,
      );
      expect(executed.currentHp).toBe(0);
      expect(executed.isDefeated).toBe(true);

      const survivor = resolveAtHp(survivingHp);
      expect(survivor.currentHp).toBeGreaterThan(
        survivor.maxHp * ((definition.spells[3].effects[1].threshold ?? 0) / 100),
      );
      expect(survivor.currentHp).toBeLessThan(survivingHp);
      expect(survivor.isDefeated).toBe(false);
    },
  );

  it('ticks a DoT only at the end of the target turn and expires it', () => {
    const caster = makeChampion(
      'Caster',
      500,
      { type: 'dot', damageType: 'true', baseDamage: [90], duration: 3 },
      TargetingType.Enemy,
    );
    const victim = makeChampion('Victim', 300, { type: 'damage', baseDamage: [1] });
    const battle = manager([caster], [victim]);
    const state = battle.getCombatantState('Victim', 'enemy')!;

    expect(battle.submitAction({ type: ActionType.SpellQ, targetId: 'Victim' })).toBe(true);
    expect(state.currentHp).toBe(1000);
    expect(state.effectManager.dots).toHaveLength(1);

    battle.processCurrentTurn();
    expect(state.currentHp).toBe(970);
    expect(state.effectManager.dots[0].remainingRounds).toBe(2);
  });

  it('ticks a HoT at the end of the selected ally turn', () => {
    const healer = makeChampion(
      'Healer',
      500,
      { type: 'hot', baseValue: [90], duration: 3 },
      TargetingType.Ally,
    );
    const ally = makeChampion('Ally', 400, { type: 'damage', baseDamage: [1] });
    const enemy = makeChampion('Enemy', 300, { type: 'damage', baseDamage: [1] });
    const battle = manager([healer, ally], [enemy]);
    const allyState = battle.getCombatantState('Ally', 'player')!;
    allyState.currentHp = 500;

    expect(battle.submitAction({ type: ActionType.SpellQ, targetId: 'Ally' })).toBe(true);
    expect(allyState.currentHp).toBe(500);
    battle.processCurrentTurn();
    expect(allyState.currentHp).toBe(530);
  });

  it('executes a target at or below the configured normalized threshold', () => {
    const caster = makeChampion(
      'Executor',
      500,
      { type: 'execute', threshold: 30 },
      TargetingType.Enemy,
    );
    const victim = makeChampion('Victim', 300, { type: 'damage', baseDamage: [1] });
    const battle = manager([caster], [victim]);
    const target = battle.getCombatantState('Victim', 'enemy')!;
    target.currentHp = 300;

    expect(battle.submitAction({ type: ActionType.SpellQ, targetId: 'Victim' })).toBe(true);
    expect(target.isDefeated).toBe(true);
    expect(target.currentHp).toBe(0);
  });

  it('executes through an active shield as raw terminal damage', () => {
    const caster = makeChampion(
      'Executor',
      500,
      { type: 'execute', threshold: 30 },
      TargetingType.Enemy,
    );
    const victim = makeChampion('Victim', 300, { type: 'damage', baseDamage: [1] });
    const battle = manager([caster], [victim]);
    const target = battle.getCombatantState('Victim', 'enemy')!;
    target.currentHp = 300;
    target.effectManager.apply(
      new ShieldEffect({
        name: 'Execution test shield',
        sourceId: target.targetId,
        targetId: target.targetId,
        magnitude: 200,
        duration: 3,
      }),
    );
    target.currentShield = 200;

    expect(battle.submitAction({ type: ActionType.SpellQ, targetId: 'Victim' })).toBe(true);
    expect(target.currentShield).toBe(0);
    expect(target.currentHp).toBe(0);
    expect(target.isDefeated).toBe(true);
  });

  it('revives a defeated ally and exposes that target through the same command API', () => {
    const reviver = makeChampion(
      'Reviver',
      500,
      { type: 'revive', revivePercent: 25 },
      TargetingType.Ally,
    );
    const ally = makeChampion('Ally', 400, { type: 'damage', baseDamage: [1] });
    const enemy = makeChampion('Enemy', 300, { type: 'damage', baseDamage: [1] });
    const battle = manager([reviver, ally], [enemy]);
    const allyState = battle.getCombatantState('Ally', 'player')!;
    allyState.currentHp = 0;
    allyState.isDefeated = true;

    expect(battle.getAvailableTargets(ActionType.SpellQ)).toContain('Ally');
    expect(battle.submitAction({ type: ActionType.SpellQ, targetId: 'Ally' })).toBe(true);
    expect(allyState.isDefeated).toBe(false);
    expect(allyState.currentHp).toBe(250);
  });

  it('uses active buffs when calculating later basic-attack damage', () => {
    const fighter = makeChampion(
      'Fighter',
      500,
      {
        type: 'buff',
        stat: 'attackDamage',
        modifierType: 'percent',
        values: [50],
        buffDuration: 3,
      },
      TargetingType.Self,
    );
    const enemy = makeChampion('Enemy', 300, { type: 'damage', baseDamage: [1] });
    const battle = manager([fighter], [enemy]);

    expect(battle.submitAction({ type: ActionType.SpellQ })).toBe(true);
    battle.processCurrentTurn();
    const hpBefore = battle.getCombatantState('Enemy', 'enemy')!.currentHp;
    expect(battle.submitAction({ type: ActionType.BasicAttack, targetId: 'Enemy' })).toBe(true);
    expect(hpBefore - battle.getCombatantState('Enemy', 'enemy')!.currentHp).toBe(150);
  });

  it('makes silence block spells and snare block movement-based basic attacks', () => {
    const silencer = makeChampion(
      'Silencer',
      500,
      { type: 'cc', ccType: 'silence', ccDuration: 2 },
      TargetingType.Enemy,
    );
    const enemy = makeChampion('Enemy', 300, { type: 'damage', baseDamage: [20] });
    const silenceBattle = manager([silencer], [enemy]);
    silenceBattle.submitAction({ type: ActionType.SpellQ, targetId: 'Enemy' });
    const silencedActions = silenceBattle.getAvailableActions(enemy);
    expect(silencedActions.map((action) => action.type)).toEqual([ActionType.BasicAttack]);

    const snarer = makeChampion(
      'Snarer',
      500,
      { type: 'cc', ccType: 'snare', ccDuration: 2 },
      TargetingType.Enemy,
    );
    const rootedEnemy = makeChampion('RootedEnemy', 300, { type: 'damage', baseDamage: [20] });
    const snareBattle = manager([snarer], [rootedEnemy]);
    snareBattle.submitAction({ type: ActionType.SpellQ, targetId: 'RootedEnemy' });
    const rootedActions = snareBattle.getAvailableActions(rootedEnemy);
    expect(rootedActions.some((action) => action.type === ActionType.BasicAttack)).toBe(false);
    expect(rootedActions.some((action) => action.type === ActionType.SpellQ)).toBe(true);
  });

  it('uses slow when rebuilding next-round initiative', () => {
    const slower = makeChampion(
      'Slower',
      700,
      { type: 'cc', ccType: 'slow', slowPercent: 60, ccDuration: 2 },
      TargetingType.Enemy,
    );
    const ally = makeChampion('Ally', 400, { type: 'damage', baseDamage: [1] });
    const enemy = makeChampion('Enemy', 600, { type: 'damage', baseDamage: [1] });
    const battle = manager([slower, ally], [enemy]);

    battle.submitAction({ type: ActionType.SpellQ, targetId: 'Enemy' });
    battle.processCurrentTurn();
    battle.processCurrentTurn();

    expect(battle.round).toBe(2);
    expect(battle.turnOrder.map((entry) => entry.champion.id)).toEqual(['Slower', 'Ally', 'Enemy']);
  });
});
