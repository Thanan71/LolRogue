/**
 * Rune Database — conditional bonus runes for champions.
 */

import { RuneConditionType, type RuneDefinition, RunePath } from '@/types/inventory';

// ═══════════════════════════════════════════════════════════════════════════════
// PRECISION — Sustained damage and attack speed
// ═══════════════════════════════════════════════════════════════════════════════

const PRESS_THE_ATTACK: RuneDefinition = {
  id: 'press_the_attack',
  name: 'Press the Attack',
  description: 'Après avoir infligé des dégâts 3 fois, gagne +15 % ATQ pendant 3 tours.',
  iconUrl: '/assets/runes/press_the_attack.png',
  path: RunePath.Precision,
  row: 0,
  condition: { type: RuneConditionType.AfterDealingDamage, threshold: 3 },
  bonus: {
    modifiers: [{ stat: 'atk', value: 0.15, type: 'percent' }],
    duration: 3,
    stacks: false,
    maxStacks: 1,
  },
};

const TRIUMPH: RuneDefinition = {
  id: 'triumph',
  name: 'Triumph',
  description: 'Après une élimination, récupère 12 % des PV maximum.',
  iconUrl: '/assets/runes/triumph.png',
  path: RunePath.Precision,
  row: 1,
  condition: { type: RuneConditionType.OnKill },
  bonus: {
    modifiers: [],
    triggeredEffect: { type: 'heal_max_hp', value: 0.12 },
    duration: 1,
    stacks: false,
    maxStacks: 1,
  },
};

const LEGEND_ALACRITY: RuneDefinition = {
  id: 'legend_alacrity',
  name: 'Legend: Alacrity',
  description: 'Chaque élimination confère définitivement +3 % VIT (10 cumuls maximum).',
  iconUrl: '/assets/runes/legend_alacrity.png',
  path: RunePath.Precision,
  row: 2,
  condition: { type: RuneConditionType.OnKill },
  bonus: {
    modifiers: [{ stat: 'spd', value: 0.03, type: 'percent' }],
    duration: 0,
    stacks: true,
    maxStacks: 10,
  },
};

const LAST_STAND: RuneDefinition = {
  id: 'last_stand',
  name: 'Last Stand',
  description: '+12 % ATQ lorsque les PV sont inférieurs à 40 %.',
  iconUrl: '/assets/runes/last_stand.png',
  path: RunePath.Precision,
  row: 3,
  condition: { type: RuneConditionType.HpBelowPercent, threshold: 40 },
  bonus: {
    modifiers: [{ stat: 'atk', value: 0.12, type: 'percent' }],
    duration: 0,
    stacks: false,
    maxStacks: 1,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// DOMINATION — Burst damage and assassination
// ═══════════════════════════════════════════════════════════════════════════════

const ELECTROCUTE: RuneDefinition = {
  id: 'electrocute',
  name: 'Electrocute',
  description:
    'Après 3 compétences lancées, la prochaine attaque inflige 40 dégâts magiques supplémentaires.',
  iconUrl: '/assets/runes/electrocute.png',
  path: RunePath.Domination,
  row: 0,
  condition: { type: RuneConditionType.OnAbilityCast, threshold: 3 },
  bonus: {
    modifiers: [],
    triggeredEffect: { type: 'bonus_magic_damage', value: 40 },
    duration: 1,
    stacks: false,
    maxStacks: 1,
  },
};

const SUDDEN_IMPACT: RuneDefinition = {
  id: 'sudden_impact',
  name: 'Sudden Impact',
  description: 'Après une compétence lancée, gagne +8 ATQ pendant 2 tours.',
  iconUrl: '/assets/runes/sudden_impact.png',
  path: RunePath.Domination,
  row: 1,
  condition: { type: RuneConditionType.OnAbilityCast },
  bonus: {
    modifiers: [{ stat: 'atk', value: 8, type: 'flat' }],
    duration: 2,
    stacks: false,
    maxStacks: 1,
  },
};

const EYEBALL_COLLECTION: RuneDefinition = {
  id: 'eyeball_collection',
  name: 'Eyeball Collection',
  description: 'Chaque élimination confère définitivement +2 AP (10 cumuls maximum).',
  iconUrl: '/assets/runes/eyeball_collection.png',
  path: RunePath.Domination,
  row: 2,
  condition: { type: RuneConditionType.OnKill },
  bonus: {
    modifiers: [{ stat: 'ap', value: 2, type: 'flat' }],
    duration: 0,
    stacks: true,
    maxStacks: 10,
  },
};

const RAVENOUS_HUNTER: RuneDefinition = {
  id: 'ravenous_hunter',
  name: 'Ravenous Hunter',
  description: 'Chaque élimination confère définitivement +4 % ATQ (5 cumuls maximum).',
  iconUrl: '/assets/runes/ravenous_hunter.png',
  path: RunePath.Domination,
  row: 3,
  condition: { type: RuneConditionType.OnKill },
  bonus: {
    modifiers: [{ stat: 'atk', value: 0.04, type: 'percent' }],
    duration: 0,
    stacks: true,
    maxStacks: 5,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SORCERY — AP scaling and ability power
// ═══════════════════════════════════════════════════════════════════════════════

const SUMMON_AERY: RuneDefinition = {
  id: 'summon_aery',
  name: 'Summon Aery',
  description: 'Au début du combat, gagne +20 AP pendant 2 tours.',
  iconUrl: '/assets/runes/summon_aery.png',
  path: RunePath.Sorcery,
  row: 0,
  condition: { type: RuneConditionType.BattleStart },
  bonus: {
    modifiers: [{ stat: 'ap', value: 20, type: 'flat' }],
    duration: 2,
    stacks: false,
    maxStacks: 1,
  },
};

const MANAFLOW_BAND: RuneDefinition = {
  id: 'manaflow_band',
  name: 'Manaflow Band',
  description: 'Tous les 5 tours, gagne définitivement +15 AP (4 cumuls maximum).',
  iconUrl: '/assets/runes/manaflow_band.png',
  path: RunePath.Sorcery,
  row: 1,
  condition: { type: RuneConditionType.EveryNTurns, param: 5 },
  bonus: {
    modifiers: [{ stat: 'ap', value: 15, type: 'flat' }],
    duration: 0,
    stacks: true,
    maxStacks: 4,
  },
};

const TRANSCENDENCE: RuneDefinition = {
  id: 'transcendence',
  name: 'Transcendence',
  description: 'Tous les 8 tours, gagne définitivement +10 % AP.',
  iconUrl: '/assets/runes/transcendence.png',
  path: RunePath.Sorcery,
  row: 2,
  condition: { type: RuneConditionType.EveryNTurns, param: 8 },
  bonus: {
    modifiers: [{ stat: 'ap', value: 0.1, type: 'percent' }],
    duration: 0,
    stacks: false,
    maxStacks: 1,
  },
};

const SCORCH: RuneDefinition = {
  id: 'scorch',
  name: 'Scorch',
  description: '+18 AP lorsque les PV sont supérieurs à 70 %.',
  iconUrl: '/assets/runes/scorch.png',
  path: RunePath.Sorcery,
  row: 3,
  condition: { type: RuneConditionType.HpAbovePercent, threshold: 70 },
  bonus: {
    modifiers: [{ stat: 'ap', value: 18, type: 'flat' }],
    duration: 0,
    stacks: false,
    maxStacks: 1,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// RESOLVE — Tankiness and defense
// ═══════════════════════════════════════════════════════════════════════════════

const GRASP_OF_THE_UNDYING: RuneDefinition = {
  id: 'grasp_of_the_undying',
  name: 'Grasp of the Undying',
  description: 'Tous les 4 tours, gagne définitivement +5 DEF et +30 PV.',
  iconUrl: '/assets/runes/grasp_of_the_undying.png',
  path: RunePath.Resolve,
  row: 0,
  condition: { type: RuneConditionType.EveryNTurns, param: 4 },
  bonus: {
    modifiers: [
      { stat: 'def', value: 5, type: 'flat' },
      { stat: 'hp', value: 30, type: 'flat' },
    ],
    duration: 0,
    stacks: true,
    maxStacks: 8,
  },
};

const CONDITIONING: RuneDefinition = {
  id: 'conditioning',
  name: 'Conditioning',
  description: 'Au début du combat, gagne +10 DEF pendant 3 tours.',
  iconUrl: '/assets/runes/conditioning.png',
  path: RunePath.Resolve,
  row: 1,
  condition: { type: RuneConditionType.BattleStart },
  bonus: {
    modifiers: [{ stat: 'def', value: 10, type: 'flat' }],
    duration: 3,
    stacks: false,
    maxStacks: 1,
  },
};

const OVERGROWTH: RuneDefinition = {
  id: 'overgrowth',
  name: 'Overgrowth',
  description: 'Chaque élimination confère définitivement +20 PV (10 cumuls maximum).',
  iconUrl: '/assets/runes/overgrowth.png',
  path: RunePath.Resolve,
  row: 2,
  condition: { type: RuneConditionType.OnKill },
  bonus: {
    modifiers: [{ stat: 'hp', value: 20, type: 'flat' }],
    duration: 0,
    stacks: true,
    maxStacks: 10,
  },
};

const REVITALIZE: RuneDefinition = {
  id: 'revitalize',
  name: 'Revitalize',
  description: '+15 % DEF lorsque les PV sont inférieurs à 40 %.',
  iconUrl: '/assets/runes/revitalize.png',
  path: RunePath.Resolve,
  row: 3,
  condition: { type: RuneConditionType.HpBelowPercent, threshold: 40 },
  bonus: {
    modifiers: [{ stat: 'def', value: 0.15, type: 'percent' }],
    duration: 0,
    stacks: false,
    maxStacks: 1,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// INSPIRATION — Utility and versatility
// ═══════════════════════════════════════════════════════════════════════════════

const GLACIAL_AUGMENT: RuneDefinition = {
  id: 'glacial_augment',
  name: 'Glacial Augment',
  description: 'Tous les 3 tours, gagne +8 % de critique pendant 2 tours.',
  iconUrl: '/assets/runes/glacial_augment.png',
  path: RunePath.Inspiration,
  row: 0,
  condition: { type: RuneConditionType.EveryNTurns, param: 3 },
  bonus: {
    modifiers: [{ stat: 'crit', value: 8, type: 'flat' }],
    duration: 2,
    stacks: false,
    maxStacks: 1,
  },
};

const HEXTECH_FLASH: RuneDefinition = {
  id: 'hextech_flash',
  name: 'Hextech Flash',
  description: 'Au début du combat, gagne +3 VIT pendant 2 tours.',
  iconUrl: '/assets/runes/hextech_flash.png',
  path: RunePath.Inspiration,
  row: 1,
  condition: { type: RuneConditionType.BattleStart },
  bonus: {
    modifiers: [{ stat: 'spd', value: 3, type: 'flat' }],
    duration: 2,
    stacks: false,
    maxStacks: 1,
  },
};

const COSMIC_INSIGHT: RuneDefinition = {
  id: 'cosmic_insight',
  name: 'Cosmic Insight',
  description: "Sous l'effet d'un bonus, gagne +5 % à toutes les statistiques.",
  iconUrl: '/assets/runes/cosmic_insight.png',
  path: RunePath.Inspiration,
  row: 2,
  condition: { type: RuneConditionType.WhileBuffed },
  bonus: {
    modifiers: [
      { stat: 'atk', value: 0.05, type: 'percent' },
      { stat: 'ap', value: 0.05, type: 'percent' },
      { stat: 'def', value: 0.05, type: 'percent' },
    ],
    duration: 0,
    stacks: false,
    maxStacks: 1,
  },
};

const TIME_WARP_TONIC: RuneDefinition = {
  id: 'time_warp_tonic',
  name: 'Time Warp Tonic',
  description: 'Sous contrôle de foule, gagne +20 % DEF.',
  iconUrl: '/assets/runes/time_warp_tonic.png',
  path: RunePath.Inspiration,
  row: 3,
  condition: { type: RuneConditionType.WhileCCd },
  bonus: {
    modifiers: [{ stat: 'def', value: 0.2, type: 'percent' }],
    duration: 0,
    stacks: false,
    maxStacks: 1,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

export const RUNE_DATABASE: Record<string, RuneDefinition> = {
  // Precision
  press_the_attack: PRESS_THE_ATTACK,
  triumph: TRIUMPH,
  legend_alacrity: LEGEND_ALACRITY,
  last_stand: LAST_STAND,
  // Domination
  electrocute: ELECTROCUTE,
  sudden_impact: SUDDEN_IMPACT,
  eyeball_collection: EYEBALL_COLLECTION,
  ravenous_hunter: RAVENOUS_HUNTER,
  // Sorcery
  summon_aery: SUMMON_AERY,
  manaflow_band: MANAFLOW_BAND,
  transcendence: TRANSCENDENCE,
  scorch: SCORCH,
  // Resolve
  grasp_of_the_undying: GRASP_OF_THE_UNDYING,
  conditioning: CONDITIONING,
  overgrowth: OVERGROWTH,
  revitalize: REVITALIZE,
  // Inspiration
  glacial_augment: GLACIAL_AUGMENT,
  hextech_flash: HEXTECH_FLASH,
  cosmic_insight: COSMIC_INSIGHT,
  time_warp_tonic: TIME_WARP_TONIC,
};

export function getRuneDefinition(id: string): RuneDefinition | undefined {
  return RUNE_DATABASE[id];
}

export function getRunesByPath(path: RunePath): RuneDefinition[] {
  return Object.values(RUNE_DATABASE).filter((rune) => rune.path === path);
}

export function getKeystoneRunes(): RuneDefinition[] {
  return Object.values(RUNE_DATABASE).filter((rune) => rune.row === 0);
}
