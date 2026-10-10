import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { BattleManager, type BattleManagerOptions } from '@/game/battle/BattleManager';
import { isPassiveCombatReady, isSpellCombatReady } from '@/game/battle/combatContentSupport';
import { ActionType, type CombatantState } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { DelayedDamageEffect } from '@/game/effects/DelayedDamageEffect';
import {
  applyRunProgressStatBonuses,
  cloneRunProgressSnapshot,
  isRunProgressSnapshot,
  resolveRunProgressionGains,
} from '@/game/runProgression';
import {
  type Champion,
  type RunProgressionDefinition,
  type SpellEffect,
  TargetingType,
} from '@/types/champion';

const KEY = 'test.permanent_power';
const DEFINITION: RunProgressionDefinition = {
  key: KEY,
  name: 'Permanent power',
  description: 'Run-only stacks',
  cap: 200,
  statBonuses: { abilityPower: 1 },
  onKill: [
    { targetTier: 'boss', amount: 10 },
    { targetTier: 'elite', amount: 3 },
    { targetTier: 'normal', abilityOnly: true, amount: 1 },
  ],
};

function definition(
  id: string,
  effects?: SpellEffect[],
  progression?: RunProgressionDefinition[],
): Champion {
  const base = championDB.getById('Annie');
  if (!base) throw new Error('Missing test base');
  return {
    ...base,
    id,
    name: id,
    stats: {
      ...base.stats,
      hp: 1000,
      hpPerLevel: 0,
      mp: 1000,
      mpPerLevel: 0,
      armor: 0,
      magicResist: 0,
      attackDamage: progression ? 2000 : 1,
      crit: 0,
      hpRegen: 0,
      moveSpeed: progression ? 500 : 1,
    },
    spells: base.spells.map((spell, index) => ({
      ...spell,
      cooldownTurns: [1],
      cost: [0],
      targeting: TargetingType.Enemy,
      effects:
        index === 0
          ? (effects ?? [
              { type: 'damage', damageType: 'true', baseDamage: [progression ? 2000 : 1] },
            ])
          : [{ type: 'damage', damageType: 'true', baseDamage: [1] }],
    })),
    passive: { ...base.passive, effects: [], runProgression: progression },
  };
}

function battle(
  caster: ChampionInstance,
  enemies: ChampionInstance[],
  options: BattleManagerOptions = {},
  allies: ChampionInstance[] = [],
): BattleManager {
  const manager = new BattleManager(
    { side: 'player', champions: [caster, ...allies] },
    { side: 'enemy', champions: enemies },
    { autoActions: false, random: () => 0.99, ...options },
  );
  manager.startBattle();
  return manager;
}

function advanceTo(manager: BattleManager, caster: ChampionInstance): void {
  for (let turn = 0; turn < 50 && manager.currentCombatant?.champion !== caster; turn++) {
    manager.processCurrentTurn();
  }
  expect(manager.currentCombatant?.champion).toBe(caster);
}

function cast(manager: BattleManager, target: CombatantState): void {
  expect(manager.submitAction({ type: ActionType.SpellQ, targetId: target.targetId })).toBe(true);
}

describe('run progression state', () => {
  it('applies bonuses without mutating or compounding reused calculated stats', () => {
    const stats = new ChampionInstance(definition('Ordinary')).getStats();
    const initial = stats.abilityPower;
    expect(applyRunProgressStatBonuses(stats, [DEFINITION], { [KEY]: 10 }).abilityPower).toBe(
      initial + 10,
    );
    expect(applyRunProgressStatBonuses(stats, [DEFINITION], { [KEY]: 10 }).abilityPower).toBe(
      initial + 10,
    );
    expect(stats.abilityPower).toBe(initial);
  });
  it('keeps empty state absent and restores only declared capped counters', () => {
    const ordinary = new ChampionInstance(definition('Ordinary'));
    expect(ordinary.toSnapshot()).not.toHaveProperty('runProgress');
    expect(ordinary.setRunCounter(KEY, 10)).toBe(0);
    const champion = new ChampionInstance(
      definition('GenericMage', undefined, [DEFINITION]),
      1,
      1,
      {},
      { [KEY]: 300, 'other.counter': 12 },
    );
    expect(champion.getRunProgressSnapshot()).toEqual({ [KEY]: 200 });
    const copy = champion.getRunProgressSnapshot();
    copy[KEY] = 0;
    expect(champion.getRunCounter(KEY)).toBe(200);
    champion.restoreRunProgress({ [KEY]: 0 });
    expect(champion.toSnapshot()).not.toHaveProperty('runProgress');
  });

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'ignores unsafe counter value %s',
    (value) => {
      const champion = new ChampionInstance(definition('GenericMage', undefined, [DEFINITION]));
      champion.setRunCounter(KEY, 5);
      expect(champion.setRunCounter(KEY, value)).toBe(5);
      expect(champion.incrementRunCounter(KEY, value)).toBe(5);
    },
  );

  it('adds exactly one AP per stack after mastery/enhancements at all levels and caps overflow', () => {
    const champion = new ChampionInstance(definition('GenericMage', undefined, [DEFINITION]), 5, 2);
    champion.setMasteryLevel(3);
    const bonuses = { flat: { abilityPower: 50 }, percent: { abilityPower: 20 }, effects: [] };
    const before = [
      champion.getStats().abilityPower,
      champion.getStatsAtLevel(18).abilityPower,
      champion.getStatsWithEnhancements(bonuses).abilityPower,
    ];
    champion.incrementRunCounter(KEY, 25);
    expect(champion.getStats().abilityPower).toBe(before[0] + 25);
    expect(champion.getStatsAtLevel(18).abilityPower).toBe(before[1] + 25);
    expect(champion.getStatsWithEnhancements(bonuses).abilityPower).toBe(before[2] + 25);
    champion.setEnhancementBonuses(bonuses);
    expect(champion.getEnhancedStats().abilityPower).toBe(before[2] + 25);
    expect(champion.toSnapshot().stats.abilityPower).toBe(before[0] + 25);
    expect(champion.incrementRunCounter(KEY, Number.MAX_SAFE_INTEGER)).toBe(200);
  });

  it('validates snapshots strictly for persistence and rejects prototype attacks', () => {
    expect(isRunProgressSnapshot({ [KEY]: 200 }, [DEFINITION])).toBe(true);
    expect(isRunProgressSnapshot({ [KEY]: 201 }, [DEFINITION])).toBe(false);
    expect(isRunProgressSnapshot({ 'other.counter': 1 }, [DEFINITION])).toBe(false);
    for (const value of [
      null,
      [],
      { [KEY]: -1 },
      { [KEY]: Infinity },
      JSON.parse('{"__proto__":1}'),
      { 'test.constructor': 1 },
      Object.create({ [KEY]: 1 }),
    ]) {
      expect(isRunProgressSnapshot(value)).toBe(false);
      expect(cloneRunProgressSnapshot(value, [DEFINITION])).toEqual({});
    }
  });

  it('evaluates generic hooks with a single matching tier rule', () => {
    expect(
      resolveRunProgressionGains([DEFINITION], {
        hook: 'onKill',
        ability: true,
        targetTier: 'boss',
      }),
    ).toEqual([{ key: KEY, amount: 10 }]);
    expect(
      resolveRunProgressionGains([DEFINITION], {
        hook: 'onDamage',
        ability: true,
        targetTier: 'normal',
      }),
    ).toEqual([]);
    const generic = { ...DEFINITION, onDamage: [{ amount: 2 }], onCombatEnd: [{ amount: 5 }] };
    expect(resolveRunProgressionGains([generic], { hook: 'onDamage', ability: false })).toEqual([
      { key: KEY, amount: 2 },
    ]);
    expect(
      isPassiveCombatReady('UnknownGenericChampion', {
        ...definition('Generic').passive,
        runProgression: [generic],
      }),
    ).toBe(true);
  });
});

describe('combat run progression triggers', () => {
  it.each([
    ['normal', ActionType.SpellQ, 1],
    ['normal', ActionType.BasicAttack, 0],
    ['elite', ActionType.SpellQ, 3],
    ['elite', ActionType.BasicAttack, 3],
    ['boss', ActionType.SpellQ, 10],
    ['boss', ActionType.BasicAttack, 10],
  ] as const)('grants exclusive %s kill rewards with %s', (tier, action, expected) => {
    const caster = new ChampionInstance(definition('GenericMage', undefined, [DEFINITION]));
    const manager = battle(caster, [new ChampionInstance(definition('Target'))], {
      combatantTiers: { Target: tier },
    });
    expect(manager.submitAction({ type: action, targetId: 'Target' })).toBe(true);
    expect(caster.getRunCounter(KEY)).toBe(expected);
    const events = manager.log.filter((event) => event.type === 'run_counter_gain');
    expect(events).toHaveLength(expected > 0 ? 1 : 0);
    if (expected)
      expect(events[0]).toMatchObject({
        source: 'GenericMage',
        target: 'Target',
        sourceCombatantId: 'GenericMage',
        targetCombatantId: 'Target',
        sourceSide: 'player',
        targetSide: 'enemy',
        key: KEY,
        amount: expected,
        value: expected,
      });
    expect(manager.getFinalPlayerStates()[0]).toEqual(
      expect.objectContaining(
        expected ? { runProgress: { [KEY]: expected } } : { championId: 'GenericMage' },
      ),
    );
  });

  it('does not grant stacks on hits or assists', () => {
    const caster = new ChampionInstance(
      definition(
        'GenericMage',
        [{ type: 'damage', damageType: 'true', baseDamage: [5] }],
        [DEFINITION],
      ),
    );
    const ally = new ChampionInstance(
      definition('Finisher', [{ type: 'damage', damageType: 'true', baseDamage: [2000] }]),
    );
    const manager = battle(caster, [new ChampionInstance(definition('Target'))], {}, [ally]);
    cast(manager, manager.getEnemyCombatants()[0]);
    expect(caster.getRunCounter(KEY)).toBe(0);
    advanceTo(manager, ally);
    cast(manager, manager.getEnemyCombatants()[0]);
    expect(caster.getRunCounter(KEY)).toBe(0);
  });

  it('credits duplicate enemy identities separately but never credits a revived identity twice', () => {
    const caster = new ChampionInstance(definition('GenericMage', undefined, [DEFINITION]));
    const manager = battle(caster, [
      new ChampionInstance(definition('Duplicate')),
      new ChampionInstance(definition('Duplicate')),
      new ChampionInstance(definition('Survivor', [{ type: 'damage', baseDamage: [1] }])),
    ]);
    const [first, second] = manager.getEnemyCombatants();
    cast(manager, first);
    expect(caster.getRunCounter(KEY)).toBe(1);
    // A legal revive restores these exact runtime fields while retaining the combatant identity.
    first.isDefeated = false;
    first.currentHp = 100;
    advanceTo(manager, caster);
    cast(manager, first);
    expect(caster.getRunCounter(KEY)).toBe(1);
    advanceTo(manager, caster);
    cast(manager, second);
    expect(caster.getRunCounter(KEY)).toBe(2);
    expect(
      manager.log
        .filter((event) => event.type === 'run_counter_gain')
        .map((event) => event.targetCombatantId),
    ).toEqual(['Duplicate#1', 'Duplicate#2']);
  });

  it('logs effective cap gains and applies generic combat end once', () => {
    const endDef = { ...DEFINITION, onCombatEnd: [{ amount: 5 }] };
    const caster = new ChampionInstance(
      definition('GenericMage', undefined, [endDef]),
      1,
      1,
      {},
      { [KEY]: 198 },
    );
    const manager = battle(caster, [new ChampionInstance(definition('Boss'))], {
      combatantTiers: { Boss: 'boss' },
    });
    cast(manager, manager.getEnemyCombatants()[0]);
    expect(manager.log.filter((event) => event.type === 'run_counter_gain')).toEqual([
      expect.objectContaining({ amount: 2, value: 200 }),
    ]);
    manager.processCurrentTurn();
    expect(caster.getRunCounter(KEY)).toBe(200);
  });

  it('executes generic damage and combat-end hooks without champion branches', () => {
    const generic = { ...DEFINITION, onDamage: [{ amount: 2 }], onCombatEnd: [{ amount: 5 }] };
    const caster = new ChampionInstance(definition('GenericMage', undefined, [generic]));
    const manager = battle(caster, [new ChampionInstance(definition('Target'))]);
    cast(manager, manager.getEnemyCombatants()[0]);
    expect(caster.getRunCounter(KEY)).toBe(8);
    manager.processCurrentTurn();
    expect(caster.getRunCounter(KEY)).toBe(8);
  });
});

describe('single delayed spell impact and missing health scaling', () => {
  it('retains the source side for delayed spell kills in mirror matchups', () => {
    const player = new ChampionInstance(
      definition(
        'MirrorMage',
        [{ type: 'damage', damageType: 'true', baseDamage: [1] }],
        [DEFINITION],
      ),
    );
    const enemy = new ChampionInstance(
      definition(
        'MirrorMage',
        [{ type: 'delayed_damage', damageType: 'true', baseDamage: [2000], duration: 1 }],
        [DEFINITION],
      ),
    );
    const ally = new ChampionInstance(definition('Survivor'));
    const manager = battle(player, [enemy], { combatantTiers: { MirrorMage: 'boss' } }, [ally]);
    cast(manager, manager.getEnemyCombatants()[0]);
    manager.processCurrentTurn();
    advanceTo(manager, player);
    cast(manager, manager.getEnemyCombatants()[0]);
    expect(player.getRunCounter(KEY)).toBe(0);
    expect(enemy.getRunCounter(KEY)).toBe(1);
    expect(manager.log.find((event) => event.type === 'run_counter_gain')).toMatchObject({
      sourceSide: 'enemy',
      targetSide: 'player',
      sourceCombatantId: 'MirrorMage',
      targetCombatantId: 'MirrorMage',
      amount: 1,
    });
  });

  it('delays one ability impact until the next target turn, outside the DoT family', () => {
    const caster = new ChampionInstance(
      definition(
        'GenericMage',
        [{ type: 'delayed_damage', damageType: 'true', baseDamage: [2000], duration: 1 }],
        [DEFINITION],
      ),
    );
    const target = new ChampionInstance(
      definition('Target', [{ type: 'damage', damageType: 'true', baseDamage: [1] }]),
    );
    const manager = battle(caster, [target]);
    const state = manager.getEnemyCombatants()[0];
    cast(manager, state);
    expect(state.currentHp).toBe(state.maxHp);
    expect(caster.getRunCounter(KEY)).toBe(0);
    expect(state.effectManager.dots).toEqual([]);
    const pending = state.effectManager.effects[0];
    expect(pending).toBeInstanceOf(DelayedDamageEffect);
    expect(pending.duration).toBe(1);
    manager.processCurrentTurn();
    expect(state.isDefeated).toBe(true);
    expect(caster.getRunCounter(KEY)).toBe(1);
    expect(pending.tick()).toBeNull();
    expect(
      manager.log.filter((event) => event.type === 'damage' && event.source === 'GenericMage'),
    ).toHaveLength(1);
    expect(isSpellCombatReady(caster.getSpell('Q')!)).toBe(true);
  });

  it.each([
    [1000, 100],
    [500, 150],
    [100, 190],
  ])('scales damage at %s current HP to %s without execute', (hp, expected) => {
    const caster = new ChampionInstance(
      definition(
        'GenericMage',
        [{ type: 'damage', damageType: 'true', baseDamage: [100], missingHealthScaling: 1 }],
        [DEFINITION],
      ),
    );
    const manager = battle(caster, [new ChampionInstance(definition('Target'))]);
    const target = manager.getEnemyCombatants()[0];
    target.currentHp = hp;
    cast(manager, target);
    const damage = manager.log.find(
      (event) => event.type === 'damage' && event.source === 'GenericMage',
    );
    expect(damage?.type).toBe('damage');
    if (damage?.type === 'damage')
      expect(damage.amount + (damage.overkillDamage ?? 0)).toBe(expected);
  });
});
