/**
 * Ability Parser — tests for enriched spell/passive data structure.
 *
 * Validates that all 172 champions have properly structured:
 *  - 4 spells (Q/W/E/R) with targeting, scaling, effects
 *  - 1 passive with targeting, scaling, effects
 */

import { describe, expect, it } from 'vitest';
import championsRaw from '../public/lol/data/champions-parsed.json';
import type { Champion } from '../src/types';

const champions = championsRaw as Champion[];

const VALID_TARGETINGS = ['self', 'ally', 'enemy', 'area', 'passive'];
const VALID_EFFECT_TYPES = ['damage', 'heal', 'shield', 'cc', 'buff', 'debuff', 'execute'];
const VALID_DAMAGE_TYPES = ['physical', 'magical', 'true'];
const VALID_CC_TYPES = ['stun', 'snare', 'slow', 'silence', 'knockup', 'charm'];

describe('Ability Parser — champions-parsed.json structure', () => {
  it('should have exactly 172 champions', () => {
    expect(champions.length).toBe(172);
  });

  describe('Spell structure', () => {
    it('every champion should have exactly 4 spells', () => {
      for (const champ of champions) {
        expect(champ.spells.length).toBe(4);
      }
    });

    it('each spell should have targeting, scaling, effects', () => {
      for (const champ of champions) {
        for (const spell of champ.spells) {
          expect(spell.targeting).toBeDefined();
          expect(VALID_TARGETINGS).toContain(spell.targeting);
          expect(spell.scaling).toBeDefined();
          expect(typeof spell.scaling.adRatio).toBe('number');
          expect(typeof spell.scaling.apRatio).toBe('number');
          expect(Array.isArray(spell.effects)).toBe(true);
        }
      }
    });

    it('each spell should have cooldown, cost, range arrays', () => {
      for (const champ of champions) {
        for (const spell of champ.spells) {
          expect(Array.isArray(spell.cooldown)).toBe(true);
          expect(spell.cooldown.length).toBeGreaterThan(0);
          expect(Array.isArray(spell.cost)).toBe(true);
          expect(spell.cost.length).toBeGreaterThan(0);
          expect(Array.isArray(spell.range)).toBe(true);
          expect(spell.range.length).toBeGreaterThan(0);
        }
      }
    });

    it('effect types should be valid', () => {
      for (const champ of champions) {
        for (const spell of champ.spells) {
          for (const effect of spell.effects) {
            expect(VALID_EFFECT_TYPES).toContain(effect.type);
          }
        }
      }
    });

    it('damage effects should have valid damageType', () => {
      for (const champ of champions) {
        for (const spell of champ.spells) {
          for (const effect of spell.effects) {
            if (effect.type === 'damage') {
              expect(VALID_DAMAGE_TYPES).toContain(effect.damageType);
            }
          }
        }
      }
    });

    it('cc effects should have valid ccType', () => {
      for (const champ of champions) {
        for (const spell of champ.spells) {
          for (const effect of spell.effects) {
            if (effect.type === 'cc') {
              expect(VALID_CC_TYPES).toContain(effect.ccType);
            }
          }
        }
      }
    });

    it('scaling ratios should be non-negative', () => {
      for (const champ of champions) {
        for (const spell of champ.spells) {
          expect(spell.scaling.adRatio).toBeGreaterThanOrEqual(0);
          expect(spell.scaling.apRatio).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('Passive structure', () => {
    it('every champion should have a passive', () => {
      for (const champ of champions) {
        expect(champ.passive).toBeDefined();
        expect(champ.passive.name).toBeTruthy();
        expect(champ.passive.description).toBeTruthy();
      }
    });

    it('each passive should have targeting, scaling, effects', () => {
      for (const champ of champions) {
        expect(champ.passive.targeting).toBeDefined();
        expect(VALID_TARGETINGS).toContain(champ.passive.targeting);
        expect(champ.passive.scaling).toBeDefined();
        expect(typeof champ.passive.scaling.adRatio).toBe('number');
        expect(typeof champ.passive.scaling.apRatio).toBe('number');
        expect(Array.isArray(champ.passive.effects)).toBe(true);
      }
    });
  });

  describe('Specific champion data (enriched)', () => {
    const ahri = champions.find((c) => c.id === 'Ahri')!;
    const aatrox = champions.find((c) => c.id === 'Aatrox')!;
    const akali = champions.find((c) => c.id === 'Akali')!;
    const lux = champions.find((c) => c.id === 'Lux')!;

    it('Ahri Q should be enemy targeting with AP scaling and 1 damage effect', () => {
      const q = ahri.spells[0];
      expect(q.targeting).toBe('enemy');
      expect(q.scaling.apRatio).toBeGreaterThan(0);
      expect(q.scaling.adRatio).toBe(0);
      expect(q.effects.length).toBeGreaterThanOrEqual(1);
      expect(q.effects[0].type).toBe('damage');
      expect(q.effects[0].damageType).toBe('magical');
    });

    it('Ahri E should have charm CC effect', () => {
      const e = ahri.spells[2];
      const ccEffect = e.effects.find((eff) => eff.type === 'cc');
      expect(ccEffect).toBeDefined();
      expect(ccEffect!.ccType).toBe('charm');
    });

    it('Aatrox Q should be area targeting with AD scaling and physical damage', () => {
      const q = aatrox.spells[0];
      expect(q.targeting).toBe('area');
      expect(q.scaling.adRatio).toBeGreaterThan(0);
      expect(q.effects[0].type).toBe('damage');
      expect(q.effects[0].damageType).toBe('physical');
    });

    it('Akali Q should have both AD and AP scaling', () => {
      const q = akali.spells[0];
      expect(q.scaling.adRatio).toBeGreaterThan(0);
      expect(q.scaling.apRatio).toBeGreaterThan(0);
    });

    it('Akali R should have execute effect', () => {
      const r = akali.spells[3];
      const execEffect = r.effects.find((eff) => eff.type === 'execute');
      expect(execEffect).toBeDefined();
      expect(execEffect!.threshold).toBeGreaterThan(0);
    });

    it('Lux R should have high AP ratio (1.0)', () => {
      const r = lux.spells[3];
      expect(r.scaling.apRatio).toBe(1.0);
      expect(r.effects[0].damageType).toBe('magical');
    });

    it('Lux Q should have snare CC', () => {
      const q = lux.spells[0];
      const ccEffect = q.effects.find((eff) => eff.type === 'cc');
      expect(ccEffect).toBeDefined();
      expect(ccEffect!.ccType).toBe('snare');
    });

    it('Ahri passive should be self-targeted heal', () => {
      expect(ahri.passive.targeting).toBe('self');
      const healEffect = ahri.passive.effects.find((eff) => eff.type === 'heal');
      expect(healEffect).toBeDefined();
    });
  });
});
