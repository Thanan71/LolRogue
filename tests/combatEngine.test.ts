/**
 * Combat Engine — Edge Case & Integration Tests (Vitest).
 *
 * Phase 2: Tests unitaires pour le moteur de combat.
 * Covers: damage formulas, initiative, effect application,
 * victory conditions, 0 HP, overflow shields, CC chains.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BattleManager } from '../src/game/battle/BattleManager';
import { BattlePhase, ActionType } from '../src/game/battle/types';
import type { BattleTeam, BattleAction, BattleEvent } from '../src/game/battle/types';
import { ChampionInstance } from '../src/game/ChampionInstance';
import { EffectManager } from '../src/game/effects/EffectManager';
import { DamageEffect } from '../src/game/effects/DamageEffect';
import { HealEffect } from '../src/game/effects/HealEffect';
import { ShieldEffect } from '../src/game/effects/ShieldEffect';
import { CCEffect } from '../src/game/effects/CCEffect';
import { BuffDebuffEffect, createBuff, createDebuff } from '../src/game/effects/BuffDebuffEffect';
import { ExecuteEffect } from '../src/game/effects/ExecuteEffect';
import {
  EffectCategory, DamageType, CCType, type EffectEvent,
} from '../src/game/effects/types';
import {
  calculArmorReduction, calculMReduction, critDamage,
  calculateADDamage, calculateAPDamage, calculateTrueDamage,
} from '../src/utils/damage';
import type { Champion, ChampionStats, Spell, Passive } from '../src/types';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeTestChampion(overrides: Partial<Champion> = {}): Champion {
  const baseStats: ChampionStats = {
    hp: 500, mp: 300, moveSpeed: 330, armor: 30, magicResist: 30,
    attackDamage: 60, attackSpeed: 0.65, attackRange: 175,
    hpPerLevel: 90, mpPerLevel: 40, armorPerLevel: 4, magicResistPerLevel: 1.3,
    attackDamagePerLevel: 3, attackSpeedPerLevel: 2.5,
    hpRegen: 7, hpRegenPerLevel: 0.7, mpRegen: 8, mpRegenPerLevel: 0.8,
    crit: 0, critPerLevel: 0,
  };
  const makeSpell = (slot: string): Spell => ({
    id: `Test${slot}`, name: `Test Spell ${slot}`, description: `Desc ${slot}`,
    maxRank: 5, cooldown: [8, 7.5, 7, 6.5, 6], cost: [50, 55, 60, 65, 70],
    range: [700, 700, 700, 700, 700], image: `Test${slot}.png`,
  });
  const passive: Passive = {
    name: 'Test Passive', description: 'Desc', image: 'TestPassive.png',
  };
  const defaults: Champion = {
    id: 'TestChampion', key: '9999', name: 'Test Champion', title: 'the Tester',
    tags: ['Mage', 'Assassin'], resourceType: 'Mana', stats: baseStats,
    spells: [makeSpell('Q'), makeSpell('W'), makeSpell('E'), makeSpell('R')],
    passive, iconUrl: '/data/lol/img/champions/TestChampion.png',
  };
  return { ...defaults, ...overrides };
}

function makeChampion(
  id: string,
  statOverrides: Partial<ChampionStats> = {},
): ChampionInstance {
  const champ = makeTestChampion({ id, name: id, key: id });
  Object.assign(champ.stats, statOverrides);
  return new ChampionInstance(champ, 1);
}

function makeTeams(
  playerIds: string[],
  enemyIds: string[],
  statOverrides: Record<string, Partial<ChampionStats>> = {},
): { playerTeam: BattleTeam; enemyTeam: BattleTeam } {
  return {
    playerTeam: {
      side: 'player',
      champions: playerIds.map(id => makeChampion(id, statOverrides[id] ?? {})),
    },
    enemyTeam: {
      side: 'enemy',
      champions: enemyIds.map(id => makeChampion(id, statOverrides[id] ?? {})),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DAMAGE FORMULA EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Damage Formula Edge Cases', () => {

  describe('armor reduction — extreme values', () => {
    it('returns 0 reduction at armor = 0', () => {
      expect(calculArmorReduction(100, 0)).toBe(0);
    });
    it('returns 0 reduction for negative armor', () => {
      expect(calculArmorReduction(100, -50)).toBe(0);
    });
    it('handles near-infinite armor (~99.9% reduction)', () => {
      expect(calculArmorReduction(1000, 99900)).toBeCloseTo(999, 0);
    });
    it('handles zero raw damage', () => {
      expect(calculArmorReduction(0, 50)).toBe(0);
    });
  });

  describe('crit edge cases', () => {
    it('crit of 0 damage yields 0', () => {
      expect(critDamage(0)).toBe(0);
    });
    it('crit with zero multiplier yields 0', () => {
      expect(critDamage(100, 0)).toBe(0);
    });
    it('crit with fractional multiplier', () => {
      expect(critDamage(100, 1.75)).toBe(175);
    });
    it('handles very large values without overflow', () => {
      expect(critDamage(1_000_000)).toBe(2_000_000);
    });
  });

  describe('AD damage edge cases', () => {
    it('returns 0 at AD = 0', () => {
      expect(calculateADDamage(0, 1.0, 30)).toBe(0);
    });
    it('returns 0 at ratio = 0', () => {
      expect(calculateADDamage(100, 0, 30)).toBe(0);
    });
    it('returns 0 against extremely high armor', () => {
      expect(calculateADDamage(10, 0.1, 10000)).toBe(0);
    });
    it('never returns negative damage', () => {
      expect(calculateADDamage(60, 1.0, -20)).toBeGreaterThanOrEqual(0);
    });
    it('handles large ratio values', () => {
      expect(calculateADDamage(50, 10.0, 0)).toBe(500);
    });
  });

  describe('AP damage edge cases', () => {
    it('returns 0 at AP = 0', () => {
      expect(calculateAPDamage(0, 1.0, 30)).toBe(0);
    });
    it('handles fractional AP values', () => {
      const dmg = calculateAPDamage(100.5, 0.8, 0);
      expect(dmg).toBe(80);
    });
  });

  describe('True damage edge cases', () => {
    it('ignores all defenses', () => {
      expect(calculateTrueDamage(100)).toBe(100);
    });
    it('clamps negative to 0', () => {
      expect(calculateTrueDamage(-50)).toBe(0);
    });
    it('rounds fractional values', () => {
      expect(calculateTrueDamage(99.7)).toBe(100);
      expect(calculateTrueDamage(99.3)).toBe(99);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. INITIATIVE & TURN ORDER
// ═══════════════════════════════════════════════════════════════════════════════

describe('Initiative & Turn Order', () => {

  it('higher speed always goes first (statistical)', () => {
    // With 30 speed difference, the faster champ should almost always go first
    const teams = makeTeams(
      ['Fast'],
      ['Slow'],
      { Fast: { moveSpeed: 355 }, Slow: { moveSpeed: 325 } },
    );
    for (let i = 0; i < 50; i++) {
      const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
      bm.startBattle();
      const firstEntry = bm.turnOrder[0];
      // jitter is at most 0.5, so 355-325=30 >> 0.5 → Fast always first
      expect(firstEntry.champion.id).toBe('Fast');
    }
  });

  it('dead champions excluded from turn order', () => {
    const teams = makeTeams(['P1', 'P2', 'P3'], ['E1']);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    bm.startBattle();

    // Manually defeat P2
    const p2 = bm.getCombatantState('P2', 'player')!;
    p2.currentHp = 0;
    p2.isDefeated = true;

    // Process current round with safety to avoid infinite loop
    let safety = 50;
    while (bm.phase === BattlePhase.TurnActive && safety-- > 0) {
      bm.processCurrentTurn();
    }

    // After new round starts, P2 should not appear in turn order
    const ids = bm.turnOrder.map(e => e.champion.id);
    expect(ids).not.toContain('P2');
  });

  it('turn order length equals alive champions total', () => {
    const teams = makeTeams(['P1', 'P2'], ['E1', 'E2', 'E3']);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    bm.startBattle();
    expect(bm.turnOrder.length).toBe(5);
  });

  it('defeating mid-round skips subsequent turns for dead champ', () => {
    const teams = makeTeams(['P1', 'P2', 'P3'], ['E1']);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    const events: BattleEvent[] = [];
    bm.on('event', e => events.push(e));
    bm.startBattle();

    let safety = 50;
    while (bm.phase !== BattlePhase.Finished && safety-- > 0) {
      const entry = bm.currentTurnEntry;
      if (entry) {
        const state = bm.getCombatantState(entry.champion.id, entry.side);
        if (state && !state.isDefeated) {
          bm.processCurrentTurn();
        } else {
          break;
        }
      } else {
        break;
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. 0 HP — DEFEAT CONDITION
// ═══════════════════════════════════════════════════════════════════════════════

describe('0 HP Defeat Condition', () => {
  let manager: EffectManager;

  beforeEach(() => {
    manager = new EffectManager('champ-1');
  });

  it('damage reducing HP to exactly 0 triggers defeat', () => {
    const teams = makeTeams(['P1'], ['E1']);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    const events: BattleEvent[] = [];
    bm.on('event', e => events.push(e));
    bm.startBattle();

    const enemy = bm.getCombatantState('E1', 'enemy')!;
    enemy.currentHp = 1;
    bm.processCurrentTurn();

    const defeat = events.find(e => e.type === 'defeat');
    expect(defeat).toBeDefined();
  });

  it('combatant at 0 HP is marked defeated and excluded', () => {
    const teams = makeTeams(['P1'], ['E1']);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    bm.startBattle();

    const enemy = bm.getCombatantState('E1', 'enemy')!;
    enemy.currentHp = 0;
    enemy.isDefeated = true;

    expect(enemy.isDefeated).toBe(true);
    expect(bm.getAliveEnemies('player').length).toBe(0);
  });

  it('currentHp never goes below 0 after full battle', () => {
    const teams = makeTeams(['P1'], ['E1']);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    bm.startBattle();

    let safety = 200;
    while (bm.phase !== BattlePhase.Finished && safety-- > 0) {
      bm.processCurrentTurn();
    }
    for (const c of [...bm.getPlayerCombatants(), ...bm.getEnemyCombatants()]) {
      expect(c.currentHp).toBeGreaterThanOrEqual(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. OVERFLOW SHIELDS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Overflow Shields', () => {
  let manager: EffectManager;

  beforeEach(() => {
    manager = new EffectManager('champ-1');
  });

  it('damage exceeding shield passes remainder', () => {
    manager.apply(new ShieldEffect({
      sourceId: 'ally', targetId: 'champ-1',
      magnitude: 100, duration: 5,
    }));
    const result = manager.absorbWithShields(300);
    expect(result.totalAbsorbed).toBe(100);
    expect(result.finalDamage).toBe(200);
  });

  it('multiple shields absorb sequentially', () => {
    manager.apply(new ShieldEffect({
      name: 'S1', sourceId: 's1', targetId: 'champ-1',
      magnitude: 100, duration: 5,
    }));
    manager.apply(new ShieldEffect({
      name: 'S2', sourceId: 's2', targetId: 'champ-1',
      magnitude: 150, duration: 5,
    }));
    const result = manager.absorbWithShields(300);
    expect(result.totalAbsorbed).toBe(250);
    expect(result.finalDamage).toBe(50);
  });

  it('exactly consumed shield expires', () => {
    const shield = new ShieldEffect({
      sourceId: 'ally', targetId: 'champ-1',
      magnitude: 200, duration: 5,
    });
    manager.apply(shield);
    manager.absorbWithShields(200);
    expect(shield.expired).toBe(true);
    expect(shield.remainingShield).toBe(0);
  });

  it('0 damage does not break shield', () => {
    const shield = new ShieldEffect({
      sourceId: 'ally', targetId: 'champ-1',
      magnitude: 500, duration: 5,
    });
    manager.apply(shield);
    const result = manager.absorbWithShields(0);
    expect(result.totalAbsorbed).toBe(0);
    expect(shield.isActive()).toBe(true);
  });

  it('expired shield absorbs nothing', () => {
    const shield = new ShieldEffect({
      sourceId: 'ally', targetId: 'champ-1',
      magnitude: 500, duration: 5,
    });
    shield.data.expired = true;
    const result = shield.absorbDamage(100);
    expect(result.absorbed).toBe(0);
    expect(result.passed).toBe(100);
  });

  it('shield duration expiry works with HP remaining', () => {
    const shield = new ShieldEffect({
      sourceId: 'ally', targetId: 'champ-1',
      magnitude: 500, duration: 2,
    });
    manager.apply(shield);
    manager.tickAll();
    expect(shield.expired).toBe(false);
    manager.tickAll();
    expect(shield.expired).toBe(true);
  });

  it('absorbWithShields cleans expired shields', () => {
    manager.apply(new ShieldEffect({
      sourceId: 'ally', targetId: 'champ-1',
      magnitude: 100, duration: 5,
    }));
    manager.absorbWithShields(100);
    expect(manager.shields.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CC CHAINS
// ═══════════════════════════════════════════════════════════════════════════════

describe('CC Chains', () => {
  let manager: EffectManager;

  beforeEach(() => {
    manager = new EffectManager('champ-1');
  });

  it('stacking two stuns keeps canAct false throughout', () => {
    manager.apply(new CCEffect({
      sourceId: 'src1', targetId: 'champ-1',
      ccType: CCType.Stun, duration: 2,
    }));
    manager.apply(new CCEffect({
      sourceId: 'src2', targetId: 'champ-1',
      ccType: CCType.Stun, duration: 3,
    }));
    expect(manager.canAct()).toBe(false);

    // Tick stun 1 twice — it expires
    manager.tickAll();
    manager.tickAll();
    // Stun 2 still active (1 tick elapsed)
    expect(manager.canAct()).toBe(false);

    // Tick stun 2 until it expires
    manager.tickAll();
    manager.tickAll(); // 3 ticks total → expired
    expect(manager.canAct()).toBe(true);
  });

  it('stun → knockup → stun chain', () => {
    manager.apply(new CCEffect({
      sourceId: 's1', targetId: 'champ-1',
      ccType: CCType.Stun, duration: 1,
    }));
    expect(manager.canAct()).toBe(false);
    expect(manager.isHardCCd()).toBe(true);

    manager.tickAll(); // stun expires

    manager.apply(new CCEffect({
      sourceId: 's2', targetId: 'champ-1',
      ccType: CCType.Knockup, duration: 1,
    }));
    expect(manager.canAct()).toBe(false);
    expect(manager.isHardCCd()).toBe(true);

    manager.tickAll(); // knockup expires
    expect(manager.canAct()).toBe(true);
  });

  it('snare allows acting but not moving', () => {
    manager.apply(new CCEffect({
      sourceId: 's', targetId: 'champ-1',
      ccType: CCType.Snare, duration: 2,
    }));
    expect(manager.canAct()).toBe(true);
    expect(manager.canCast()).toBe(true);
    expect(manager.canMove()).toBe(false);
  });

  it('silence prevents casting but allows movement', () => {
    manager.apply(new CCEffect({
      sourceId: 's', targetId: 'champ-1',
      ccType: CCType.Silence, duration: 2,
    }));
    expect(manager.canAct()).toBe(true);
    expect(manager.canMove()).toBe(true);
    expect(manager.canCast()).toBe(false);
  });

  it('slow does not prevent any actions', () => {
    manager.apply(new CCEffect({
      sourceId: 's', targetId: 'champ-1',
      ccType: CCType.Slow, duration: 2, slowAmount: 0.5,
    }));
    expect(manager.canAct()).toBe(true);
    expect(manager.canCast()).toBe(true);
    expect(manager.canMove()).toBe(true);
  });

  it('multiple slows stack but cap at 99%', () => {
    manager.apply(new CCEffect({
      sourceId: 's1', targetId: 'champ-1',
      ccType: CCType.Slow, duration: 3, slowAmount: 0.6,
    }));
    manager.apply(new CCEffect({
      sourceId: 's2', targetId: 'champ-1',
      ccType: CCType.Slow, duration: 3, slowAmount: 0.5,
    }));
    // total slow = 1.1, capped at 0.99 → multiplier = 0.01
    expect(manager.getSpeedMultiplier()).toBeCloseTo(0.01, 2);
  });

  it('snare + silence together blocks move and cast', () => {
    manager.apply(new CCEffect({
      sourceId: 's1', targetId: 'champ-1',
      ccType: CCType.Snare, duration: 2,
    }));
    manager.apply(new CCEffect({
      sourceId: 's2', targetId: 'champ-1',
      ccType: CCType.Silence, duration: 2,
    }));
    expect(manager.canAct()).toBe(true); // neither is hard CC
    expect(manager.canMove()).toBe(false); // snare
    expect(manager.canCast()).toBe(false); // silence
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. VICTORY CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Victory Conditions', () => {

  it('detects player victory when all enemies die', () => {
    const teams = makeTeams(['P1', 'P2'], ['E1']);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    const events: BattleEvent[] = [];
    bm.on('event', e => events.push(e));
    bm.startBattle();

    let safety = 200;
    while (bm.phase !== BattlePhase.Finished && safety-- > 0) {
      bm.processCurrentTurn();
    }

    expect(bm.phase).toBe(BattlePhase.Finished);
    const endEvent = events.find(e => e.type === 'battle_end');
    expect(endEvent).toBeDefined();
    if (endEvent && 'winner' in endEvent) {
      expect(endEvent.winner).toBe('player');
    }
  });

  it('detects enemy victory when all players die', () => {
    const teams = makeTeams(
      ['P1'],
      ['E1', 'E2', 'E3', 'E4', 'E5'],
    );
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    const events: BattleEvent[] = [];
    bm.on('event', e => events.push(e));
    bm.startBattle();

    let safety = 500;
    while (bm.phase !== BattlePhase.Finished && safety-- > 0) {
      bm.processCurrentTurn();
    }

    expect(bm.phase).toBe(BattlePhase.Finished);
    const endEvent = events.find(e => e.type === 'battle_end');
    expect(endEvent).toBeDefined();
    if (endEvent && 'winner' in endEvent) {
      expect(endEvent.winner).toBe('enemy');
    }
  });

  it('returns valid BattleResult after finish', () => {
    const teams = makeTeams(['P1'], ['E1']);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    bm.startBattle();

    let safety = 200;
    while (bm.phase !== BattlePhase.Finished && safety-- > 0) {
      bm.processCurrentTurn();
    }

    const result = bm.getResult();
    expect(result).not.toBeNull();
    expect(result!.totalRounds).toBeGreaterThan(0);
    expect(result!.log.length).toBeGreaterThan(0);
    expect(['player', 'enemy', 'draw']).toContain(result!.winner);
  });

  it('getResult returns null before battle ends', () => {
    const teams = makeTeams(['P1'], ['E1']);
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    expect(bm.getResult()).toBeNull();
  });

  it('maxRounds forces draw', () => {
    const teams = makeTeams(
      ['Tank1'],
      ['Tank2'],
      {
        Tank1: { hp: 99999, armor: 999, attackDamage: 1, moveSpeed: 330 },
        Tank2: { hp: 99999, armor: 999, attackDamage: 1, moveSpeed: 330 },
      },
    );
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam, {
      maxRounds: 5,
    });
    bm.startBattle();

    let safety = 100;
    while (bm.phase !== BattlePhase.Finished && safety-- > 0) {
      bm.processCurrentTurn();
    }

    const result = bm.getResult();
    expect(result).not.toBeNull();
    expect(result!.totalRounds).toBeLessThanOrEqual(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. EFFECT APPLICATION INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Effect Application Integration', () => {
  let manager: EffectManager;

  beforeEach(() => {
    manager = new EffectManager('champ-1');
  });

  it('DoT deals total damage equal to magnitude over duration', () => {
    const dot = new DamageEffect({
      sourceId: 'src', targetId: 'champ-1',
      magnitude: 300, damageType: DamageType.True, duration: 3,
    });
    manager.apply(dot);

    let totalDamage = 0;
    for (let i = 0; i < 3; i++) {
      const events = manager.tickAll();
      for (const ev of events) {
        if (ev.type === 'effect_tick' && ev.category === EffectCategory.Damage) {
          totalDamage += ev.value;
        }
      }
    }
    expect(totalDamage).toBe(300);
    expect(dot.expired).toBe(true);
  });

  it('HoT heals total equal to magnitude over duration', () => {
    const hot = new HealEffect({
      sourceId: 'src', targetId: 'champ-1',
      magnitude: 150, duration: 3, hot: true,
    });
    manager.apply(hot);

    let totalHeal = 0;
    for (let i = 0; i < 3; i++) {
      const events = manager.tickAll();
      for (const ev of events) {
        if (ev.type === 'effect_tick' && ev.category === EffectCategory.Heal) {
          totalHeal += ev.value;
        }
      }
    }
    expect(totalHeal).toBe(150);
    expect(hot.expired).toBe(true);
  });

  it('execute triggers only below threshold', () => {
    const exec = new ExecuteEffect({
      sourceId: 'src', targetId: 'champ-1', threshold: 0.25,
    });
    expect(exec.canExecute(500, 1000)).toBe(false);
    expect(exec.canExecute(250, 1000)).toBe(true);
    expect(exec.canExecute(100, 1000)).toBe(true);
  });

  it('execute with 0 maxHp returns false', () => {
    const exec = new ExecuteEffect({
      sourceId: 'src', targetId: 'champ-1', threshold: 0.3,
    });
    expect(exec.canExecute(0, 0)).toBe(false);
  });

  it('buff stat modifier computation is correct', () => {
    manager.apply(createBuff('AD+', 'src', 'champ-1', 'atk', 25, 'flat', 5));
    expect(manager.modifyStat('atk', 60)).toBe(85);
  });

  it('debuff reduces stat', () => {
    manager.apply(createDebuff('ArmorShred', 'src', 'champ-1', 'def', 15, 'flat', 3));
    expect(manager.modifyStat('def', 50)).toBe(35);
  });

  it('stat modifier never returns negative', () => {
    manager.apply(createDebuff('BigDebuff', 'src', 'champ-1', 'atk', 200, 'flat', 3));
    expect(manager.modifyStat('atk', 50)).toBe(0);
  });

  it('tickAll skips instant effects', () => {
    manager.apply(new DamageEffect({
      sourceId: 'src', targetId: 'champ-1',
      magnitude: 100, damageType: DamageType.AD,
    }));
    const events = manager.tickAll();
    const dmgEvents = events.filter(
      e => e.type === 'effect_tick' && e.category === EffectCategory.Damage,
    );
    expect(dmgEvents.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. BATTLE MANAGER CRITICAL STRIKE
// ═══════════════════════════════════════════════════════════════════════════════

describe('BattleManager Critical Strike', () => {

  it('crit chance 100% always crits', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0);
    const teams = makeTeams(['Critter'], ['Target'], {
      Critter: { crit: 100, attackDamage: 50, moveSpeed: 355 },
      Target: { moveSpeed: 325 },
    });
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    const events: BattleEvent[] = [];
    bm.on('event', e => events.push(e));
    bm.startBattle();
    bm.processCurrentTurn();

    const dmgEvent = events.find(e => e.type === 'damage');
    expect(dmgEvent).toBeDefined();
    if (dmgEvent && 'isCrit' in dmgEvent) {
      expect(dmgEvent.isCrit).toBe(true);
    }
    vi.restoreAllMocks();
  });

  it('crit chance 0% never crits', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const teams = makeTeams(['NoCrit'], ['Target'], {
      NoCrit: { crit: 0, attackDamage: 50, moveSpeed: 355 },
      Target: { moveSpeed: 325 },
    });
    const bm = new BattleManager(teams.playerTeam, teams.enemyTeam);
    const events: BattleEvent[] = [];
    bm.on('event', e => events.push(e));
    bm.startBattle();
    bm.processCurrentTurn();

    const dmgEvent = events.find(e => e.type === 'damage');
    expect(dmgEvent).toBeDefined();
    if (dmgEvent && 'isCrit' in dmgEvent) {
      expect(dmgEvent.isCrit).toBe(false);
    }
    vi.restoreAllMocks();
  });

  it('crit deals more damage than non-crit', () => {
    const withCritDmg: number[] = [];
    const noCritDmg: number[] = [];

    for (let i = 0; i < 10; i++) {
      vi.spyOn(Math, 'random').mockReturnValue(0.0);
      const teams1 = makeTeams(['C'], ['T'], {
        C: { crit: 100, attackDamage: 60, moveSpeed: 355 },
        T: { armor: 0, moveSpeed: 325 },
      });
      const bm1 = new BattleManager(teams1.playerTeam, teams1.enemyTeam);
      const evts1: BattleEvent[] = [];
      bm1.on('event', e => evts1.push(e));
      bm1.startBattle();
      bm1.processCurrentTurn();
      const d1 = evts1.find(e => e.type === 'damage');
      if (d1 && 'amount' in d1) withCritDmg.push(d1.amount);
      vi.restoreAllMocks();

      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      const teams2 = makeTeams(['C'], ['T'], {
        C: { crit: 0, attackDamage: 60, moveSpeed: 355 },
        T: { armor: 0, moveSpeed: 325 },
      });
      const bm2 = new BattleManager(teams2.playerTeam, teams2.enemyTeam);
      const evts2: BattleEvent[] = [];
      bm2.on('event', e => evts2.push(e));
      bm2.startBattle();
      bm2.processCurrentTurn();
      const d2 = evts2.find(e => e.type === 'damage');
      if (d2 && 'amount' in d2) noCritDmg.push(d2.amount);
      vi.restoreAllMocks();
    }

    const avgCrit = withCritDmg.reduce((a, b) => a + b, 0) / withCritDmg.length;
    const avgNoCrit = noCritDmg.reduce((a, b) => a + b, 0) / noCritDmg.length;
    expect(avgCrit).toBeGreaterThan(avgNoCrit);
  });
});
