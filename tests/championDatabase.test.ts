import { beforeAll, describe, expect, it } from 'vitest';
import { ChampionDatabase, championDB } from '../src/data/championDatabase';
import type { Champion } from '../src/types';

const FIXTURES: Champion[] = [
  {
    id: 'Ahri',
    key: '103',
    name: 'Ahri',
    title: 'Renarde a neuf queues',
    tags: ['Mage', 'Assassin'],
    resourceType: 'Mana',
    stats: {
      hp: 590,
      mp: 418,
      moveSpeed: 330,
      armor: 21,
      magicResist: 30,
      attackDamage: 53,
      attackSpeed: 0.668,
      attackRange: 550,
      hpPerLevel: 104,
      mpPerLevel: 25,
      armorPerLevel: 4.2,
      magicResistPerLevel: 1.3,
      attackDamagePerLevel: 0,
      attackSpeedPerLevel: 2.2,
      hpRegen: 2.5,
      hpRegenPerLevel: 0.6,
      mpRegen: 8,
      mpRegenPerLevel: 0.8,
      crit: 0,
      critPerLevel: 0,
    },
    spells: [],
    passive: {
      name: '',
      description: '',
      image: '',
      targeting: 'passive' as any,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [],
    },
    iconUrl: '/data/lol/img/champions/Ahri.png',
  },
  {
    id: 'Darius',
    key: '122',
    name: 'Darius',
    title: 'the Hand of Noxus',
    tags: ['Fighter', 'Tank'],
    resourceType: 'Mana',
    stats: {
      hp: 650,
      mp: 0,
      moveSpeed: 340,
      armor: 39,
      magicResist: 32,
      attackDamage: 64,
      attackSpeed: 0.625,
      attackRange: 175,
      hpPerLevel: 120,
      mpPerLevel: 0,
      armorPerLevel: 5.2,
      magicResistPerLevel: 2.05,
      attackDamagePerLevel: 5,
      attackSpeedPerLevel: 1,
      hpRegen: 3,
      hpRegenPerLevel: 0.5,
      mpRegen: 0,
      mpRegenPerLevel: 0,
      crit: 0,
      critPerLevel: 0,
    },
    spells: [],
    passive: {
      name: '',
      description: '',
      image: '',
      targeting: 'passive' as any,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [],
    },
    iconUrl: '/data/lol/img/champions/Darius.png',
  },
  {
    id: 'Jinx',
    key: '222',
    name: 'Jinx',
    title: 'the Loose Cannon',
    tags: ['Marksman'],
    resourceType: 'Mana',
    stats: {
      hp: 510,
      mp: 245,
      moveSpeed: 325,
      armor: 26,
      magicResist: 30,
      attackDamage: 59,
      attackSpeed: 0.625,
      attackRange: 525,
      hpPerLevel: 100,
      mpPerLevel: 30,
      armorPerLevel: 4.7,
      magicResistPerLevel: 1.3,
      attackDamagePerLevel: 0,
      attackSpeedPerLevel: 1,
      hpRegen: 3.75,
      hpRegenPerLevel: 0.5,
      mpRegen: 6.7,
      mpRegenPerLevel: 0.4,
      crit: 0,
      critPerLevel: 0,
    },
    spells: [],
    passive: {
      name: '',
      description: '',
      image: '',
      targeting: 'passive' as any,
      scaling: { adRatio: 0, apRatio: 0 },
      effects: [],
    },
    iconUrl: '/data/lol/img/champions/Jinx.png',
  },
];

describe('ChampionDatabase (fixtures)', () => {
  let db: ChampionDatabase;

  beforeAll(() => {
    db = new ChampionDatabase(FIXTURES);
  });

  // --- Basic Queries ---

  it('should return correct count', () => {
    expect(db.count()).toBe(3);
  });

  it('getAll should return all champions', () => {
    expect(db.getAll().length).toBe(3);
  });

  it('getAll should return a defensive copy', () => {
    const all = db.getAll();
    all.pop();
    expect(db.count()).toBe(3);
  });

  // --- getById ---

  it('getById should find champion by id', () => {
    expect(db.getById('Ahri')).toBeDefined();
    expect(db.getById('Ahri')!.name).toBe('Ahri');
  });

  it('getById should be case-insensitive', () => {
    expect(db.getById('ahri')).toBeDefined();
    expect(db.getById('DARIUS')!.id).toBe('Darius');
  });

  it('getById should return undefined for missing', () => {
    expect(db.getById('NonExistent')).toBeUndefined();
  });

  // --- getByKey ---

  it('getByKey should find by numeric key', () => {
    expect(db.getByKey('103')!.name).toBe('Ahri');
    expect(db.getByKey('222')!.name).toBe('Jinx');
  });

  it('getByKey should return undefined for missing key', () => {
    expect(db.getByKey('999')).toBeUndefined();
  });

  // --- getByTag ---

  it('getByTag should return champions with that tag', () => {
    const mages = db.getByTag('Mage');
    expect(mages.length).toBe(1);
    expect(mages[0].id).toBe('Ahri');
  });

  it('getByTag for Fighter should return Darius', () => {
    const fighters = db.getByTag('Fighter');
    expect(fighters.length).toBe(1);
    expect(fighters[0].id).toBe('Darius');
  });

  it('getByTag for non-existent tag should return empty', () => {
    expect(db.getByTag('Support').length).toBe(0);
  });

  // --- getByResourceType ---

  it('getByResourceType should return Mana champs', () => {
    expect(db.getByResourceType('Mana').length).toBe(3);
  });

  // --- Index Introspection ---

  it('getAllTags should return sorted distinct tags', () => {
    expect(db.getAllTags()).toEqual(['Assassin', 'Fighter', 'Mage', 'Marksman', 'Tank']);
  });

  it('getTagCounts should return correct counts', () => {
    const counts = db.getTagCounts();
    expect(counts['Mage']).toBe(1);
    expect(counts['Fighter']).toBe(1);
    expect(counts['Marksman']).toBe(1);
    expect(counts['Tank']).toBe(1);
    expect(counts['Assassin']).toBe(1);
  });

  // --- Search ---

  it('search by name should match partial', () => {
    const result = db.search('Ah');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('Ahri');
  });

  it('search should be case-insensitive', () => {
    expect(db.search('ahri').length).toBe(1);
    expect(db.search('JINX').length).toBe(1);
  });

  it('search by title should work', () => {
    const result = db.search('Loose Cannon');
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('Jinx');
  });

  it('search with empty query should return all', () => {
    expect(db.search('').length).toBe(3);
    expect(db.search('   ').length).toBe(3);
  });

  it('search with no match should return empty', () => {
    expect(db.search('Zyra').length).toBe(0);
  });

  // --- Filtering ---

  it('filter by tags (AND) should require all tags', () => {
    const result = db.filter({ tags: ['Mage', 'Assassin'] });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('Ahri');
  });

  it('filter by tags (AND) with non-matching combo should return empty', () => {
    expect(db.filter({ tags: ['Mage', 'Tank'] }).length).toBe(0);
  });

  it('filter by tagsAny (OR) should match any tag', () => {
    const result = db.filter({ tagsAny: ['Mage', 'Tank'] });
    expect(result.length).toBe(2);
  });

  it('filter by attackType melee should return Darius', () => {
    const result = db.filter({ attackType: 'melee' });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('Darius');
  });

  it('filter by attackType ranged should return Ahri and Jinx', () => {
    const result = db.filter({ attackType: 'ranged' });
    expect(result.length).toBe(2);
  });

  it('filter by minHp', () => {
    const result = db.filter({ minHp: 600 });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('Darius');
  });

  it('filter by maxHp', () => {
    const result = db.filter({ maxHp: 550 });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('Jinx');
  });

  it('filter by stat range should work', () => {
    const result = db.filter({ minAttackDamage: 60, maxHp: 700 });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('Darius');
  });

  it('filter by resourceType', () => {
    expect(db.filter({ resourceType: 'Mana' }).length).toBe(3);
  });

  // --- searchAndFilter ---

  it('searchAndFilter should combine search and filter', () => {
    const result = db.searchAndFilter('Da', { attackType: 'melee' });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('Darius');
  });

  it('searchAndFilter should filter out non-matching search results', () => {
    expect(db.searchAndFilter('Ahri', { attackType: 'melee' }).length).toBe(0);
  });

  // --- Sorting ---

  it('sort by name asc should sort alphabetically', () => {
    const sorted = db.sort(db.getAll(), { field: 'name', direction: 'asc' });
    expect(sorted[0].name).toBe('Ahri');
    expect(sorted[1].name).toBe('Darius');
    expect(sorted[2].name).toBe('Jinx');
  });

  it('sort by hp desc should sort by HP descending', () => {
    const sorted = db.sort(db.getAll(), { field: 'hp', direction: 'desc' });
    expect(sorted[0].id).toBe('Darius');
    expect(sorted[1].id).toBe('Ahri');
    expect(sorted[2].id).toBe('Jinx');
  });

  it('sort by attackDamage asc should sort correctly', () => {
    const sorted = db.sort(db.getAll(), { field: 'attackDamage', direction: 'asc' });
    expect(sorted[0].id).toBe('Ahri');
    expect(sorted[2].id).toBe('Darius');
  });

  // --- Full Pipeline (query) ---

  it('query should combine search + filter + sort', () => {
    const result = db.query(
      '',
      { tagsAny: ['Mage', 'Fighter'] },
      { field: 'hp', direction: 'desc' },
    );
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('Darius');
    expect(result[1].id).toBe('Ahri');
  });

  it('query with search should narrow results', () => {
    const result = db.query(
      'ri',
      { tagsAny: ['Mage', 'Fighter'] },
      { field: 'hp', direction: 'asc' },
    );
    expect(result.length).toBe(2);
    expect(result[0].id).toBe('Ahri');
  });
});

// --- championDB singleton (live data) ---

describe('championDB singleton (live data)', () => {
  it('should load all champions from parsed data', () => {
    expect(championDB.count()).toBeGreaterThan(100);
  });

  it('should find Ahri by id', () => {
    const ahri = championDB.getById('Ahri');
    expect(ahri).toBeDefined();
    expect(ahri!.name).toBe('Ahri');
    expect(ahri!.tags).toContain('Mage');
  });

  it('should have all expected tags', () => {
    const tags = championDB.getAllTags();
    expect(tags).toContain('Fighter');
    expect(tags).toContain('Mage');
    expect(tags).toContain('Assassin');
    expect(tags).toContain('Tank');
    expect(tags).toContain('Marksman');
    expect(tags).toContain('Support');
  });

  it('search should find champions by partial name', () => {
    const results = championDB.search('Lux');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((c) => c.id === 'Lux')).toBe(true);
  });

  it('filter by multiple tags should work on live data', () => {
    const fighters = championDB.getByTag('Fighter');
    expect(fighters.length).toBeGreaterThan(10);
  });
});
