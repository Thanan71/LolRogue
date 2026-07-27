/**
 * Item Database — all item definitions for the roguelike run.
 */

import { ItemCategory, type ItemDefinition, ItemRarity } from '@/types/inventory';
import { riotItemIconUrl } from '@/config/riotAssets';

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 1 — COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const LONG_SWORD: ItemDefinition = {
  id: 'long_sword',
  name: 'Long Sword',
  description: 'A simple blade that increases attack power.',
  iconUrl: riotItemIconUrl('long_sword'),
  category: ItemCategory.Weapon,
  rarity: ItemRarity.Common,
  stats: [{ stat: 'atk', value: 10, type: 'flat' }],
  goldValue: 350,
  stackable: true,
  maxStacks: 5,
  tier: 1,
};

const AMPLIFYING_TOME: ItemDefinition = {
  id: 'amplifying_tome',
  name: 'Amplifying Tome',
  description: 'A magical tome that enhances spell power.',
  iconUrl: riotItemIconUrl('amplifying_tome'),
  category: ItemCategory.Weapon,
  rarity: ItemRarity.Common,
  stats: [{ stat: 'ap', value: 20, type: 'flat' }],
  goldValue: 435,
  stackable: true,
  maxStacks: 5,
  tier: 1,
};

const CLOTH_ARMOR: ItemDefinition = {
  id: 'cloth_armor',
  name: 'Cloth Armor',
  description: 'A simple cloth vest that provides basic protection.',
  iconUrl: riotItemIconUrl('cloth_armor'),
  category: ItemCategory.Armor,
  rarity: ItemRarity.Common,
  stats: [{ stat: 'def', value: 15, type: 'flat' }],
  goldValue: 300,
  stackable: true,
  maxStacks: 5,
  tier: 1,
};

const RUBY_CRYSTAL: ItemDefinition = {
  id: 'ruby_crystal',
  name: 'Ruby Crystal',
  description: 'A radiant crystal that bolsters vitality.',
  iconUrl: riotItemIconUrl('ruby_crystal'),
  category: ItemCategory.Accessory,
  rarity: ItemRarity.Common,
  stats: [{ stat: 'hp', value: 150, type: 'flat' }],
  goldValue: 400,
  stackable: true,
  maxStacks: 5,
  tier: 1,
};

const BOOTS: ItemDefinition = {
  id: 'boots',
  name: 'Boots',
  description: 'Basic footwear that increases movement speed.',
  iconUrl: riotItemIconUrl('boots'),
  category: ItemCategory.Accessory,
  rarity: ItemRarity.Common,
  stats: [{ stat: 'spd', value: 2, type: 'flat' }],
  goldValue: 300,
  stackable: false,
  maxStacks: 1,
  tier: 1,
};

const DAGGER: ItemDefinition = {
  id: 'dagger',
  name: 'Dagger',
  description: 'A quick blade that improves critical strike chance.',
  iconUrl: riotItemIconUrl('dagger'),
  category: ItemCategory.Weapon,
  rarity: ItemRarity.Common,
  stats: [{ stat: 'crit', value: 10, type: 'flat' }],
  goldValue: 300,
  stackable: true,
  maxStacks: 5,
  tier: 1,
};

const BF_SWORD: ItemDefinition = {
  id: 'bf_sword',
  name: 'B.F. Sword',
  description: 'A massive blade that greatly increases attack damage.',
  iconUrl: riotItemIconUrl('bf_sword'),
  category: ItemCategory.Weapon,
  rarity: ItemRarity.Uncommon,
  stats: [{ stat: 'atk', value: 40, type: 'flat' }],
  goldValue: 1300,
  stackable: true,
  maxStacks: 5,
  tier: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 2 — COMPLETED ITEMS
// ═══════════════════════════════════════════════════════════════════════════════

const INFINITY_EDGE: ItemDefinition = {
  id: 'infinity_edge',
  name: 'Infinity Edge',
  description: 'Massively increases critical strike damage.',
  iconUrl: riotItemIconUrl('infinity_edge'),
  category: ItemCategory.Weapon,
  rarity: ItemRarity.Legendary,
  stats: [
    { stat: 'atk', value: 60, type: 'flat' },
    { stat: 'crit', value: 20, type: 'flat' },
  ],
  passive: {
    id: 'ie_passive',
    name: 'Perfection',
    description: 'Critical strikes deal 35% bonus damage.',
    trigger: 'on_hit',
    modifiers: [],
    flatValue: 0.35,
  },
  goldValue: 3400,
  stackable: false,
  maxStacks: 1,
  components: ['long_sword', 'dagger'],
  tier: 2,
};

const RABADONS_DEATHCAP: ItemDefinition = {
  id: 'rabaddons_deathcap',
  name: "Rabadon's Deathcap",
  description: 'Dramatically increases ability power.',
  iconUrl: riotItemIconUrl('rabaddons_deathcap'),
  category: ItemCategory.Weapon,
  rarity: ItemRarity.Legendary,
  stats: [{ stat: 'ap', value: 120, type: 'flat' }],
  passive: {
    id: 'rabadons_passive',
    name: 'Magical Opus',
    description: 'Increases total AP by 35%.',
    trigger: 'always',
    modifiers: [{ stat: 'ap', value: 0.35, type: 'percent' }],
  },
  goldValue: 3600,
  stackable: false,
  maxStacks: 1,
  components: ['amplifying_tome'],
  tier: 2,
};

const SUNFIRE_AEGIS: ItemDefinition = {
  id: 'sunfire_aegis',
  name: 'Sunfire Aegis',
  description: 'Burn nearby enemies and gain defensive stats.',
  iconUrl: riotItemIconUrl('sunfire_aegis'),
  category: ItemCategory.Armor,
  rarity: ItemRarity.Epic,
  stats: [
    { stat: 'hp', value: 450, type: 'flat' },
    { stat: 'def', value: 30, type: 'flat' },
  ],
  passive: {
    id: 'sunfire_passive',
    name: 'Immolate',
    description: 'Deal 15 magic damage to all enemies each turn.',
    trigger: 'turn_start',
    modifiers: [],
    flatValue: 15,
  },
  goldValue: 2700,
  stackable: false,
  maxStacks: 1,
  components: ['ruby_crystal', 'cloth_armor'],
  tier: 2,
};

const GUARDIAN_ANGEL: ItemDefinition = {
  id: 'guardian_angel',
  name: 'Guardian Angel',
  description: 'Revives the holder upon death with 30% HP.',
  iconUrl: riotItemIconUrl('guardian_angel'),
  category: ItemCategory.Armor,
  rarity: ItemRarity.Legendary,
  stats: [
    { stat: 'atk', value: 40, type: 'flat' },
    { stat: 'def', value: 30, type: 'flat' },
  ],
  passive: {
    id: 'ga_passive',
    name: 'Rebirth',
    description: 'Upon taking lethal damage, revive with 30% HP.',
    trigger: 'below_hp_threshold',
    modifiers: [],
    flatValue: 0.3,
    cooldown: 999,
    procChance: 1,
  },
  goldValue: 2800,
  stackable: false,
  maxStacks: 1,
  components: ['long_sword', 'cloth_armor'],
  tier: 2,
};

const BLOODTHIRSTER: ItemDefinition = {
  id: 'bloodthirster',
  name: 'Bloodthirster',
  description: 'Gain lifesteal on attacks.',
  iconUrl: riotItemIconUrl('bloodthirster'),
  category: ItemCategory.Weapon,
  rarity: ItemRarity.Legendary,
  stats: [
    { stat: 'atk', value: 55, type: 'flat' },
    { stat: 'crit', value: 20, type: 'flat' },
  ],
  passive: {
    id: 'bt_passive',
    name: 'Blood Drain',
    description: 'Heal for 18% of damage dealt.',
    trigger: 'on_hit',
    modifiers: [],
    flatValue: 0.18,
  },
  goldValue: 3400,
  stackable: false,
  maxStacks: 1,
  components: ['long_sword', 'dagger'],
  tier: 2,
};

const SPIRIT_VISAGE: ItemDefinition = {
  id: 'spirit_visage',
  name: 'Spirit Visage',
  description: 'Increases all healing received.',
  iconUrl: riotItemIconUrl('spirit_visage'),
  category: ItemCategory.Armor,
  rarity: ItemRarity.Epic,
  stats: [
    { stat: 'hp', value: 450, type: 'flat' },
    { stat: 'def', value: 20, type: 'flat' },
  ],
  passive: {
    id: 'sv_passive',
    name: 'Boundless Vitality',
    description: 'Increases all healing and shielding received by 25%.',
    trigger: 'always',
    modifiers: [],
    flatValue: 0.25,
  },
  goldValue: 2800,
  stackable: false,
  maxStacks: 1,
  components: ['ruby_crystal'],
  tier: 2,
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMABLES
// ═══════════════════════════════════════════════════════════════════════════════

const HEALTH_POTION: ItemDefinition = {
  id: 'health_potion',
  name: 'Health Potion',
  description: 'Restores 150 HP over 3 turns.',
  iconUrl: riotItemIconUrl('health_potion'),
  category: ItemCategory.Consumable,
  rarity: ItemRarity.Common,
  stats: [],
  passive: {
    id: 'hp_pot_passive',
    name: 'Sip',
    description: 'Restore 50 HP per turn for 3 turns.',
    trigger: 'combat_start',
    modifiers: [],
    flatValue: 50,
  },
  goldValue: 50,
  stackable: true,
  maxStacks: 10,
  tier: 1,
};

const ELIXIR_OF_WRATH: ItemDefinition = {
  id: 'elixir_of_wrath',
  name: 'Elixir of Wrath',
  description: 'Temporarily grants bonus attack damage.',
  iconUrl: riotItemIconUrl('elixir_of_wrath'),
  category: ItemCategory.Consumable,
  rarity: ItemRarity.Uncommon,
  stats: [],
  passive: {
    id: 'elixir_wrath_passive',
    name: 'Wrath',
    description: 'Gain +30 ATK for the duration of combat.',
    trigger: 'combat_start',
    modifiers: [{ stat: 'atk', value: 30, type: 'flat' }],
  },
  goldValue: 500,
  stackable: true,
  maxStacks: 5,
  tier: 1,
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const ITEM_DATABASE: Record<string, ItemDefinition> = {
  long_sword: LONG_SWORD,
  amplifying_tome: AMPLIFYING_TOME,
  cloth_armor: CLOTH_ARMOR,
  ruby_crystal: RUBY_CRYSTAL,
  boots: BOOTS,
  dagger: DAGGER,
  bf_sword: BF_SWORD,
  infinity_edge: INFINITY_EDGE,
  rabaddons_deathcap: RABADONS_DEATHCAP,
  sunfire_aegis: SUNFIRE_AEGIS,
  guardian_angel: GUARDIAN_ANGEL,
  bloodthirster: BLOODTHIRSTER,
  spirit_visage: SPIRIT_VISAGE,
  health_potion: HEALTH_POTION,
  elixir_of_wrath: ELIXIR_OF_WRATH,
};

export function getItemDefinition(id: string): ItemDefinition | undefined {
  return ITEM_DATABASE[id];
}

export function getItemsByCategory(category: ItemCategory): ItemDefinition[] {
  return Object.values(ITEM_DATABASE).filter((item) => item.category === category);
}

export function getItemsByRarity(rarity: ItemRarity): ItemDefinition[] {
  return Object.values(ITEM_DATABASE).filter((item) => item.rarity === rarity);
}

export function getStackableItems(): ItemDefinition[] {
  return Object.values(ITEM_DATABASE).filter((item) => item.stackable);
}

export function getItemsWithComponent(componentId: string): ItemDefinition[] {
  return Object.values(ITEM_DATABASE).filter((item) => item.components?.includes(componentId));
}
