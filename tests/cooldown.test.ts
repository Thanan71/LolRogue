import { beforeEach, describe, expect, it } from 'vitest';
import { ChampionInstance, SPELL_SLOTS } from '../src/game/ChampionInstance';
import type { Champion, ChampionStats, Passive, Spell } from '../src/types';

function makeTestChampion(overrides: Partial<Champion> = {}): Champion {
  const baseStats: ChampionStats = {
    hp: 500,
    mp: 300,
    moveSpeed: 330,
    armor: 30,
    magicResist: 30,
    attackDamage: 60,
    attackSpeed: 0.65,
    attackRange: 175,
    hpPerLevel: 90,
    mpPerLevel: 40,
    armorPerLevel: 4,
    magicResistPerLevel: 1.3,
    attackDamagePerLevel: 3,
    attackSpeedPerLevel: 2.5,
    hpRegen: 7,
    hpRegenPerLevel: 0.7,
    mpRegen: 8,
    mpRegenPerLevel: 0.8,
    crit: 0,
    critPerLevel: 0,
  };
  const makeSpell = (slot: string, cooldown?: number[]): Spell => ({
    id: `Test${slot}`,
    name: `Test Spell ${slot}`,
    description: `Desc ${slot}`,
    maxRank: 5,
    cooldown: cooldown ?? [8, 7.5, 7, 6.5, 6],
    cost: [50, 55, 60, 65, 70],
    range: [700, 700, 700, 700, 700],
    image: `Test${slot}.png`,
    targeting: 'enemy' as any,
    scaling: { adRatio: 0.5, apRatio: 0.0 },
    effects: [
      {
        type: 'damage',
        damageType: 'physical',
        adRatio: 0.5,
        apRatio: 0.0,
        baseDamage: [50, 75, 100, 125, 150],
      },
    ],
  });
  const passive: Passive = {
    name: 'Test Passive',
    description: 'Desc',
    image: 'TestPassive.png',
    targeting: 'passive' as any,
    scaling: { adRatio: 0.0, apRatio: 0.0 },
    effects: [],
  };
  const defaults: Champion = {
    id: 'TestChampion',
    key: '9999',
    name: 'Test Champion',
    title: 'the Tester',
    tags: ['Mage', 'Assassin'],
    resourceType: 'Mana',
    stats: baseStats,
    spells: [makeSpell('Q'), makeSpell('W'), makeSpell('E'), makeSpell('R')],
    passive,
    iconUrl: '/data/lol/img/champions/TestChampion.png',
  };
  return { ...defaults, ...overrides };
}

describe('Cooldown System', () => {
  let champ: ChampionInstance;

  beforeEach(() => {
    champ = new ChampionInstance(makeTestChampion());
  });

  describe('initial state', () => {
    it('all spells should be ready (cooldown 0) at battle start', () => {
      for (const slot of SPELL_SLOTS) {
        expect(champ.isSpellReady(slot)).toBe(true);
        expect(champ.getCooldown(slot)).toBe(0);
      }
    });

    it('getMaxCooldown returns the base cooldown at rank 1', () => {
      expect(champ.getMaxCooldown('Q')).toBe(8);
      expect(champ.getMaxCooldown('W')).toBe(8);
      expect(champ.getMaxCooldown('E')).toBe(8);
      expect(champ.getMaxCooldown('R')).toBe(8);
    });
  });

  describe('useSpell', () => {
    it('should set cooldown when a spell is used', () => {
      const result = champ.useSpell('Q');
      expect(result).toBe(true);
      expect(champ.getCooldown('Q')).toBe(8);
      expect(champ.isSpellReady('Q')).toBe(false);
    });

    it('should use the cooldown at the current spell rank', () => {
      champ.setSpellRank('Q', 3);

      expect(champ.getMaxCooldown('Q')).toBe(7);
      expect(champ.useSpell('Q')).toBe(true);
      expect(champ.getCooldown('Q')).toBe(7);
    });

    it('should fail if spell is already on cooldown', () => {
      champ.useSpell('Q');
      const result = champ.useSpell('Q');
      expect(result).toBe(false);
      expect(champ.getCooldown('Q')).toBe(8); // unchanged
    });

    it('should set different cooldowns for different spells', () => {
      const fixture = makeTestChampion({
        spells: [
          {
            id: 'Q',
            name: 'Q',
            description: '',
            maxRank: 5,
            cooldown: [10, 9, 8, 7, 6],
            cost: [50],
            range: [0],
            image: '',
            targeting: 'enemy' as any,
            scaling: { adRatio: 0, apRatio: 0 },
            effects: [],
          },
          {
            id: 'W',
            name: 'W',
            description: '',
            maxRank: 5,
            cooldown: [14, 13, 12, 11, 10],
            cost: [60],
            range: [0],
            image: '',
            targeting: 'enemy' as any,
            scaling: { adRatio: 0, apRatio: 0 },
            effects: [],
          },
          {
            id: 'E',
            name: 'E',
            description: '',
            maxRank: 5,
            cooldown: [20, 18, 16, 14, 12],
            cost: [70],
            range: [0],
            image: '',
            targeting: 'enemy' as any,
            scaling: { adRatio: 0, apRatio: 0 },
            effects: [],
          },
          {
            id: 'R',
            name: 'R',
            description: '',
            maxRank: 3,
            cooldown: [120, 100, 80],
            cost: [100],
            range: [0],
            image: '',
            targeting: 'enemy' as any,
            scaling: { adRatio: 0, apRatio: 0 },
            effects: [],
          },
        ],
      });
      const c = new ChampionInstance(fixture);

      c.useSpell('Q');
      expect(c.getCooldown('Q')).toBe(10);

      c.useSpell('W');
      expect(c.getCooldown('W')).toBe(14);

      c.useSpell('E');
      expect(c.getCooldown('E')).toBe(20);

      c.useSpell('R');
      expect(c.getCooldown('R')).toBe(120);
    });
  });

  describe('tickCooldowns', () => {
    it('should decrement all cooldowns by 1', () => {
      champ.useSpell('Q'); // cd = 8
      champ.useSpell('R'); // cd = 8
      expect(champ.getCooldown('Q')).toBe(8);

      champ.tickCooldowns();
      expect(champ.getCooldown('Q')).toBe(7);
      expect(champ.getCooldown('R')).toBe(7);
      expect(champ.isSpellReady('W')).toBe(true); // W was never used
    });

    it('should not go below 0', () => {
      champ.useSpell('Q'); // cd = 8
      for (let i = 0; i < 10; i++) {
        champ.tickCooldowns();
      }
      expect(champ.getCooldown('Q')).toBe(0);
      expect(champ.isSpellReady('Q')).toBe(true);
    });

    it('should not affect unused spells', () => {
      champ.tickCooldowns();
      for (const slot of SPELL_SLOTS) {
        expect(champ.getCooldown(slot)).toBe(0);
        expect(champ.isSpellReady(slot)).toBe(true);
      }
    });
  });

  describe('resetCooldowns', () => {
    it('should reset all cooldowns to 0', () => {
      champ.useSpell('Q');
      champ.useSpell('W');
      champ.useSpell('E');
      champ.useSpell('R');

      expect(champ.isSpellReady('Q')).toBe(false);
      expect(champ.isSpellReady('R')).toBe(false);

      champ.resetCooldowns();

      for (const slot of SPELL_SLOTS) {
        expect(champ.getCooldown(slot)).toBe(0);
        expect(champ.isSpellReady(slot)).toBe(true);
      }
    });
  });

  describe('full cooldown cycle', () => {
    it('should simulate a typical combat cooldown flow', () => {
      // Round 1: Use Q and W
      champ.useSpell('Q'); // cd = 8
      champ.useSpell('W'); // cd = 8
      expect(champ.isSpellReady('Q')).toBe(false);
      expect(champ.isSpellReady('E')).toBe(true);

      // End of round 1: tick cooldowns
      champ.tickCooldowns();
      expect(champ.getCooldown('Q')).toBe(7);
      expect(champ.getCooldown('W')).toBe(7);

      // Round 2: Use E (Q, W still on cd)
      champ.useSpell('E'); // cd = 8
      champ.tickCooldowns();
      expect(champ.getCooldown('Q')).toBe(6);
      expect(champ.getCooldown('W')).toBe(6);
      expect(champ.getCooldown('E')).toBe(7);

      // After enough ticks, Q/W (cd 8) should be ready
      // Q/W were used in round 1, ticked twice so far (cd=6), need 6 more
      for (let i = 0; i < 6; i++) {
        champ.tickCooldowns();
      }
      expect(champ.isSpellReady('Q')).toBe(true);
      expect(champ.isSpellReady('W')).toBe(true);
      // E was used in round 2 (after 2 ticks), ticked 7 times so far (cd=1)
      expect(champ.isSpellReady('E')).toBe(false);
      // One more tick makes E ready
      champ.tickCooldowns();
      expect(champ.isSpellReady('E')).toBe(true);

      // Use Q again
      const result = champ.useSpell('Q');
      expect(result).toBe(true);
      expect(champ.getCooldown('Q')).toBe(8);

      // End of combat: reset
      champ.resetCooldowns();
      for (const slot of SPELL_SLOTS) {
        expect(champ.isSpellReady(slot)).toBe(true);
      }
    });
  });

  describe('snapshot includes cooldowns', () => {
    it('should include cooldowns in the snapshot', () => {
      champ.useSpell('Q');
      champ.useSpell('R');
      const snap = champ.toSnapshot();
      expect(snap.cooldowns).toEqual({ Q: 8, W: 0, E: 0, R: 8 });
    });
  });
});
