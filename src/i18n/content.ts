import { locale } from './fr';

type ContentCopy = { name: string; description: string };

const ITEM_COPY: Readonly<Record<string, ContentCopy>> = {
  long_sword: { name: 'Long Sword', description: 'A simple blade that increases attack damage.' },
  amplifying_tome: {
    name: 'Amplifying Tome',
    description: 'A magic tome that increases ability power.',
  },
  cloth_armor: { name: 'Cloth Armor', description: 'Light protection that increases defense.' },
  ruby_crystal: { name: 'Ruby Crystal', description: 'A radiant crystal that increases health.' },
  boots: { name: 'Boots', description: 'Shoes that increase speed.' },
  dagger: { name: 'Dagger', description: 'A light blade that increases critical strike chance.' },
  bf_sword: {
    name: 'B. F. Sword',
    description: 'A massive blade that greatly increases attack damage.',
  },
  infinity_edge: {
    name: 'Infinity Edge',
    description: 'Greatly increases critical strike damage.',
  },
  rabaddons_deathcap: {
    name: "Rabadon's Deathcap",
    description: 'Greatly increases ability power.',
  },
  sunfire_aegis: {
    name: 'Sunfire Aegis',
    description: 'Burns nearby enemies and strengthens defenses.',
  },
  guardian_angel: {
    name: 'Guardian Angel',
    description: 'Revives its wielder with 30% of their HP.',
  },
  bloodthirster: { name: 'Bloodthirster', description: 'Grants lifesteal on attacks.' },
  spirit_visage: { name: 'Spirit Visage', description: 'Increases all healing received.' },
  health_potion: { name: 'Health Potion', description: 'Restores 150 HP over 3 turns.' },
  elixir_of_wrath: { name: 'Elixir of Wrath', description: 'Temporarily increases attack damage.' },
};

const AUGMENT_COPY: Readonly<Record<string, ContentCopy>> = {
  brute_force: { name: 'Brute Force', description: 'All champions gain +7 attack damage.' },
  iron_skin: { name: 'Iron Skin', description: 'All champions gain +5 defense.' },
  arcane_mind: { name: 'Arcane Mind', description: 'All champions gain +7 ability power.' },
  vitality_boost: { name: 'Vitality Boost', description: 'All champions gain +90 HP.' },
  swift_feet: { name: 'Swift Feet', description: 'All champions gain +12 speed.' },
  critical_focus: {
    name: 'Critical Focus',
    description: 'All champions gain 10% critical strike chance.',
  },
  golden_touch: { name: 'Golden Touch', description: 'Gain 20 extra gold after each combat.' },
  field_medic: {
    name: 'Field Medic',
    description: 'Heal all champions for 10% of their maximum HP after each combat.',
  },
  warlord: { name: 'Warlord', description: 'All champions gain 15% attack damage.' },
  bulwark: { name: 'Bulwark', description: 'All champions gain 15% defense.' },
  sorcery_supreme: {
    name: 'Supreme Sorcery',
    description: 'All champions gain 15% ability power.',
  },
  glass_cannon: {
    name: 'Glass Cannon',
    description: 'All champions gain 15% attack damage but lose 8% defense.',
  },
  fortune: { name: 'Fortune', description: 'Gain 40 extra gold after each combat.' },
  battle_hardened: {
    name: 'Battle Hardened',
    description: 'All champions gain +5 attack damage and +5 defense per completed biome.',
  },
  divine_blessing: {
    name: 'Divine Blessing',
    description: 'All champions gain 23% attack damage, defense, and ability power.',
  },
  phoenix_heart: {
    name: 'Phoenix Heart',
    description: 'The first champion eliminated in each combat returns with 50% HP.',
  },
  hyper_carry: { name: 'Hypercarry', description: 'All champions deal 25% more damage.' },
  unstoppable: { name: 'Unstoppable', description: 'All champions take 22% less damage.' },
  golden_age: {
    name: 'Golden Age',
    description: 'Gain 70 gold after each combat and reduce item prices by 10%.',
  },
};

function localize(
  copy: ContentCopy | undefined,
  fallback: string,
  field: keyof ContentCopy,
): string {
  return locale === 'en-US' ? (copy?.[field] ?? fallback) : fallback;
}

export function itemName(id: string, fallback: string): string {
  return localize(ITEM_COPY[id], fallback, 'name');
}

export function itemDescription(id: string, fallback: string): string {
  return localize(ITEM_COPY[id], fallback, 'description');
}

export function augmentName(id: string, fallback: string): string {
  return localize(AUGMENT_COPY[id], fallback, 'name');
}

export function augmentDescription(id: string, fallback: string): string {
  return localize(AUGMENT_COPY[id], fallback, 'description');
}
