/**
 * Champions data sourced from League of Legends API or static data.
 * Each champion has an id, name, title, tags, and stats.
 */

export interface ChampionData {
  id: string;
  name: string;
  title: string;
  tags: string[];
  stats: {
    hp: number;
    mp: number;
    armor: number;
    spellBlock: number;
    attackDamage: number;
    attackSpeed: number;
    moveSpeed: number;
  };
}

export const champions: ChampionData[] = [
  {
    id: 'Ahri',
    name: 'Ahri',
    title: 'the Nine-Tailed Fox',
    tags: ['Mage', 'Assassin'],
    stats: {
      hp: 526,
      mp: 418,
      armor: 21,
      spellBlock: 30,
      attackDamage: 53,
      attackSpeed: 0.668,
      moveSpeed: 330,
    },
  },
  {
    id: 'Darius',
    name: 'Darius',
    title: 'the Hand of Noxus',
    tags: ['Fighter', 'Tank'],
    stats: {
      hp: 582,
      mp: 263,
      armor: 39,
      spellBlock: 32,
      attackDamage: 64,
      attackSpeed: 0.625,
      moveSpeed: 340,
    },
  },
  {
    id: 'Jinx',
    name: 'Jinx',
    title: 'the Loose Cannon',
    tags: ['Marksman'],
    stats: {
      hp: 510,
      mp: 245,
      armor: 26,
      spellBlock: 30,
      attackDamage: 59,
      attackSpeed: 0.625,
      moveSpeed: 325,
    },
  },
  {
    id: 'Lux',
    name: 'Lux',
    title: 'the Lady of Luminosity',
    tags: ['Mage', 'Support'],
    stats: {
      hp: 490,
      mp: 480,
      armor: 19,
      spellBlock: 30,
      attackDamage: 54,
      attackSpeed: 0.625,
      moveSpeed: 330,
    },
  },
  {
    id: 'Garen',
    name: 'Garen',
    title: 'The Might of Demacia',
    tags: ['Fighter', 'Tank'],
    stats: {
      hp: 620,
      mp: 0,
      armor: 36,
      spellBlock: 32,
      attackDamage: 66,
      attackSpeed: 0.625,
      moveSpeed: 340,
    },
  },
  {
    id: 'Yasuo',
    name: 'Yasuo',
    title: 'the Unforgiven',
    tags: ['Fighter', 'Assassin'],
    stats: {
      hp: 490,
      mp: 0,
      armor: 30,
      spellBlock: 32,
      attackDamage: 60,
      attackSpeed: 0.697,
      moveSpeed: 345,
    },
  },
];
