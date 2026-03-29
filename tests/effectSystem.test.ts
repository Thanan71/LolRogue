/**
 * Effect System — comprehensive unit tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EffectManager } from '../src/game/effects/EffectManager';
import { DamageEffect } from '../src/game/effects/DamageEffect';
import { HealEffect } from '../src/game/effects/HealEffect';
import { ShieldEffect } from '../src/game/effects/ShieldEffect';
import { CCEffect } from '../src/game/effects/CCEffect';
import { BuffDebuffEffect, createBuff, createDebuff } from '../src/game/effects/BuffDebuffEffect';
import { ExecuteEffect } from '../src/game/effects/ExecuteEffect';
import {
  EffectCategory,
  DamageType,
  CCType,
  type EffectEvent,
} from '../src/game/effects/types';

describe('Effect System', () => {
  let manager: EffectManager;

  beforeEach(() => {
    manager = new EffectManager('champion-1');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DamageEffect
  // ═══════════════════════════════════════════════════════════════════════════

  describe('DamageEffect', () => {
    it('should create an instant AD damage effect', () => {
      const dmg = new DamageEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 100, damageType: DamageType.AD,
      });
      expect(dmg.category).toBe(EffectCategory.Damage);
      expect(dmg.damageType).toBe(DamageType.AD);
      expect(dmg.isInstant).toBe(true);
      expect(dmg.magnitude).toBe(100);
      expect(dmg.canCrit).toBe(true);
    });

    it('should create a True damage effect that cannot crit', () => {
      const dmg = new DamageEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 200, damageType: DamageType.True, canCrit: false,
      });
      expect(dmg.damageType).toBe(DamageType.True);
      expect(dmg.canCrit).toBe(false);
    });

    it('should apply instant damage via applyInstantDamage()', () => {
      const dmg = new DamageEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 150, damageType: DamageType.AP,
      });
      const events: EffectEvent[] = [];
      dmg.onTick((e) => events.push(e));

      const ev = dmg.applyInstantDamage(150);
      expect(ev.type).toBe('effect_tick');
      expect(ev.value).toBe(150);
      expect(ev.detail).toBe('ap_damage');
      expect(dmg.expired).toBe(true);
      expect(events.length).toBe(1);
    });

    it('should create a DoT effect (duration > 0)', () => {
      const dmg = new DamageEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 300, damageType: DamageType.AP, duration: 3,
      });
      expect(dmg.isInstant).toBe(false);
      expect(dmg.duration).toBe(3);
      expect(dmg.remainingRounds).toBe(3);
    });

    it('should tick DoT effect each round', () => {
      const dmg = new DamageEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 300, damageType: DamageType.AP, duration: 3,
      });
      const ev1 = dmg.tick();
      expect(ev1?.value).toBe(100);
      expect(dmg.ticksElapsed).toBe(1);
      expect(dmg.expired).toBe(false);

      dmg.tick();
      dmg.tick();
      expect(dmg.expired).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HealEffect
  // ═══════════════════════════════════════════════════════════════════════════

  describe('HealEffect', () => {
    it('should create an instant heal effect', () => {
      const heal = new HealEffect({
        sourceId: 'src', targetId: 'tgt', magnitude: 200,
      });
      expect(heal.category).toBe(EffectCategory.Heal);
      expect(heal.isInstant).toBe(true);
      expect(heal.hot).toBe(false);
    });

    it('should create a HoT effect', () => {
      const heal = new HealEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 150, duration: 3, hot: true,
      });
      expect(heal.hot).toBe(true);
      expect(heal.isInstant).toBe(false);
    });

    it('should auto-detect hot from duration > 0', () => {
      const heal = new HealEffect({
        sourceId: 'src', targetId: 'tgt', magnitude: 100, duration: 2,
      });
      expect(heal.hot).toBe(true);
    });

    it('should apply instant heal', () => {
      const heal = new HealEffect({
        sourceId: 'src', targetId: 'tgt', magnitude: 200,
      });
      const ev = heal.applyInstantHeal(200);
      expect(ev.type).toBe('effect_tick');
      expect(ev.value).toBe(200);
      expect(ev.detail).toBe('instant_heal');
      expect(heal.expired).toBe(true);
    });

    it('should tick HoT effect', () => {
      const heal = new HealEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 150, duration: 3, hot: true,
      });
      const ev = heal.tick();
      expect(ev?.value).toBe(50);
      expect(heal.ticksElapsed).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ShieldEffect
  // ═══════════════════════════════════════════════════════════════════════════

  describe('ShieldEffect', () => {
    it('should create a shield with HP pool', () => {
      const shield = new ShieldEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 500, duration: 5,
      });
      expect(shield.category).toBe(EffectCategory.Shield);
      expect(shield.remainingShield).toBe(500);
      expect(shield.isActive()).toBe(true);
    });

    it('should absorb all damage if shield HP > damage', () => {
      const shield = new ShieldEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 500, duration: 5,
      });
      const result = shield.absorbDamage(200);
      expect(result.absorbed).toBe(200);
      expect(result.passed).toBe(0);
      expect(shield.remainingShield).toBe(300);
      expect(shield.isActive()).toBe(true);
    });

    it('should partially absorb if damage > shield HP', () => {
      const shield = new ShieldEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 100, duration: 5,
      });
      const result = shield.absorbDamage(300);
      expect(result.absorbed).toBe(100);
      expect(result.passed).toBe(200);
      expect(shield.remainingShield).toBe(0);
      expect(shield.expired).toBe(true);
    });

    it('should tick down duration and expire', () => {
      const shield = new ShieldEffect({
        sourceId: 'src', targetId: 'tgt',
        magnitude: 500, duration: 2,
      });
      const ev1 = shield.tick();
      expect(shield.ticksElapsed).toBe(1);
      expect(ev1).toBeNull();

      const ev2 = shield.tick();
      expect(shield.expired).toBe(true);
      expect(ev2?.type).toBe('effect_expired');
    });
  });

  // CC Effect Tests
  describe('CCEffect', () => {
    it('should create a Stun (hard CC)', () => {
      const stun = new CCEffect({
        sourceId: 'src', targetId: 'tgt',
        ccType: CCType.Stun, duration: 2,
      });
      expect(stun.category).toBe(EffectCategory.CC);
      expect(stun.isHardCC()).toBe(true);
      expect(stun.preventsMovement()).toBe(true);
      expect(stun.preventsCasting()).toBe(true);
    });

    it('should create a Snare', () => {
      const snare = new CCEffect({
        sourceId: 'src', targetId: 'tgt',
        ccType: CCType.Snare, duration: 1,
      });
      expect(snare.isHardCC()).toBe(false);
      expect(snare.preventsMovement()).toBe(true);
      expect(snare.preventsCasting()).toBe(false);
    });

    it('should create a Silence', () => {
      const silence = new CCEffect({
        sourceId: 'src', targetId: 'tgt',
        ccType: CCType.Silence, duration: 2,
      });
      expect(silence.isHardCC()).toBe(false);
      expect(silence.preventsCasting()).toBe(true);
      expect(silence.preventsMovement()).toBe(false);
    });

    it('should create a Slow with magnitude', () => {
      const slow = new CCEffect({
        sourceId: 'src', targetId: 'tgt',
        ccType: CCType.Slow, duration: 3, slowAmount: 0.4,
      });
      expect(slow.isHardCC()).toBe(false);
      expect(slow.slowAmount).toBe(0.4);
      expect(slow.magnitude).toBe(0.4);
    });

    it('should create a Knockup (hard CC)', () => {
      const knockup = new CCEffect({
        sourceId: 'src', targetId: 'tgt',
        ccType: CCType.Knockup, duration: 1,
      });
      expect(knockup.isHardCC()).toBe(true);
    });

    it('should tick and expire after duration', () => {
      const stun = new CCEffect({
        sourceId: 'src', targetId: 'tgt',
        ccType: CCType.Stun, duration: 2,
      });
      stun.tick();
      expect(stun.ticksElapsed).toBe(1);
      stun.tick();
      expect(stun.expired).toBe(true);
    });
  });

  // Buff/Debuff Tests
  describe('BuffDebuffEffect', () => {
    it('should create a flat buff', () => {
      const buff = createBuff('AD Buff', 'src', 'tgt', 'atk', 20, 'flat', 3);
      expect(buff.category).toBe(EffectCategory.Buff);
      expect(buff.modifiers[0].stat).toBe('atk');
      expect(buff.modifiers[0].value).toBe(20);
    });

    it('should create a debuff with negative value', () => {
      const debuff = createDebuff('Armor Shred', 'src', 'tgt', 'def', 15, 'flat', 3);
      expect(debuff.category).toBe(EffectCategory.Debuff);
      expect(debuff.modifiers[0].value).toBe(-15);
      expect(debuff.isDebuff).toBe(true);
    });

    it('should support stacking', () => {
      const buff = new BuffDebuffEffect({
        name: 'Conqueror', sourceId: 'src', targetId: 'tgt',
        modifiers: [{ stat: 'atk', type: 'flat', value: 5 }],
        duration: 5, maxStacks: 10,
      });
      expect(buff.stacks).toBe(1);
      buff.addStack();
      expect(buff.stacks).toBe(2);
      for (let i = 0; i < 10; i++) buff.addStack();
      expect(buff.stacks).toBe(10);
    });

    it('should compute effective modifiers with stacks', () => {
      const buff = new BuffDebuffEffect({
        name: 'Stacked', sourceId: 'src', targetId: 'tgt',
        modifiers: [{ stat: 'atk', type: 'flat', value: 10 }],
        duration: 5, maxStacks: 5,
      });
      buff.addStack(); buff.addStack(); // 3 stacks
      const effective = buff.getEffectiveModifiers();
      expect(effective[0].value).toBe(30); // 10 * 3
    });

    it('should remove stacks and expire at 0', () => {
      const buff = new BuffDebuffEffect({
        name: 'Stacking', sourceId: 'src', targetId: 'tgt',
        modifiers: [{ stat: 'atk', type: 'flat', value: 5 }],
        duration: 10, maxStacks: 3, stacks: 3,
      });
      expect(buff.removeStack()).toBe(2);
      expect(buff.removeStack()).toBe(1);
      expect(buff.removeStack()).toBe(0);
      expect(buff.expired).toBe(true);
    });

    it('should tick and expire after duration', () => {
      const buff = createBuff('Quick', 'src', 'tgt', 'atk', 10, 'flat', 2);
      buff.tick();
      buff.tick();
      expect(buff.expired).toBe(true);
    });
  });

  // Execute Tests
  describe('ExecuteEffect', () => {
    it('should create an execute effect', () => {
      const exec = new ExecuteEffect({
        sourceId: 'src', targetId: 'tgt', threshold: 0.3,
      });
      expect(exec.category).toBe(EffectCategory.Execute);
      expect(exec.threshold).toBe(0.3);
      expect(exec.isInstant).toBe(true);
    });

    it('should trigger when HP below threshold', () => {
      const exec = new ExecuteEffect({
        sourceId: 'src', targetId: 'tgt', threshold: 0.3,
      });
      expect(exec.canExecute(250, 1000)).toBe(true);
      expect(exec.canExecute(300, 1000)).toBe(true);
      expect(exec.canExecute(301, 1000)).toBe(false);
    });

    it('should emit execute_triggered on success', () => {
      const exec = new ExecuteEffect({
        sourceId: 'src', targetId: 'tgt', threshold: 0.3,
      });
      const ev = exec.evaluate(200, 1000);
      expect(ev.detail).toBe('execute_triggered');
      expect(ev.value).toBe(200);
      expect(exec.expired).toBe(true);
    });

    it('should emit execute_failed on failure', () => {
      const exec = new ExecuteEffect({
        sourceId: 'src', targetId: 'tgt', threshold: 0.3,
      });
      const ev = exec.evaluate(500, 1000);
      expect(ev.detail).toContain('execute_failed');
      expect(ev.value).toBe(0);
    });
  });

  // EffectManager Tests
  describe('EffectManager', () => {
    it('should start empty', () => {
      expect(manager.size).toBe(0);
      expect(manager.hasEffects()).toBe(false);
    });

    it('should apply and track shield', () => {
      manager.apply(new ShieldEffect({
        sourceId: 'src', targetId: 'champion-1',
        magnitude: 300, duration: 3,
      }));
      expect(manager.shields.length).toBe(1);
    });

    it('should absorb damage through shields', () => {
      manager.apply(new ShieldEffect({
        sourceId: 'src', targetId: 'champion-1',
        magnitude: 200, duration: 5,
      }));
      const result = manager.absorbWithShields(150);
      expect(result.totalAbsorbed).toBe(150);
      expect(result.finalDamage).toBe(0);
    });

    it('should pass damage beyond shields', () => {
      manager.apply(new ShieldEffect({
        sourceId: 'src', targetId: 'champion-1',
        magnitude: 100, duration: 5,
      }));
      const result = manager.absorbWithShields(300);
      expect(result.totalAbsorbed).toBe(100);
      expect(result.finalDamage).toBe(200);
    });

    it('should report canAct=false when stunned', () => {
      manager.apply(new CCEffect({
        sourceId: 'src', targetId: 'champion-1',
        ccType: CCType.Stun, duration: 2,
      }));
      expect(manager.canAct()).toBe(false);
      expect(manager.canCast()).toBe(false);
      expect(manager.canMove()).toBe(false);
      expect(manager.isHardCCd()).toBe(true);
    });

    it('should report canAct=true when snared', () => {
      manager.apply(new CCEffect({
        sourceId: 'src', targetId: 'champion-1',
        ccType: CCType.Snare, duration: 2,
      }));
      expect(manager.canAct()).toBe(true);
      expect(manager.canMove()).toBe(false);
    });

    it('should compute speed multiplier from slows', () => {
      manager.apply(new CCEffect({
        sourceId: 's1', targetId: 'champion-1',
        ccType: CCType.Slow, duration: 2, slowAmount: 0.3,
      }));
      manager.apply(new CCEffect({
        sourceId: 's2', targetId: 'champion-1',
        ccType: CCType.Slow, duration: 2, slowAmount: 0.2,
      }));
      expect(manager.getSpeedMultiplier()).toBeCloseTo(0.5, 2);
    });

    it('should apply flat stat modifiers', () => {
      manager.apply(createBuff('AD', 'src', 'champion-1', 'atk', 20, 'flat', 5));
      expect(manager.modifyStat('atk', 60)).toBe(80);
    });

    it('should apply percent modifiers', () => {
      manager.apply(new BuffDebuffEffect({
        name: 'Speed', sourceId: 'src', targetId: 'champion-1',
        modifiers: [{ stat: 'spd', type: 'percent', value: 0.25 }],
        duration: 3,
      }));
      expect(manager.modifyStat('spd', 4)).toBe(5);
    });

    it('should stack same-name buffs', () => {
      const mk = () => new BuffDebuffEffect({
        name: 'Conqueror', sourceId: 'src', targetId: 'champion-1',
        modifiers: [{ stat: 'atk', type: 'flat', value: 5 }],
        duration: 5, maxStacks: 10,
      });
      manager.apply(mk());
      manager.apply(mk());
      manager.apply(mk());
      expect(manager.buffDebuffs[0].stacks).toBe(3);
      expect(manager.modifyStat('atk', 60)).toBe(75);
    });

    it('should tick duration effects', () => {
      manager.apply(new DamageEffect({
        sourceId: 'src', targetId: 'champion-1',
        magnitude: 90, damageType: DamageType.AP, duration: 3,
      }));
      const events = manager.tickAll();
      expect(events.length).toBe(1);
    });

    it('should auto-expire CC after duration', () => {
      manager.apply(new CCEffect({
        sourceId: 'src', targetId: 'champion-1',
        ccType: CCType.Stun, duration: 2,
      }));
      manager.tickAll();
      expect(manager.ccEffects.length).toBe(1);
      manager.tickAll();
      expect(manager.ccEffects.length).toBe(0);
      expect(manager.canAct()).toBe(true);
    });

    it('should remove by ID', () => {
      const buff = createBuff('B', 'src', 'champion-1', 'atk', 10, 'flat', 5);
      manager.apply(buff);
      expect(manager.remove(buff.id)).toBe(true);
      expect(manager.hasEffects()).toBe(false);
    });

    it('should remove by source', () => {
      manager.apply(createBuff('B1', 'a', 'champion-1', 'atk', 10, 'flat', 5));
      manager.apply(createBuff('B2', 'b', 'champion-1', 'def', 10, 'flat', 5));
      manager.apply(createBuff('B3', 'a', 'champion-1', 'ap', 10, 'flat', 5));
      expect(manager.removeBySource('a')).toBe(2);
      expect(manager.size).toBe(1);
    });

    it('should clear all', () => {
      manager.apply(createBuff('B1', 's', 'champion-1', 'atk', 10, 'flat', 5));
      manager.clear();
      expect(manager.size).toBe(0);
    });

    it('should emit events', () => {
      const events: EffectEvent[] = [];
      manager.on((e) => events.push(e));
      const dot = new DamageEffect({
        sourceId: 'src', targetId: 'champion-1',
        magnitude: 90, damageType: DamageType.True, duration: 2,
      });
      manager.apply(dot);
      expect(events.filter(e => e.type === 'effect_applied').length).toBe(1);
      manager.tickAll();
      expect(events.filter(e => e.type === 'effect_tick').length).toBe(1);
    });
  });

  // Integration
  describe('Integration', () => {
    it('stun expires → canAct restored', () => {
      manager.apply(new CCEffect({
        sourceId: 'enemy', targetId: 'champion-1',
        ccType: CCType.Stun, duration: 2,
      }));
      expect(manager.canAct()).toBe(false);
      manager.tickAll();
      manager.tickAll();
      expect(manager.canAct()).toBe(true);
    });

    it('shield breaks then damage passes', () => {
      manager.apply(new ShieldEffect({
        sourceId: 'ally', targetId: 'champion-1',
        magnitude: 200, duration: 10,
      }));
      expect(manager.absorbWithShields(150).finalDamage).toBe(0);
      const r = manager.absorbWithShields(100);
      expect(r.totalAbsorbed).toBe(50);
      expect(r.finalDamage).toBe(50);
    });

    it('flat + percent buffs on same stat', () => {
      manager.apply(createBuff('Flat', 's1', 'champion-1', 'atk', 20, 'flat', 5));
      manager.apply(new BuffDebuffEffect({
        name: 'Percent', sourceId: 's2', targetId: 'champion-1',
        modifiers: [{ stat: 'atk', type: 'percent', value: 0.10 }],
        duration: 3,
      }));
      expect(manager.modifyStat('atk', 60)).toBe(88);
    });
  });
});
