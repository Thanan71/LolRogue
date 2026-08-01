/**
 * Item Database — all item definitions for the roguelike run.
 */

import { riotItemIconUrl } from '@/config/riotAssets';
import { ItemCategory, type ItemDefinition, ItemRarity } from '@/types/inventory';

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 1 — COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const LONG_SWORD: ItemDefinition = {
  id: 'long_sword',
  name: 'Épée longue',
  description: "Une lame simple qui augmente les dégâts d'attaque.",
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
  name: "Tome d'amplification",
  description: 'Un tome magique qui augmente la puissance.',
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
  name: 'Armure de tissu',
  description: 'Une protection légère qui augmente la défense.',
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
  name: 'Cristal de rubis',
  description: 'Un cristal rayonnant qui augmente la vitalité.',
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
  name: 'Bottes',
  description: 'Des chaussures qui augmentent la vitesse.',
  iconUrl: riotItemIconUrl('boots'),
  category: ItemCategory.Accessory,
  rarity: ItemRarity.Common,
  stats: [{ stat: 'spd', value: 2, type: 'flat' }],
  goldValue: 300,
  unique: true,
  stackable: false,
  maxStacks: 1,
  tier: 1,
};

const DAGGER: ItemDefinition = {
  id: 'dagger',
  name: 'Dague',
  description: 'Une lame légère qui augmente les chances de coup critique.',
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
  name: 'Glaive B. F.',
  description: "Une lame massive qui augmente fortement les dégâts d'attaque.",
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
  name: "Lame d'infini",
  description: 'Augmente fortement les dégâts des coups critiques.',
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
    description: 'Les coups critiques infligent 35 % de dégâts supplémentaires.',
    trigger: 'on_hit',
    modifiers: [],
    flatValue: 0.35,
  },
  goldValue: 3400,
  unique: true,
  stackable: false,
  maxStacks: 1,
  components: ['long_sword', 'dagger'],
  tier: 2,
};

const RABADONS_DEATHCAP: ItemDefinition = {
  id: 'rabaddons_deathcap',
  name: 'Coiffe de Rabadon',
  description: 'Augmente fortement la puissance.',
  iconUrl: riotItemIconUrl('rabaddons_deathcap'),
  category: ItemCategory.Weapon,
  rarity: ItemRarity.Legendary,
  stats: [{ stat: 'ap', value: 120, type: 'flat' }],
  passive: {
    id: 'rabadons_passive',
    name: 'Œuvre magique',
    description: 'Augmente la puissance totale de 35 %.',
    trigger: 'always',
    modifiers: [{ stat: 'ap', value: 0.35, type: 'percent' }],
  },
  goldValue: 3600,
  unique: true,
  stackable: false,
  maxStacks: 1,
  components: ['amplifying_tome'],
  tier: 2,
};

const SUNFIRE_AEGIS: ItemDefinition = {
  id: 'sunfire_aegis',
  name: 'Égide solaire',
  description: 'Brûle les ennemis proches et renforce les défenses.',
  iconUrl: riotItemIconUrl('sunfire_aegis'),
  category: ItemCategory.Armor,
  rarity: ItemRarity.Epic,
  stats: [
    { stat: 'hp', value: 450, type: 'flat' },
    { stat: 'def', value: 30, type: 'flat' },
  ],
  passive: {
    id: 'sunfire_passive',
    name: 'Immolations',
    description: 'Inflige 15 dégâts magiques à tous les ennemis à chaque tour.',
    trigger: 'turn_start',
    modifiers: [],
    flatValue: 15,
  },
  goldValue: 2700,
  unique: true,
  stackable: false,
  maxStacks: 1,
  components: ['ruby_crystal', 'cloth_armor'],
  tier: 2,
};

const GUARDIAN_ANGEL: ItemDefinition = {
  id: 'guardian_angel',
  name: 'Ange gardien',
  description: 'Réanime son porteur avec 30 % de ses PV.',
  iconUrl: riotItemIconUrl('guardian_angel'),
  category: ItemCategory.Armor,
  rarity: ItemRarity.Legendary,
  stats: [
    { stat: 'atk', value: 40, type: 'flat' },
    { stat: 'def', value: 30, type: 'flat' },
  ],
  passive: {
    id: 'ga_passive',
    name: 'Renaissance',
    description: 'Après des dégâts mortels, revient avec 30 % de ses PV.',
    trigger: 'below_hp_threshold',
    modifiers: [],
    flatValue: 0.3,
    cooldown: 999,
    procChance: 1,
  },
  goldValue: 2800,
  unique: true,
  stackable: false,
  maxStacks: 1,
  components: ['long_sword', 'cloth_armor'],
  tier: 2,
};

const BLOODTHIRSTER: ItemDefinition = {
  id: 'bloodthirster',
  name: 'Soif-de-sang',
  description: 'Confère du vol de vie aux attaques.',
  iconUrl: riotItemIconUrl('bloodthirster'),
  category: ItemCategory.Weapon,
  rarity: ItemRarity.Legendary,
  stats: [
    { stat: 'atk', value: 55, type: 'flat' },
    { stat: 'crit', value: 20, type: 'flat' },
  ],
  passive: {
    id: 'bt_passive',
    name: 'Drain de sang',
    description: 'Récupère 18 % des dégâts infligés sous forme de PV.',
    trigger: 'on_hit',
    modifiers: [],
    flatValue: 0.18,
  },
  goldValue: 3400,
  unique: true,
  stackable: false,
  maxStacks: 1,
  components: ['long_sword', 'dagger'],
  tier: 2,
};

const SPIRIT_VISAGE: ItemDefinition = {
  id: 'spirit_visage',
  name: 'Visage spirituel',
  description: 'Augmente tous les soins reçus.',
  iconUrl: riotItemIconUrl('spirit_visage'),
  category: ItemCategory.Armor,
  rarity: ItemRarity.Epic,
  stats: [
    { stat: 'hp', value: 450, type: 'flat' },
    { stat: 'def', value: 20, type: 'flat' },
  ],
  passive: {
    id: 'sv_passive',
    name: 'Vitalité absolue',
    description: 'Augmente de 25 % tous les soins et boucliers reçus.',
    trigger: 'always',
    modifiers: [],
    flatValue: 0.25,
  },
  goldValue: 2800,
  unique: true,
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
  name: 'Potion de soin',
  description: 'Restaure 150 PV en 3 tours.',
  iconUrl: riotItemIconUrl('health_potion'),
  category: ItemCategory.Consumable,
  rarity: ItemRarity.Common,
  stats: [],
  passive: {
    id: 'hp_pot_passive',
    name: 'Gorgée',
    description: 'Restaure 50 PV par tour pendant 3 tours.',
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
  name: 'Élixir de colère',
  description: "Augmente temporairement les dégâts d'attaque.",
  iconUrl: riotItemIconUrl('elixir_of_wrath'),
  category: ItemCategory.Consumable,
  rarity: ItemRarity.Uncommon,
  stats: [],
  passive: {
    id: 'elixir_wrath_passive',
    name: 'Colère',
    description: "Confère +30 dégâts d'attaque pendant le combat.",
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
