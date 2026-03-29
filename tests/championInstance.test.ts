import { describe, it, expect, beforeEach } from 'vitest';
import { ChampionInstance, SPELL_SLOTS } from '../src/game/ChampionInstance';
import type { Champion, ChampionStats, Spell, Passive } from '../src/types';

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

describe('ChampionInstance', () => {
  let champ: ChampionInstance;
  let fixture: Champion;

  beforeEach(() => {
    fixture = makeTestChampion();
    champ = new ChampionInstance(fixture);
  });

  describe('constructor', () => {
    it('should default to level 1', () => {
      expect(champ.level).toBe(1);
    });
    it('should accept a custom starting level', () => {
      expect(new ChampionInstance(fixture, 10).level).toBe(10);
    });
    it('should clamp starting level between 1 and 18', () => {
      expect(new ChampionInstance(fixture, -5).level).toBe(1);
      expect(new ChampionInstance(fixture, 99).level).toBe(18);
    });
    it('should copy base data from the Champion definition', () => {
      expect(champ.id).toBe(fixture.id);
      expect(champ.key).toBe(fixture.key);
      expect(champ.name).toBe(fixture.name);
      expect(champ.title).toBe(fixture.title);
      expect(champ.tags).toEqual(fixture.tags);
      expect(champ.resourceType).toBe(fixture.resourceType);
      expect(champ.iconUrl).toBe(fixture.iconUrl);
      expect(champ.passive.name).toBe(fixture.passive.name);
    });
    it('should not share arrays/objects with the original (immutability)', () => {
      const c = new ChampionInstance(fixture);
      expect(c.tags).not.toBe(fixture.tags);
      expect(c.baseStats).not.toBe(fixture.stats);
      expect(c.passive).not.toBe(fixture.passive);
      fixture.tags.push('Tank' as never);
      expect(c.tags).not.toContain('Tank');
    });
    it('should map spells to Q/W/E/R slots', () => {
      expect(champ.getSpell('Q')?.id).toBe('TestQ');
      expect(champ.getSpell('W')?.id).toBe('TestW');
      expect(champ.getSpell('E')?.id).toBe('TestE');
      expect(champ.getSpell('R')?.id).toBe('TestR');
    });
    it('should have all 4 spell slots for a 4-spell champion', () => {
      for (const slot of SPELL_SLOTS) {
        expect(champ.getSpell(slot)).toBeDefined();
      }
    });
    it('should handle fewer than 4 spells gracefully', () => {
      const minimal = makeTestChampion({ spells: [fixture.spells[0]] });
      const c = new ChampionInstance(minimal);
      expect(c.getSpell('Q')).toBeDefined();
      expect(c.getSpell('W')).toBeUndefined();
      expect(c.getSpell('E')).toBeUndefined();
      expect(c.getSpell('R')).toBeUndefined();
    });
  });

  describe('levelUp()', () => {
    it('should increment level by 1', () => {
      expect(champ.level).toBe(1);
      champ.levelUp();
      expect(champ.level).toBe(2);
      champ.levelUp();
      expect(champ.level).toBe(3);
    });
    it('should return the new level', () => {
      expect(champ.levelUp()).toBe(2);
    });
    it('should cap at 18', () => {
      const c = new ChampionInstance(fixture, 18);
      expect(c.levelUp()).toBe(18);
      expect(c.level).toBe(18);
    });
    it('should report canLevelUp correctly', () => {
      const c = new ChampionInstance(fixture, 17);
      expect(c.canLevelUp).toBe(true);
      c.levelUp();
      expect(c.canLevelUp).toBe(false);
    });
  });

  describe('setLevel()', () => {
    it('should set the level directly', () => {
      champ.setLevel(10);
      expect(champ.level).toBe(10);
    });
    it('should clamp the level to 1-18', () => {
      champ.setLevel(0);
      expect(champ.level).toBe(1);
      champ.setLevel(100);
      expect(champ.level).toBe(18);
    });
    it('should floor fractional levels', () => {
      champ.setLevel(7.8);
      expect(champ.level).toBe(7);
    });
  });

  describe('getStats()', () => {
    it('should return base stats at level 1', () => {
      const stats = champ.getStats();
      expect(stats.hp).toBeCloseTo(fixture.stats.hp, 1);
      expect(stats.mp).toBeCloseTo(fixture.stats.mp, 1);
      expect(stats.armor).toBeCloseTo(fixture.stats.armor, 1);
      expect(stats.attackDamage).toBeCloseTo(fixture.stats.attackDamage, 1);
    });
    it('should increase stats when leveling up', () => {
      const stats1 = champ.getStats();
      champ.setLevel(2);
      const stats2 = champ.getStats();
      expect(stats2.hp).toBeGreaterThan(stats1.hp);
      expect(stats2.armor).toBeGreaterThan(stats1.armor);
      expect(stats2.attackDamage).toBeGreaterThan(stats1.attackDamage);
    });
    it('should return higher stats at level 18 vs level 1', () => {
      const lvl1 = champ.getStats();
      champ.setLevel(18);
      const lvl18 = champ.getStats();
      expect(lvl18.hp).toBeGreaterThan(lvl1.hp);
      expect(lvl18.armor).toBeGreaterThan(lvl1.armor);
      expect(lvl18.attackDamage).toBeGreaterThan(lvl1.attackDamage);
      expect(lvl18.attackSpeed).toBeGreaterThan(lvl1.attackSpeed);
    });
    it('should keep moveSpeed constant across levels', () => {
      champ.setLevel(18);
      expect(champ.getStats().moveSpeed).toBe(champ.getStatsAtLevel(1).moveSpeed);
    });
    it('should keep attackRange constant across levels', () => {
      champ.setLevel(18);
      expect(champ.getStats().attackRange).toBe(champ.getStatsAtLevel(1).attackRange);
    });
  });

  describe('getStatsAtLevel()', () => {
    it('should compute stats at any level without changing current level', () => {
      champ.setLevel(1);
      const stats10 = champ.getStatsAtLevel(10);
      expect(champ.level).toBe(1);
      expect(stats10.hp).toBeGreaterThan(champ.getStats().hp);
    });
  });

  describe('spells', () => {
    it('should return a readonly map of all spell slots', () => {
      expect(champ.spells.Q?.id).toBe('TestQ');
      expect(champ.spells.W?.id).toBe('TestW');
      expect(champ.spells.E?.id).toBe('TestE');
      expect(champ.spells.R?.id).toBe('TestR');
    });
    it('should return undefined for missing spell slots', () => {
      const minimal = makeTestChampion({ spells: [fixture.spells[0]] });
      const c = new ChampionInstance(minimal);
      expect(c.getSpell('W')).toBeUndefined();
    });
    it('should provide spell details', () => {
      const q = champ.getSpell('Q')!;
      expect(q.cooldown).toEqual([8, 7.5, 7, 6.5, 6]);
      expect(q.cost).toEqual([50, 55, 60, 65, 70]);
      expect(q.maxRank).toBe(5);
    });
  });

  describe('getPassive()', () => {
    it('should return the passive data', () => {
      const p = champ.getPassive();
      expect(p.name).toBe('Test Passive');
      expect(p.description).toBe('Desc');
    });
  });

  describe('toSnapshot()', () => {
    it('should return a serializable snapshot', () => {
      champ.setLevel(6);
      const snap = champ.toSnapshot();
      expect(snap.id).toBe('TestChampion');
      expect(snap.level).toBe(6);
      expect(snap.tags).toEqual(['Mage', 'Assassin']);
      expect(snap.stats).toBeDefined();
      expect(snap.spellIds).toEqual({ Q: 'TestQ', W: 'TestW', E: 'TestE', R: 'TestR' });
      expect(snap.passiveName).toBe('Test Passive');
    });
    it('should not be affected by later mutations', () => {
      const snap = champ.toSnapshot();
      champ.levelUp();
      expect(snap.level).toBe(1);
      expect(champ.level).toBe(2);
    });
  });
});
