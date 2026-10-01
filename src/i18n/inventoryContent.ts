export type InventoryContentLocale = 'fr-FR' | 'en-US';

export type InventoryNamedCopy = Readonly<{
  name: string;
  description: string;
}>;

export type ItemContentCopy = InventoryNamedCopy &
  Readonly<{
    passives: Readonly<Record<string, InventoryNamedCopy>>;
  }>;

export type InventoryContentCatalog = Readonly<{
  items: Readonly<Record<string, ItemContentCopy>>;
  augments: Readonly<Record<string, InventoryNamedCopy>>;
  runes: Readonly<Record<string, InventoryNamedCopy>>;
  fallbacks: Readonly<{
    item: InventoryNamedCopy;
    passive: InventoryNamedCopy;
    augment: InventoryNamedCopy;
    rune: InventoryNamedCopy;
  }>;
}>;

const frFR = {
  items: {
    long_sword: {
      name: 'Épée longue',
      description: "Une lame simple qui augmente les dégâts d'attaque.",
      passives: {},
    },
    amplifying_tome: {
      name: "Tome d'amplification",
      description: 'Un tome magique qui augmente la puissance.',
      passives: {},
    },
    cloth_armor: {
      name: 'Armure de tissu',
      description: 'Une protection légère qui augmente la défense.',
      passives: {},
    },
    ruby_crystal: {
      name: 'Cristal de rubis',
      description: 'Un cristal rayonnant qui augmente la vitalité.',
      passives: {},
    },
    boots: {
      name: 'Bottes',
      description: 'Des chaussures qui augmentent la vitesse.',
      passives: {},
    },
    dagger: {
      name: 'Dague',
      description: 'Une lame légère qui augmente les chances de coup critique.',
      passives: {},
    },
    bf_sword: {
      name: 'Glaive B. F.',
      description: "Une lame massive qui augmente fortement les dégâts d'attaque.",
      passives: {},
    },
    infinity_edge: {
      name: "Lame d'infini",
      description: 'Augmente fortement les dégâts des coups critiques.',
      passives: {
        ie_passive: {
          name: 'Perfection',
          description: 'Les coups critiques infligent 35 % de dégâts supplémentaires.',
        },
      },
    },
    rabaddons_deathcap: {
      name: 'Coiffe de Rabadon',
      description: 'Augmente fortement la puissance.',
      passives: {
        rabadons_passive: {
          name: 'Œuvre magique',
          description: 'Augmente la puissance totale de 35 %.',
        },
      },
    },
    sunfire_aegis: {
      name: 'Égide solaire',
      description: 'Brûle les ennemis proches et renforce les défenses.',
      passives: {
        sunfire_passive: {
          name: 'Immolations',
          description: 'Inflige 15 dégâts magiques à tous les ennemis à chaque tour.',
        },
      },
    },
    guardian_angel: {
      name: 'Ange gardien',
      description: 'Réanime son porteur avec 30 % de ses PV.',
      passives: {
        ga_passive: {
          name: 'Renaissance',
          description: 'Après des dégâts mortels, revient avec 30 % de ses PV.',
        },
      },
    },
    bloodthirster: {
      name: 'Soif-de-sang',
      description: 'Confère du vol de vie aux attaques.',
      passives: {
        bt_passive: {
          name: 'Drain de sang',
          description: 'Récupère 18 % des dégâts infligés sous forme de PV.',
        },
      },
    },
    spirit_visage: {
      name: 'Visage spirituel',
      description: 'Augmente tous les soins reçus.',
      passives: {
        sv_passive: {
          name: 'Vitalité absolue',
          description: 'Augmente de 25 % tous les soins et boucliers reçus.',
        },
      },
    },
    health_potion: {
      name: 'Potion de soin',
      description: 'Restaure 150 PV en 3 tours.',
      passives: {
        hp_pot_passive: {
          name: 'Gorgée',
          description: 'Restaure 50 PV par tour pendant 3 tours.',
        },
      },
    },
    elixir_of_wrath: {
      name: 'Élixir de colère',
      description: "Augmente temporairement les dégâts d'attaque.",
      passives: {
        elixir_wrath_passive: {
          name: 'Colère',
          description: "Confère +30 dégâts d'attaque pendant le combat.",
        },
      },
    },
  },
  augments: {
    brute_force: {
      name: 'Force brute',
      description: "Tous les champions gagnent +7 dégâts d'attaque.",
    },
    iron_skin: {
      name: 'Peau de fer',
      description: 'Tous les champions gagnent +5 défense.',
    },
    arcane_mind: {
      name: 'Esprit arcanique',
      description: 'Tous les champions gagnent +7 puissance.',
    },
    vitality_boost: {
      name: 'Regain de vitalité',
      description: 'Tous les champions gagnent +90 PV.',
    },
    swift_feet: {
      name: 'Pied léger',
      description: 'Tous les champions gagnent +12 vitesse.',
    },
    critical_focus: {
      name: 'Concentration critique',
      description: 'Tous les champions gagnent 10 % de chances de coup critique.',
    },
    golden_touch: {
      name: "Toucher d'or",
      description: 'Gagne 20 pièces d’or supplémentaires après chaque combat.',
    },
    field_medic: {
      name: 'Médecin de terrain',
      description: 'Soigne tous les champions de 10 % de leurs PV max après chaque combat.',
    },
    warlord: {
      name: 'Seigneur de guerre',
      description: "Tous les champions gagnent 15 % de dégâts d'attaque.",
    },
    bulwark: {
      name: 'Rempart',
      description: 'Tous les champions gagnent 15 % de défense.',
    },
    sorcery_supreme: {
      name: 'Sorcellerie suprême',
      description: 'Tous les champions gagnent 15 % de puissance.',
    },
    glass_cannon: {
      name: 'Canon de verre',
      description:
        "Tous les champions gagnent 15 % de dégâts d'attaque mais perdent 8 % de défense.",
    },
    fortune: {
      name: 'Fortune',
      description: 'Gagne 40 pièces d’or supplémentaires après chaque combat.',
    },
    battle_hardened: {
      name: 'Aguerri',
      description:
        "Tous les champions gagnent +5 dégâts d'attaque et +5 défense par biome terminé.",
    },
    divine_blessing: {
      name: 'Bénédiction divine',
      description:
        "Tous les champions gagnent 23 % de dégâts d'attaque, de défense et de puissance.",
    },
    phoenix_heart: {
      name: 'Cœur du phénix',
      description: 'Le premier champion éliminé à chaque combat revient avec 50 % de ses PV.',
    },
    hyper_carry: {
      name: 'Porteur suprême',
      description: 'Tous les champions infligent 25 % de dégâts supplémentaires.',
    },
    unstoppable: {
      name: 'Inarrêtable',
      description: 'Tous les champions subissent 22 % de dégâts en moins.',
    },
    golden_age: {
      name: "Âge d'or",
      description: 'Gagne 70 pièces d’or après chaque combat et réduit le prix des objets de 10 %.',
    },
  },
  runes: {
    press_the_attack: {
      name: 'Attaque soutenue',
      description: 'Après avoir infligé des dégâts 3 fois, gagne +15 % ATQ pendant 3 tours.',
    },
    triumph: {
      name: 'Triomphe',
      description: 'Après une élimination, récupère 12 % des PV maximum.',
    },
    legend_alacrity: {
      name: 'Légende : alacrité',
      description: 'Chaque élimination confère définitivement +3 % VIT (10 cumuls maximum).',
    },
    last_stand: {
      name: "Baroud d'honneur",
      description: '+12 % ATQ lorsque les PV sont inférieurs à 40 %.',
    },
    electrocute: {
      name: 'Électrocution',
      description:
        'Après 3 compétences lancées, la prochaine attaque inflige 40 dégâts magiques supplémentaires.',
    },
    sudden_impact: {
      name: 'Ruée offensive',
      description: 'Après une compétence lancée, gagne +8 ATQ pendant 2 tours.',
    },
    eyeball_collection: {
      name: "Arracheur d'œil",
      description: 'Chaque élimination confère définitivement +2 PUI (10 cumuls maximum).',
    },
    ravenous_hunter: {
      name: 'Chasseur vorace',
      description: 'Chaque élimination confère définitivement +4 % ATQ (5 cumuls maximum).',
    },
    summon_aery: {
      name: "Invocation d'Aery",
      description: 'Au début du combat, gagne +20 PUI pendant 2 tours.',
    },
    manaflow_band: {
      name: 'Ruban de mana',
      description: 'Tous les 5 tours, gagne définitivement +15 PUI (4 cumuls maximum).',
    },
    transcendence: {
      name: 'Transcendance',
      description: 'Tous les 8 tours, gagne définitivement +10 % PUI.',
    },
    scorch: {
      name: 'Brûlure',
      description: '+18 PUI lorsque les PV sont supérieurs à 70 %.',
    },
    grasp_of_the_undying: {
      name: "Poigne de l'immortel",
      description: 'Tous les 4 tours, gagne +2 DEF et +15 PV pour ce combat (5 fois maximum).',
    },
    conditioning: {
      name: 'Conditionnement',
      description: 'Au début du combat, gagne +10 DEF pendant 3 tours.',
    },
    overgrowth: {
      name: 'Surcroissance',
      description: 'Chaque élimination confère définitivement +20 PV (10 cumuls maximum).',
    },
    revitalize: {
      name: 'Revitalisation',
      description: '+15 % DEF lorsque les PV sont inférieurs à 40 %.',
    },
    glacial_augment: {
      name: 'Optimisation glaciale',
      description: 'Tous les 3 tours, gagne +8 % de critique pendant 2 tours.',
    },
    hextech_flash: {
      name: 'Canaliportation Hextech',
      description: 'Au début du combat, gagne +3 VIT pendant 2 tours.',
    },
    cosmic_insight: {
      name: 'Savoir cosmique',
      description: "Sous l'effet d'un bonus, gagne +5 % à toutes les statistiques.",
    },
    time_warp_tonic: {
      name: 'Philtre de chronodistorsion',
      description: 'Sous contrôle de foule, gagne +20 % DEF.',
    },
    e2e_assured_victory: {
      name: 'E2E — Victoire assurée',
      description: 'Fixture de test : multiplie fortement les statistiques au début du combat.',
    },
  },
  fallbacks: {
    item: { name: 'Objet inconnu', description: 'Description de cet objet indisponible.' },
    passive: { name: 'Passif inconnu', description: 'Description de ce passif indisponible.' },
    augment: {
      name: 'Amélioration inconnue',
      description: 'Description de cette amélioration indisponible.',
    },
    rune: { name: 'Rune inconnue', description: 'Description de cette rune indisponible.' },
  },
} as const satisfies InventoryContentCatalog;

type MatchingLocaleCatalog<T extends InventoryContentCatalog> = Readonly<{
  items: Readonly<{
    [ItemId in keyof T['items']]: InventoryNamedCopy &
      Readonly<{
        passives: Readonly<{
          [PassiveId in keyof T['items'][ItemId]['passives']]: InventoryNamedCopy;
        }>;
      }>;
  }>;
  augments: Readonly<{
    [AugmentId in keyof T['augments']]: InventoryNamedCopy;
  }>;
  runes: Readonly<{
    [RuneId in keyof T['runes']]: InventoryNamedCopy;
  }>;
  fallbacks: Readonly<{
    [FallbackId in keyof T['fallbacks']]: InventoryNamedCopy;
  }>;
}>;

const enUS = {
  items: {
    long_sword: {
      name: 'Long Sword',
      description: 'A simple blade that increases attack damage.',
      passives: {},
    },
    amplifying_tome: {
      name: 'Amplifying Tome',
      description: 'A magic tome that increases ability power.',
      passives: {},
    },
    cloth_armor: {
      name: 'Cloth Armor',
      description: 'Light protection that increases defense.',
      passives: {},
    },
    ruby_crystal: {
      name: 'Ruby Crystal',
      description: 'A radiant crystal that increases health.',
      passives: {},
    },
    boots: {
      name: 'Boots',
      description: 'Shoes that increase speed.',
      passives: {},
    },
    dagger: {
      name: 'Dagger',
      description: 'A light blade that increases critical strike chance.',
      passives: {},
    },
    bf_sword: {
      name: 'B. F. Sword',
      description: 'A massive blade that greatly increases attack damage.',
      passives: {},
    },
    infinity_edge: {
      name: 'Infinity Edge',
      description: 'Greatly increases critical strike damage.',
      passives: {
        ie_passive: {
          name: 'Perfection',
          description: 'Critical strikes deal 35% additional damage.',
        },
      },
    },
    rabaddons_deathcap: {
      name: "Rabadon's Deathcap",
      description: 'Greatly increases ability power.',
      passives: {
        rabadons_passive: {
          name: 'Magical Opus',
          description: 'Increases total ability power by 35%.',
        },
      },
    },
    sunfire_aegis: {
      name: 'Sunfire Aegis',
      description: 'Burns nearby enemies and strengthens defenses.',
      passives: {
        sunfire_passive: {
          name: 'Immolate',
          description: 'Deals 15 magic damage to all enemies each turn.',
        },
      },
    },
    guardian_angel: {
      name: 'Guardian Angel',
      description: 'Revives its wielder with 30% of their HP.',
      passives: {
        ga_passive: {
          name: 'Rebirth',
          description: 'After taking lethal damage, revives with 30% HP.',
        },
      },
    },
    bloodthirster: {
      name: 'Bloodthirster',
      description: 'Grants lifesteal on attacks.',
      passives: {
        bt_passive: {
          name: 'Blood Drain',
          description: 'Restores 18% of damage dealt as HP.',
        },
      },
    },
    spirit_visage: {
      name: 'Spirit Visage',
      description: 'Increases all healing received.',
      passives: {
        sv_passive: {
          name: 'Boundless Vitality',
          description: 'Increases all healing and shielding received by 25%.',
        },
      },
    },
    health_potion: {
      name: 'Health Potion',
      description: 'Restores 150 HP over 3 turns.',
      passives: {
        hp_pot_passive: {
          name: 'Sip',
          description: 'Restores 50 HP per turn for 3 turns.',
        },
      },
    },
    elixir_of_wrath: {
      name: 'Elixir of Wrath',
      description: 'Temporarily increases attack damage.',
      passives: {
        elixir_wrath_passive: {
          name: 'Wrath',
          description: 'Grants +30 attack damage for the duration of combat.',
        },
      },
    },
  },
  augments: {
    brute_force: {
      name: 'Brute Force',
      description: 'All champions gain +7 attack damage.',
    },
    iron_skin: {
      name: 'Iron Skin',
      description: 'All champions gain +5 defense.',
    },
    arcane_mind: {
      name: 'Arcane Mind',
      description: 'All champions gain +7 ability power.',
    },
    vitality_boost: {
      name: 'Vitality Boost',
      description: 'All champions gain +90 HP.',
    },
    swift_feet: {
      name: 'Swift Feet',
      description: 'All champions gain +12 speed.',
    },
    critical_focus: {
      name: 'Critical Focus',
      description: 'All champions gain 10% critical strike chance.',
    },
    golden_touch: {
      name: 'Golden Touch',
      description: 'Gain 20 extra gold after each combat.',
    },
    field_medic: {
      name: 'Field Medic',
      description: 'Heal all champions for 10% of their maximum HP after each combat.',
    },
    warlord: {
      name: 'Warlord',
      description: 'All champions gain 15% attack damage.',
    },
    bulwark: {
      name: 'Bulwark',
      description: 'All champions gain 15% defense.',
    },
    sorcery_supreme: {
      name: 'Supreme Sorcery',
      description: 'All champions gain 15% ability power.',
    },
    glass_cannon: {
      name: 'Glass Cannon',
      description: 'All champions gain 15% attack damage but lose 8% defense.',
    },
    fortune: {
      name: 'Fortune',
      description: 'Gain 40 extra gold after each combat.',
    },
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
    hyper_carry: {
      name: 'Hypercarry',
      description: 'All champions deal 25% more damage.',
    },
    unstoppable: {
      name: 'Unstoppable',
      description: 'All champions take 22% less damage.',
    },
    golden_age: {
      name: 'Golden Age',
      description: 'Gain 70 gold after each combat and reduce item prices by 10%.',
    },
  },
  runes: {
    press_the_attack: {
      name: 'Press the Attack',
      description: 'After dealing damage 3 times, gain +15% ATK for 3 turns.',
    },
    triumph: {
      name: 'Triumph',
      description: 'After a takedown, restore 12% of maximum HP.',
    },
    legend_alacrity: {
      name: 'Legend: Alacrity',
      description: 'Each takedown permanently grants +3% SPD (up to 10 stacks).',
    },
    last_stand: {
      name: 'Last Stand',
      description: 'Gain +12% ATK while below 40% HP.',
    },
    electrocute: {
      name: 'Electrocute',
      description: 'After casting 3 abilities, your next attack deals 40 bonus magic damage.',
    },
    sudden_impact: {
      name: 'Sudden Impact',
      description: 'After casting an ability, gain +8 ATK for 2 turns.',
    },
    eyeball_collection: {
      name: 'Eyeball Collection',
      description: 'Each takedown permanently grants +2 AP (up to 10 stacks).',
    },
    ravenous_hunter: {
      name: 'Ravenous Hunter',
      description: 'Each takedown permanently grants +4% ATK (up to 5 stacks).',
    },
    summon_aery: {
      name: 'Summon Aery',
      description: 'At the start of combat, gain +20 AP for 2 turns.',
    },
    manaflow_band: {
      name: 'Manaflow Band',
      description: 'Every 5 turns, permanently gain +15 AP (up to 4 stacks).',
    },
    transcendence: {
      name: 'Transcendence',
      description: 'Every 8 turns, permanently gain +10% AP.',
    },
    scorch: {
      name: 'Scorch',
      description: 'Gain +18 AP while above 70% HP.',
    },
    grasp_of_the_undying: {
      name: 'Grasp of the Undying',
      description: 'Every 4 turns, gain +2 DEF and +15 HP for this combat (up to 5 times).',
    },
    conditioning: {
      name: 'Conditioning',
      description: 'At the start of combat, gain +10 DEF for 3 turns.',
    },
    overgrowth: {
      name: 'Overgrowth',
      description: 'Each takedown permanently grants +20 HP (up to 10 stacks).',
    },
    revitalize: {
      name: 'Revitalize',
      description: 'Gain +15% DEF while below 40% HP.',
    },
    glacial_augment: {
      name: 'Glacial Augment',
      description: 'Every 3 turns, gain +8% critical strike chance for 2 turns.',
    },
    hextech_flash: {
      name: 'Hextech Flashtraption',
      description: 'At the start of combat, gain +3 SPD for 2 turns.',
    },
    cosmic_insight: {
      name: 'Cosmic Insight',
      description: 'While buffed, gain +5% to all stats.',
    },
    time_warp_tonic: {
      name: 'Time Warp Tonic',
      description: 'While crowd controlled, gain +20% DEF.',
    },
    e2e_assured_victory: {
      name: 'E2E — Assured Victory',
      description: 'Test fixture: greatly multiplies stats at the start of combat.',
    },
  },
  fallbacks: {
    item: { name: 'Unknown item', description: 'This item description is unavailable.' },
    passive: { name: 'Unknown passive', description: 'This passive description is unavailable.' },
    augment: { name: 'Unknown augment', description: 'This augment description is unavailable.' },
    rune: { name: 'Unknown rune', description: 'This rune description is unavailable.' },
  },
} as const satisfies MatchingLocaleCatalog<typeof frFR>;

export const inventoryContent: Readonly<Record<InventoryContentLocale, InventoryContentCatalog>> = {
  'fr-FR': frFR,
  'en-US': enUS,
};
