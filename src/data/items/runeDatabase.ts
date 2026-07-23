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
  description: 'After dealing damage 3 times, gain +15% ATK for 3 turns.',
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
  description: 'On kill, restore 12% of max HP.',
  iconUrl: '/assets/runes/triumph.png',
  path: RunePath.Precision,
  row: 1,
  condition: { type: RuneConditionType.OnKill },
  bonus: {
    modifiers: [{ stat: 'hp', value: 0.12, type: 'percent' }],
    duration: 1,
    stacks: false,
    maxStacks: 1,
  },
};

const LEGEND_ALACRITY: RuneDefinition = {
  id: 'legend_alacrity',
  name: 'Legend: Alacrity',
  description: 'Gain +3% SPD permanently on each kill (max 10 stacks).',
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
  description: '+12% ATK when HP is below 40%.',
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
  description: 'After casting 3 abilities, deal 40 bonus magic damage on next hit.',
  iconUrl: '/assets/runes/electrocute.png',
  path: RunePath.Domination,
  row: 0,
  condition: { type: RuneConditionType.OnAbilityCast, threshold: 3 },
  bonus: {
    modifiers: [{ stat: 'ap', value: 40, type: 'flat' }],
    duration: 1,
    stacks: false,
    maxStacks: 1,
  },
};

const SUDDEN_IMPACT: RuneDefinition = {
  id: 'sudden_impact',
  name: 'Sudden Impact',
  description: 'After casting an ability, +8 flat ATK for 2 turns.',
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
  description: 'Permanently gain +2 AP per kill (max 10 stacks).',
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
  description: 'On kill, gain +4% ATK permanently (max 5 stacks).',
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
  description: 'At battle start, gain +20 AP for 2 turns.',
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
  description: 'Every 5 turns, gain +15 AP permanently (max 4 stacks).',
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
  description: 'Every 8 turns, gain +10% AP permanently.',
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
  description: '+18 AP when HP is above 70%.',
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
  description: 'Every 4 turns, gain +5 DEF and +30 HP permanently.',
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
  description: 'At battle start, gain +10 DEF for 3 turns.',
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
  description: 'On kill, gain +20 HP permanently (max 10 stacks).',
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
  description: '+15% DEF when HP is below 40%.',
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
  description: 'Every 3 turns, gain +8% crit for 2 turns.',
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
  description: 'At battle start, gain +3 SPD for 2 turns.',
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
  description: 'While buffed, gain +5% to all stats.',
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
  description: 'When affected by CC, gain +20% DEF.',
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
