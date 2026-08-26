const RUNE_COPY_EN: Readonly<Record<string, { name: string; description: string }>> = {
  press_the_attack: {
    name: 'Press the Attack',
    description: 'After dealing damage 3 times, gain +15% ATK for 3 turns.',
  },
  triumph: { name: 'Triumph', description: 'After an elimination, restore 12% of maximum HP.' },
  legend_alacrity: {
    name: 'Legend: Alacrity',
    description: 'Each elimination permanently grants +3% SPD, up to 10 stacks.',
  },
  last_stand: { name: 'Last Stand', description: 'Gain +12% ATK while below 40% HP.' },
  electrocute: {
    name: 'Electrocute',
    description: 'Hitting the same target 3 times deals bonus magic damage.',
  },
  sudden_impact: {
    name: 'Sudden Impact',
    description: 'After using an ability, gain bonus penetration for 2 turns.',
  },
  eyeball_collection: {
    name: 'Eyeball Collection',
    description: 'Each elimination grants a permanent bonus to damage.',
  },
  ravenous_hunter: { name: 'Ravenous Hunter', description: 'Heal for a portion of damage dealt.' },
  summon_aery: {
    name: 'Summon Aery',
    description: 'Abilities send Aery to damage enemies or shield allies.',
  },
  manaflow_band: {
    name: 'Manaflow Band',
    description: 'Abilities permanently increase maximum mana, up to the limit.',
  },
  transcendence: {
    name: 'Transcendence',
    description: 'Gain ability haste as your champion levels up.',
  },
  scorch: {
    name: 'Scorch',
    description: 'Your next ability hit burns the target for bonus magic damage.',
  },
  grasp_of_the_undying: {
    name: 'Grasp of the Undying',
    description: 'After preparing in combat, your next attack deals bonus damage and heals you.',
  },
  conditioning: { name: 'Conditioning', description: 'After several turns, gain bonus defenses.' },
  overgrowth: {
    name: 'Overgrowth',
    description: 'Nearby enemy deaths permanently increase maximum HP.',
  },
  revitalize: {
    name: 'Revitalize',
    description: 'Increase healing and shielding, with a stronger effect on low-health allies.',
  },
  glacial_augment: {
    name: 'Glacial Augment',
    description: 'Immobilizing an enemy creates slowing rays around them.',
  },
  hextech_flash: {
    name: 'Hextech Flashtraption',
    description: 'Flash is replaced by a charged teleport while on cooldown.',
  },
  cosmic_insight: {
    name: 'Cosmic Insight',
    description: 'Gain haste for summoner spells and items.',
  },
  time_warp_tonic: {
    name: 'Time Warp Tonic',
    description: 'Potions and elixirs restore part of their effect immediately.',
  },
  e2e_assured_victory: {
    name: 'E2E — Assured Victory',
    description: 'Test-only rune that assures victory.',
  },
};

export function runeNameEn(runeId: string, fallback = runeId): string {
  return RUNE_COPY_EN[runeId]?.name ?? fallback;
}

export function runeDescriptionEn(runeId: string, fallback: string): string {
  return RUNE_COPY_EN[runeId]?.description ?? fallback;
}
