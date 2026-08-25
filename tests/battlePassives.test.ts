import { describe, expect, it } from 'vitest';
import { championDB } from '../src/data/championDatabase';
import { BattleManager } from '../src/game/battle/BattleManager';
import {
  IMPLEMENTED_PASSIVE_CHAMPIONS,
  isPassiveCombatReady,
} from '../src/game/battle/combatContentSupport';
import { ActionType, BattlePhase } from '../src/game/battle/types';
import { ChampionInstance } from '../src/game/ChampionInstance';
import type { Champion, ChampionStats, Spell } from '../src/types';
import { TargetingType } from '../src/types';
import { calculateADDamage } from '../src/utils/damage';

const DUMMY_STATS: ChampionStats = {
  hp: 5000,
  mp: 1000,
  moveSpeed: 300,
  armor: 0,
  magicResist: 0,
  attackDamage: 1,
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

function maintained(id: string, moveSpeed = 500): ChampionInstance {
  const source = championDB.getById(id);
  if (!source) throw new Error(`Missing champion ${id}`);
  const clone: Champion = {
    ...source,
    stats: { ...source.stats, moveSpeed },
    spells: source.spells.map((spell) => ({
      ...spell,
      effects: spell.effects.map((effect) => ({ ...effect })),
    })),
    passive: {
      ...source.passive,
      effects: source.passive.effects.map((effect) => ({ ...effect })),
    },
  };
  return new ChampionInstance(clone);
}

function dummy(
  id: string,
  moveSpeed = 300,
  statOverrides: Partial<ChampionStats> = {},
): ChampionInstance {
  const spell = (slot: string): Spell => ({
    id: `${id}${slot}`,
    name: `${id} ${slot}`,
    description: 'test',
    maxRank: 5,
    cooldownTurns: [1, 1, 1, 1, 1],
    cost: [0, 0, 0, 0, 0],
    range: [1000, 1000, 1000, 1000, 1000],
    image: '',
    targeting: TargetingType.Enemy,
    scaling: { adRatio: 0, apRatio: 0 },
    effects: [{ type: 'damage', damageType: 'true', baseDamage: [1, 1, 1, 1, 1] }],
  });
  return new ChampionInstance({
    id,
    key: id,
    name: id,
    title: 'dummy',
    tags: ['Tank'],
    resourceType: 'Mana',
    stats: { ...DUMMY_STATS, moveSpeed, ...statOverrides },
    spells: [spell('Q'), spell('W'), spell('E'), spell('R')],
    passive: {
      name: 'None',
      description: '',
      image: '',
      targeting: TargetingType.Passive,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [],
    },
    iconUrl: '',
  });
}

function battle(
  players: ChampionInstance[],
  enemies: ChampionInstance[] = [dummy('Target')],
  initialHpOverrides?: Record<string, number>,
): BattleManager {
  const manager = new BattleManager(
    { side: 'player', champions: players },
    { side: 'enemy', champions: enemies },
    { autoActions: false, random: () => 0.5, initialHpOverrides },
  );
  manager.startBattle();
  return manager;
}

function advanceToPlayer(manager: BattleManager, championId: string): void {
  let safety = 30;
  while (
    manager.phase === BattlePhase.TurnActive &&
    manager.currentCombatant?.champion.id !== championId &&
    safety-- > 0
  ) {
    manager.processCurrentTurn();
  }
  expect(manager.currentCombatant?.champion.id).toBe(championId);
}

describe('maintained champion passives', () => {
  it('publishes only the ten maintained passives as combat-ready', () => {
    for (const id of IMPLEMENTED_PASSIVE_CHAMPIONS) {
      const champion = championDB.getById(id)!;
      expect(isPassiveCombatReady(id, champion.passive), id).toBe(true);
    }
    const unsupported = championDB.getById('Ahri')!;
    expect(isPassiveCombatReady('Ahri', unsupported.passive)).toBe(false);
  });

  it('Garen — heals at turn end after avoiding recent damage', () => {
    const garen = maintained('Garen');
    const manager = battle([garen]);
    const state = manager.getCombatantState('Garen', 'player')!;
    state.currentHp -= 200;
    const before = state.currentHp;

    manager.submitAction({ type: ActionType.BasicAttack, targetId: 'Target' });
    expect(state.currentHp).toBeGreaterThan(before);
  });

  it('Annie — the fifth offensive spell consumes four charges and stuns', () => {
    const annie = maintained('Annie');
    const manager = battle([annie]);
    const sequence: Array<{ type: ActionType; targetId?: string }> = [
      { type: ActionType.SpellQ, targetId: 'Target' },
      { type: ActionType.SpellW, targetId: 'Target' },
      { type: ActionType.SpellE, targetId: 'Annie' },
      { type: ActionType.SpellR, targetId: 'Target' },
    ];
    for (const action of sequence) {
      advanceToPlayer(manager, 'Annie');
      expect(manager.submitAction(action)).toBe(true);
    }
    advanceToPlayer(manager, 'Annie');
    expect(manager.submitAction({ type: ActionType.SpellQ, targetId: 'Target' })).toBe(true);
    expect(manager.getCombatantState('Target', 'enemy')!.effectManager.isHardCCd()).toBe(true);
  });

  it('Ashe — basic attacks apply Frost Shot slow', () => {
    const ashe = maintained('Ashe');
    const manager = battle([ashe]);

    manager.submitAction({ type: ActionType.BasicAttack, targetId: 'Target' });
    const target = manager.getCombatantState('Target', 'enemy')!;
    expect(target.effectManager.getSpeedMultiplier()).toBeCloseTo(0.8);
  });

  it('Darius — keeps one refreshed Hemorrhage DoT capped at five real 9-damage ticks', () => {
    const darius = maintained('Darius');
    const manager = battle([darius]);
    const target = manager.getCombatantState('Target', 'enemy')!;

    expect(manager.submitAction({ type: ActionType.BasicAttack, targetId: 'Target' })).toBe(true);
    expect(target.effectManager.dots).toHaveLength(1);
    expect(target.effectManager.dots[0].stacks).toBe(1);
    expect(target.effectManager.dots[0].remainingRounds).toBe(5);

    const targetHpBeforeTick = target.currentHp;
    const tickLogStart = manager.log.length;
    manager.processCurrentTurn();
    expect(targetHpBeforeTick - target.currentHp).toBe(9);
    expect(
      manager.log
        .slice(tickLogStart)
        .filter(
          (event) =>
            event.type === 'damage' && event.source === 'Darius' && event.target === 'Target',
        ),
    ).toEqual([expect.objectContaining({ amount: 9 })]);

    for (let index = 1; index < 5; index++) {
      advanceToPlayer(manager, 'Darius');
      expect(manager.submitAction({ type: ActionType.BasicAttack, targetId: 'Target' })).toBe(true);
    }

    const state = manager.getCombatantState('Darius', 'player')!;
    expect(target.effectManager.dots).toHaveLength(1);
    expect(target.effectManager.dots[0].stacks).toBe(5);
    expect(target.effectManager.dots[0].remainingRounds).toBe(5);
    expect(
      state.effectManager.buffDebuffs.filter((effect) => effect.name.includes('noxian_might')),
    ).toHaveLength(1);

    manager.processCurrentTurn();
    advanceToPlayer(manager, 'Darius');
    expect(manager.submitAction({ type: ActionType.BasicAttack, targetId: 'Target' })).toBe(true);
    expect(target.effectManager.dots).toHaveLength(1);
    expect(target.effectManager.dots[0].stacks).toBe(5);
    expect(target.effectManager.dots[0].remainingRounds).toBe(5);
    expect(
      state.effectManager.buffDebuffs.filter((effect) => effect.name.includes('noxian_might')),
    ).toHaveLength(1);
  });

  it('Darius — E rank grants real attacker armor penetration to attacks and physical spells', () => {
    const darius = maintained('Darius');
    darius.setSpellRank('E', 5);
    const target = dummy('ArmoredTarget', 300, { armor: 100 });
    const manager = battle([darius], [target]);
    const rawAttackDamage = darius.getEnhancedStats().attackDamage;

    expect(manager.submitAction({ type: ActionType.BasicAttack, targetId: 'ArmoredTarget' })).toBe(
      true,
    );
    const attackEvent = manager.log.find(
      (event) =>
        event.type === 'damage' && event.source === 'Darius' && event.target === 'ArmoredTarget',
    );
    expect(attackEvent).toEqual(
      expect.objectContaining({
        amount: calculateADDamage(rawAttackDamage, 1, 100, 0.35),
      }),
    );
    expect(attackEvent && attackEvent.type === 'damage' ? attackEvent.amount : 0).toBeGreaterThan(
      calculateADDamage(rawAttackDamage, 1, 100),
    );

    advanceToPlayer(manager, 'Darius');
    const spellLogStart = manager.log.length;
    expect(manager.submitAction({ type: ActionType.SpellQ, targetId: 'ArmoredTarget' })).toBe(true);
    const spellEvent = manager.log
      .slice(spellLogStart)
      .find(
        (event) =>
          event.type === 'damage' && event.source === 'Darius' && event.target === 'ArmoredTarget',
      );
    expect(spellEvent).toEqual(
      expect.objectContaining({
        amount: calculateADDamage(40 + rawAttackDamage, 1, 100, 0.35),
      }),
    );

    expect(darius.getSpell('E')?.passiveArmorPenetrationPercent).toEqual([15, 20, 25, 30, 35]);
    expect(darius.getSpell('E')?.effects).not.toContainEqual(
      expect.objectContaining({ type: 'buff', stat: 'armor' }),
    );
  });

  it('Lux — a spell mark is consumed by her next basic attack for bonus damage', () => {
    const lux = maintained('Lux');
    const manager = battle([lux]);
    manager.submitAction({ type: ActionType.SpellQ, targetId: 'Target' });
    advanceToPlayer(manager, 'Lux');
    const logLength = manager.log.length;

    manager.submitAction({ type: ActionType.BasicAttack, targetId: 'Target' });
    const luxDamageEvents = manager.log
      .slice(logLength)
      .filter((event) => event.type === 'damage' && event.source === 'Lux');
    expect(luxDamageEvents).toHaveLength(2);
  });

  it('Soraka — gains initiative speed while a living ally is below 40% HP', () => {
    const soraka = maintained('Soraka', 325);
    const ally = dummy('LowAlly', 400);
    const manager = battle([soraka, ally], [dummy('Target', 300)], { LowAlly: 100 });
    const sorakaTurn = manager.turnOrder.find((entry) => entry.champion.id === 'Soraka')!;

    expect(sorakaTurn.speedValue).toBeGreaterThan(500);
    expect(manager.turnOrder[0].champion.id).toBe('Soraka');
  });

  it('Jinx — a champion takedown grants both Get Excited stat buffs', () => {
    const jinx = maintained('Jinx');
    const manager = battle([jinx]);
    manager.getCombatantState('Target', 'enemy')!.currentHp = 1;

    manager.submitAction({ type: ActionType.BasicAttack, targetId: 'Target' });
    const state = manager.getCombatantState('Jinx', 'player')!;
    expect(
      state.effectManager.buffDebuffs.filter((effect) => effect.name.includes('get_excited')),
    ).toHaveLength(2);
  });

  it('Leona — an ally consumes Sunlight and credits Leona bonus damage', () => {
    const leona = maintained('Leona', 500);
    const ally = dummy('Ally', 400);
    const manager = battle([leona, ally], [dummy('Target', 300)]);
    manager.submitAction({ type: ActionType.SpellQ, targetId: 'Target' });
    advanceToPlayer(manager, 'Ally');
    const logLength = manager.log.length;

    manager.submitAction({ type: ActionType.BasicAttack, targetId: 'Target' });
    expect(
      manager.log
        .slice(logLength)
        .some((event) => event.type === 'damage' && event.source === 'Leona'),
    ).toBe(true);
  });

  it('Malphite — starts combat with Granite Shield equal to 10% max HP', () => {
    const malphite = maintained('Malphite');
    const manager = battle([malphite]);
    const state = manager.getCombatantState('Malphite', 'player')!;

    expect(state.currentShield).toBe(Math.round(state.maxHp * 0.1));
  });

  it('Warwick — basic attacks deal bonus magic damage and heal below half HP', () => {
    const warwick = maintained('Warwick');
    const manager = battle([warwick]);
    const state = manager.getCombatantState('Warwick', 'player')!;
    state.currentHp = state.maxHp * 0.2;
    const hpBefore = state.currentHp;
    const logLength = manager.log.length;

    manager.submitAction({ type: ActionType.BasicAttack, targetId: 'Target' });
    const damageEvents = manager.log
      .slice(logLength)
      .filter((event) => event.type === 'damage' && event.source === 'Warwick');
    expect(damageEvents).toHaveLength(2);
    expect(state.currentHp).toBeGreaterThan(hpBefore);
  });
});
