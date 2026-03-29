/**
 * Types for League of Legends champion data from Data Dragon.
 */

// ─── Champion Tags ───────────────────────────────────────────────────────────

export const CHAMPION_TAGS = [
  'Fighter',
  'Mage',
  'Assassin',
  'Tank',
  'Marksman',
  'Support',
] as const;

export type ChampionTag = (typeof CHAMPION_TAGS)[number];

// ─── Resource Types (partype) ────────────────────────────────────────────────

export const RESOURCE_TYPES = [
  'Mana',
  'Energy',
  'Fury',
  'Blood Well',
  'Courage',
  'Ferocity',
  'Heat',
  'Shield',
  'Flow',
  'Grit',
  'Pompes de sang', // fr_FR for Blood Well
  'Énergie', // fr_FR for Energy
  'Impulsion', // fr_FR for Flow
  'Aucune', // fr_FR for None
  'None',
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

// ─── Champion Stats (base + per-level growth) ───────────────────────────────

export interface ChampionStats {
  // Base values
  hp: number;
  mp: number;
  moveSpeed: number;
  armor: number;
  magicResist: number; // spellblock
  attackDamage: number;
  attackSpeed: number;
  attackRange: number;

  // Per-level growth
  hpPerLevel: number;
  mpPerLevel: number;
  armorPerLevel: number;
  magicResistPerLevel: number;
  attackDamagePerLevel: number;
  attackSpeedPerLevel: number;

  // Regen
  hpRegen: number;
  hpRegenPerLevel: number;
  mpRegen: number;
  mpRegenPerLevel: number;

  // Misc
  crit: number;
  critPerLevel: number;
}

// ─── Spell ──────────────────────────────────────────────────────────────────

export interface Spell {
  id: string;
  name: string;
  description: string;
  maxRank: number;
  cooldown: number[];       // per rank
  cost: number[];           // per rank
  range: number[];          // per rank
  image: string;            // filename e.g. "AhriQ.png"
}

// ─── Passive ────────────────────────────────────────────────────────────────

export interface Passive {
  name: string;
  description: string;
  image: string; // filename e.g. "Ahri_SoulEater2.png"
}

// ─── Champion (fully parsed) ────────────────────────────────────────────────

export interface Champion {
  id: string;               // e.g. "Ahri"
  key: string;              // numeric key as string, e.g. "103"
  name: string;             // display name
  title: string;            // e.g. "the Nine-Tailed Fox"
  tags: ChampionTag[];
  resourceType: ResourceType;
  stats: ChampionStats;
  spells: Spell[];
  passive: Passive;
  iconUrl: string;          // e.g. "/data/lol/img/champions/Ahri.png"
}

// ─── Raw Data Dragon types (for parsing) ────────────────────────────────────

/** Raw stats object from Data Dragon champions.json */
export interface RawDDragonStats {
  hp: number;
  hpperlevel: number;
  mp: number;
  mpperlevel: number;
  movespeed: number;
  armor: number;
  armorperlevel: number;
  spellblock: number;
  spellblockperlevel: number;
  attackrange: number;
  hpregen: number;
  hpregenperlevel: number;
  mpregen: number;
  mpregenperlevel: number;
  crit: number;
  critperlevel: number;
  attackdamage: number;
  attackdamageperlevel: number;
  attackspeedperlevel: number;
  attackspeed: number;
}

/** Raw spell object from Data Dragon per-champion endpoint */
export interface RawDDragonSpell {
  id: string;
  name: string;
  description: string;
  maxrank: number;
  cooldown: number[];
  cost: number[];
  range: number[];
  image: {
    full: string;
    sprite: string;
    group: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

/** Raw passive object from Data Dragon per-champion endpoint */
export interface RawDDragonPassive {
  name: string;
  description: string;
  image: {
    full: string;
    sprite: string;
    group: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

/** Raw champion entry from Data Dragon champions.json */
export interface RawDDragonChampion {
  version: string;
  id: string;
  key: string;
  name: string;
  title: string;
  blurb: string;
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
  image: {
    full: string;
    sprite: string;
    group: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };
  tags: string[];
  partype: string;
  stats: RawDDragonStats;
}

/** Full per-champion detail from Data Dragon */
export interface RawDDragonChampionDetail {
  version: string;
  id: string;
  key: string;
  name: string;
  title: string;
  blurb: string;
  lore: string;
  tags: string[];
  partype: string;
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
  image: {
    full: string;
    sprite: string;
    group: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };
  stats: RawDDragonStats;
  spells: RawDDragonSpell[];
  passive: RawDDragonPassive;
}

/** Structure of champions.json (summary list) */
export interface DDragonChampionsResponse {
  type: string;
  format: string;
  version: string;
  data: Record<string, RawDDragonChampion>;
}

/** Structure of a per-champion detail endpoint */
export interface DDragonChampionDetailResponse {
  type: string;
  format: string;
  version: string;
  data: Record<string, RawDDragonChampionDetail>;
}
