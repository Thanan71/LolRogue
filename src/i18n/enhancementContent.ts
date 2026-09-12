import type { GameplayStatKey } from '@/game/stats/statContract';

export type EnhancementContentLocale = 'fr-FR' | 'en-US';

export type EnhancementRoleContent = Readonly<{
  name: string;
}>;

export type EnhancementCopy = Readonly<{
  name: string;
  description: string;
}>;

export type EnhancementLockReasonContent = Readonly<{
  unavailable: Readonly<{ message: string; details: string }>;
  maxed: Readonly<{ message: string; details: (maximumRank: number) => string }>;
  masteryLevel: Readonly<{
    message: string;
    details: (requiredLevel: number, currentLevel: number) => string;
  }>;
  candies: Readonly<{
    message: string;
    details: (requiredCandies: number, currentCandies: number) => string;
  }>;
  prerequisite: Readonly<{
    message: string;
    details: (name: string, requiredLevel: number, candyCost: number) => string;
  }>;
}>;

export type EnhancementUiContent = Readonly<{
  treeTitle: (championName: string) => string;
  candyBalance: (candies: number) => string;
  masteryLevel: (level: number) => string;
  coreNodesTitle: string;
  ultimate: string;
  preview: string;
  maximum: string;
  maximumReached: string;
  saving: string;
  unlock: string;
  nextRank: (rank: number, maximumRank: number) => string;
  lockReasons: EnhancementLockReasonContent;
}>;

export type EnhancementStoreContent = Readonly<{
  loadError: string;
  nodeNotFound: string;
  accountRequired: string;
  secureCommandUnsupported: string;
  saveFailed: string;
  unlockSucceeded: (nodeName: string) => string;
  validation: Readonly<{
    unavailable: string;
    masteryLevel: (requiredLevel: number) => string;
    candies: (requiredCandies: number) => string;
    maxed: string;
    prerequisite: string;
    fallback: string;
  }>;
}>;

export type EnhancementValidationReason =
  | Readonly<{ code: 'unavailable' }>
  | Readonly<{ code: 'mastery_level'; requiredLevel: number }>
  | Readonly<{ code: 'candies'; requiredCandies: number }>
  | Readonly<{ code: 'maxed' }>
  | Readonly<{ code: 'prerequisite' }>
  | Readonly<{ code: 'fallback' }>;

export type EnhancementContentCatalog = Readonly<{
  roles: Readonly<Record<string, EnhancementRoleContent>>;
  ui: EnhancementUiContent;
  store: EnhancementStoreContent;
  masteryUnlocks: Readonly<Record<string, EnhancementCopy>>;
  statLabels: Readonly<Record<GameplayStatKey, string>>;
  branches: Readonly<Record<string, EnhancementCopy>>;
  coreNodes: Readonly<Record<string, EnhancementCopy>>;
  nodes: Readonly<Record<string, EnhancementCopy>>;
}>;

const frFR = {
  roles: {
    Assassin: { name: 'Assassin' },
    Tank: { name: 'Tank' },
    Mage: { name: 'Mage' },
    Marksman: { name: 'Tireur' },
    Fighter: { name: 'Combattant' },
    Support: { name: 'Support' },
  },
  ui: {
    treeTitle: (championName: string) => `Arbre d'Amélioration - ${championName}`,
    candyBalance: (candies: number) => `${candies.toLocaleString('fr-FR')} 🍬`,
    masteryLevel: (level: number) => `Maîtrise: Niveau ${level.toLocaleString('fr-FR')}`,
    coreNodesTitle: '⚡ Nœuds de Base',
    ultimate: 'ULTIME',
    preview: 'Aperçu des statistiques après déblocage',
    maximum: 'MAXIMUM',
    maximumReached: 'Maximum atteint',
    saving: 'Enregistrement…',
    unlock: 'Débloquer',
    nextRank: (rank: number, maximumRank: number) =>
      `Niv ${rank.toLocaleString('fr-FR')}/${maximumRank.toLocaleString('fr-FR')}`,
    lockReasons: {
      unavailable: {
        message: 'Indisponible dans ce mode',
        details: "Cette amélioration n'est pas disponible dans le moteur de combat actuel",
      },
      maxed: {
        message: 'Maximum atteint',
        details: (maximumRank: number) =>
          `Ce nœud est déjà au niveau maximum (${maximumRank.toLocaleString('fr-FR')}/${maximumRank.toLocaleString('fr-FR')})`,
      },
      masteryLevel: {
        message: 'Niveau de maîtrise insuffisant',
        details: (requiredLevel: number, currentLevel: number) =>
          `Requis: Niveau ${requiredLevel.toLocaleString('fr-FR')} (actuel: Niveau ${currentLevel.toLocaleString('fr-FR')})`,
      },
      candies: {
        message: 'Bonbons insuffisants',
        details: (requiredCandies: number, currentCandies: number) =>
          `Requis: ${requiredCandies.toLocaleString('fr-FR')} 🍬 (actuel: ${currentCandies.toLocaleString('fr-FR')} 🍬)`,
      },
      prerequisite: {
        message: 'Prérequis non débloqué',
        details: (name: string, requiredLevel: number, candyCost: number) => {
          const mastery =
            requiredLevel > 0 ? ` (Maîtrise ${requiredLevel.toLocaleString('fr-FR')} requise)` : '';
          return `📌 ${name}${mastery} - ${candyCost.toLocaleString('fr-FR')} 🍬`;
        },
      },
    },
  },
  store: {
    loadError: 'Impossible de charger la maîtrise et les améliorations.',
    nodeNotFound: 'Amélioration introuvable.',
    accountRequired: 'Les améliorations permanentes nécessitent un compte.',
    secureCommandUnsupported: 'Ce navigateur ne permet pas de sécuriser la commande.',
    saveFailed: "Échec de l'enregistrement de l'amélioration.",
    unlockSucceeded: (nodeName: string) => `${nodeName} a bien été amélioré.`,
    validation: {
      unavailable: "Cette amélioration n'est pas disponible dans le moteur de combat actuel",
      masteryLevel: (requiredLevel: number) =>
        `Niveau de maîtrise requis: ${requiredLevel.toLocaleString('fr-FR')}`,
      candies: (requiredCandies: number) =>
        `Bonbons insuffisants : ${requiredCandies.toLocaleString('fr-FR')} requis`,
      maxed: 'Ce nœud est déjà au maximum',
      prerequisite: 'Prérequis non débloqués',
      fallback: 'Impossible de débloquer ce nœud.',
    },
  },
  masteryUnlocks: {
    roster_offer_7: {
      name: 'Sélection élargie',
      description: 'Ajoute un champion au choix de départ, sans agrandir l’équipe.',
    },
    starter_reroll_1: {
      name: 'Relance de sélection',
      description: 'Accorde une relance du choix de départ, sans avantage en combat.',
    },
  },
  statLabels: {
    hp: 'Points de vie',
    mp: 'Points de mana',
    moveSpeed: 'Vitesse de déplacement',
    armor: 'Armure',
    magicResist: 'Résistance magique',
    attackDamage: "Dégâts d'attaque",
    attackSpeed: "Initiative d'attaque",
    attackRange: 'Profil de portée',
    abilityPower: 'Puissance',
    hpRegen: 'Régénération PV',
    mpRegen: 'Régénération PM',
    crit: 'Chance de critique',
    armorPen: "Pénétration d'armure",
    magicPen: 'Pénétration magique',
    lifesteal: 'Vol de vie',
    omnivamp: 'Omnivampirisme',
    tenacity: 'Ténacité',
    abilityHaste: 'Hâte de compétence',
  },
  branches: {
    assassin_burst: {
      name: 'Dégâts explosifs',
      description: 'Dégâts explosifs instantanés',
    },
    assassin_mobility: {
      name: 'Mobilité',
      description: 'Mouvement et esquive',
    },
    assassin_sustain: {
      name: 'Survie',
      description: 'Vol de vie et esquive',
    },
    tank_defense: {
      name: 'Forteresse',
      description: 'Défense ultime',
    },
    tank_support: {
      name: 'Protecteur',
      description: 'Protection des alliés',
    },
    tank_thorn: {
      name: 'Épines',
      description: 'Renvoi de dégâts',
    },
    mage_burst: {
      name: 'Dégâts explosifs',
      description: 'Dégâts magiques explosifs',
    },
    mage_control: {
      name: 'Contrôle',
      description: 'Contrôle et zone',
    },
    mage_sustain: {
      name: 'Soutien',
      description: 'Mana et régénération',
    },
    marksman_dps: {
      name: 'Dégâts soutenus',
      description: 'Dégâts continus',
    },
    marksman_range: {
      name: 'Tir tactique',
      description: 'Positionnement et dégâts directs',
    },
    marksman_survival: {
      name: 'Survie',
      description: 'Esquive et mobilité',
    },
    fighter_bruiser: {
      name: 'Brute',
      description: 'Dégâts et résistance',
    },
    fighter_duelist: {
      name: 'Duelliste',
      description: 'Duel et contre-attaque',
    },
    fighter_sustain: {
      name: 'Régénération',
      description: 'Vol de vie et endurance',
    },
    support_enchanter: {
      name: 'Enchanteur',
      description: 'Renforcements et soins',
    },
    support_tanky: {
      name: 'Gardien',
      description: 'Protection et contrôle',
    },
    support_utility: {
      name: 'Utilitaire',
      description: 'Vision et contrôle',
    },
  },
  coreNodes: {
    assassin_core_1: {
      name: 'Griffes Aiguisées',
      description: "+5 Dégâts d'attaque",
    },
    assassin_core_2: {
      name: 'Agilité',
      description: '+3 % Vitesse de déplacement',
    },
    assassin_core_3: {
      name: 'Pénétration',
      description: "+4 Pénétration d'armure",
    },
    tank_core_1: {
      name: 'Armure Renforcée',
      description: '+15 PV, +2 Armure',
    },
    tank_core_2: {
      name: 'Résistance Magique',
      description: '+3 Résistance magique',
    },
    tank_core_3: {
      name: 'Vitalité',
      description: '+25 PV, +2 Régénération PV',
    },
    mage_core_1: {
      name: 'Étincelle Arcane',
      description: '+5 Puissance',
    },
    mage_core_2: {
      name: 'Hâte',
      description: "+5 Hâte d'habileté",
    },
    mage_core_3: {
      name: 'Pénétration Magique',
      description: '+4 Pénétration magique',
    },
    marksman_core_1: {
      name: 'Précision',
      description: "+5 Dégâts d'attaque",
    },
    marksman_core_2: {
      name: 'Cadence',
      description: "+8 % d'initiative d'attaque",
    },
    marksman_core_3: {
      name: 'Critique',
      description: '+5 % Chances de coup critique',
    },
    fighter_core_1: {
      name: 'Force',
      description: "+10 PV, +3 Dégâts d'attaque",
    },
    fighter_core_2: {
      name: 'Endurance',
      description: '+5 Armure',
    },
    fighter_core_3: {
      name: 'Fureur',
      description: "+5 % d'initiative d'attaque",
    },
    support_core_1: {
      name: 'Bénédiction',
      description: '+15 PV, +3 Puissance',
    },
    support_core_2: {
      name: 'Garde',
      description: '+3 Armure, +3 Résistance magique',
    },
    support_core_3: {
      name: 'Hâte de Soutien',
      description: "+8 Hâte d'habileté",
    },
  },
  nodes: {
    assassin_burst_1: {
      name: 'Frappe Critique',
      description: '+8 % Chances de coup critique',
    },
    assassin_burst_2: {
      name: 'Exécution',
      description: '+10 % de dégâts contre les cibles en dessous de 40 % PV',
    },
    assassin_burst_3: {
      name: 'Mort Subite',
      description: 'Ultime : dégâts explosifs augmentés de 20 %',
    },
    assassin_mobility_1: {
      name: 'Pas Furtif',
      description: '+5 % Vitesse de déplacement hors combat',
    },
    assassin_mobility_2: {
      name: 'Embuscade',
      description: '+15 % de dégâts depuis les broussailles ou hors de vue',
    },
    assassin_mobility_3: {
      name: 'Ombre',
      description: 'Ultime : devient invisible pendant 1,5 s après une élimination',
    },
    assassin_sustain_1: {
      name: 'Soif de Sang',
      description: '+5 % Vol de vie',
    },
    assassin_sustain_2: {
      name: 'Vampirisme',
      description: '+3 % Omnivampirisme',
    },
    assassin_sustain_3: {
      name: 'Phénix',
      description:
        'Ultime : en dessous de 20 % PV, gagne un bouclier de 200 PV (60 s de récupération)',
    },
    tank_defense_1: {
      name: 'Peau Épaisse',
      description: '+5 Armure, +5 Résistance magique',
    },
    tank_defense_2: {
      name: 'Ténacité',
      description: '+10 % Ténacité (réduction des contrôles)',
    },
    tank_defense_3: {
      name: 'Immortel',
      description:
        'Ultime : quand les PV tombent à 0, reste à 1 PV avec une immunité de 2 s (120 s de récupération)',
    },
    tank_support_1: {
      name: "Bouclier d'Allié",
      description: "Les soins reçus sont partagés à 20 % avec l'allié le plus proche",
    },
    tank_support_2: {
      name: 'Gardien',
      description: '+10 % de réduction des dégâts subis par les alliés proches',
    },
    tank_support_3: {
      name: 'Sacrifice',
      description:
        'Ultime : peut intercepter les dégâts dirigés vers un allié (90 s de récupération)',
    },
    tank_thorn_1: {
      name: 'Pointes',
      description: 'Renvoie 5 % des dégâts physiques reçus aux attaquants',
    },
    tank_thorn_2: {
      name: 'Brûlure',
      description:
        'Les attaques contre vous infligent à leur auteur 2 % de ses PV maximum en dégâts magiques',
    },
    tank_thorn_3: {
      name: 'Vengeance',
      description:
        'Ultime : après avoir subi 500 dégâts, renvoie 50 dégâts bruts à tous les ennemis proches',
    },
    mage_burst_1: {
      name: 'Concentration',
      description: '+8 Puissance',
    },
    mage_burst_2: {
      name: 'Combustion',
      description: '+15 % de dégâts magiques',
    },
    mage_burst_3: {
      name: 'Tempête Arcane',
      description: 'Ultime : les compétences de zone ont 20 % de chances de se répéter',
    },
    mage_control_1: {
      name: 'Ralentissement',
      description: 'Les sorts appliquent 15 % de ralentissement pendant 1 s',
    },
    mage_control_2: {
      name: 'Canalisation',
      description: '+10 de hâte de compétence',
    },
    mage_control_3: {
      name: 'Racines',
      description: "Ultime : 20 % de chances qu'un sort enracine la cible pendant 1 s",
    },
    mage_sustain_1: {
      name: 'Clarté',
      description: '+20 PM, +3 Régénération PM',
    },
    mage_sustain_2: {
      name: 'Flux de Mana',
      description: 'Les éliminations de sbires restaurent 5 PM',
    },
    mage_sustain_3: {
      name: 'Présence Éternelle',
      description: 'Ultime : réduit les délais de récupération ultimes de 20 %',
    },
    marksman_dps_1: {
      name: 'Létalité',
      description: "+5 Pénétration d'armure",
    },
    marksman_dps_2: {
      name: 'Frappe Fantôme',
      description: "+10 % d'initiative d'attaque pendant 3 tours après une élimination",
    },
    marksman_dps_3: {
      name: 'Tir Déchirant',
      description:
        "Ultime : les attaques ont 15 % de chances d'infliger des saignements (5 % des PV maximum sur 3 s)",
    },
    marksman_range_1: {
      name: 'Position haute',
      description: '+5 vitesse de déplacement',
    },
    marksman_range_2: {
      name: 'Tir précis',
      description: '+8 % de dégâts contre les champions',
    },
    marksman_range_3: {
      name: "Tireur d'élite",
      description: 'Ultime : +15 % de dégâts contre les cibles sous 40 % PV',
    },
    marksman_survival_1: {
      name: 'Esquive',
      description: "+3 % de chances d'esquiver une attaque",
    },
    marksman_survival_2: {
      name: "Rapide comme l'Éclair",
      description: '+8 % de vitesse de déplacement',
    },
    marksman_survival_3: {
      name: 'Brouillard de Fumée',
      description:
        'Ultime : quand les PV tombent en dessous de 30 %, devient invisible pendant 1,5 s et gagne +30 % de vitesse (90 s de récupération)',
    },
    fighter_bruiser_1: {
      name: 'Frappe Lourde',
      description: '+5 % de dégâts',
    },
    fighter_bruiser_2: {
      name: 'Saignée',
      description: 'Les attaques appliquent des saignements (3 % des PV maximum sur 2 s)',
    },
    fighter_bruiser_3: {
      name: 'Furie',
      description: 'Ultime : en dessous de 50 % PV, +20 % de dégâts',
    },
    fighter_duelist_1: {
      name: 'Riposte',
      description: 'Après une esquive, la prochaine attaque inflige +20 % de dégâts',
    },
    fighter_duelist_2: {
      name: 'Défi',
      description: '+10 % de dégâts contre les champions ennemis',
    },
    fighter_duelist_3: {
      name: 'Mort ou Vif',
      description:
        'Ultime : en duel contre un champion, +25 % de dégâts et +15 % de réduction des dégâts',
    },
    fighter_sustain_1: {
      name: 'Vol de Vie',
      description: '+4 % Vol de vie',
    },
    fighter_sustain_2: {
      name: 'Récupération',
      description: '+5 Régénération PV',
    },
    fighter_sustain_3: {
      name: 'Immortalité',
      description: 'Ultime : les éliminations restaurent 20 % des PV maximum',
    },
    support_enchanter_1: {
      name: 'Soin Amélioré',
      description: '+10 % de puissance des soins',
    },
    support_enchanter_2: {
      name: 'Bouclier',
      description: 'Les boucliers appliqués sont 15 % plus puissants',
    },
    support_enchanter_3: {
      name: 'Aura Divine',
      description: 'Ultime : les alliés proches gagnent +10 % à tous leurs dégâts',
    },
    support_tanky_1: {
      name: 'Corps Garde',
      description: '+20 PV, +5 Armure',
    },
    support_tanky_2: {
      name: 'Entrave',
      description: 'Les effets de contrôle durent 10 % plus longtemps',
    },
    support_tanky_3: {
      name: 'Sacrifice Ultime',
      description:
        'Ultime : peut absorber les dégâts mortels dirigés vers un allié (120 s de récupération)',
    },
    support_utility_1: {
      name: 'Vision',
      description: 'Détection automatique des ennemis dans les broussailles proches',
    },
    support_utility_2: {
      name: 'Entrave de Zone',
      description: 'Les sorts de zone ralentissent de 20 % supplémentaires',
    },
    support_utility_3: {
      name: 'Contrôle Total',
      description: 'Ultime : les effets de contrôle affectent une zone plus large (+30 %)',
    },
  },
} as const satisfies EnhancementContentCatalog;

type MatchingEnhancementContent<T extends EnhancementContentCatalog> = Readonly<{
  roles: Readonly<{
    [RoleId in keyof T['roles']]: EnhancementRoleContent;
  }>;
  ui: EnhancementUiContent;
  store: EnhancementStoreContent;
  masteryUnlocks: Readonly<{
    [UnlockId in keyof T['masteryUnlocks']]: EnhancementCopy;
  }>;
  statLabels: Readonly<{
    [StatId in keyof T['statLabels']]: string;
  }>;
  branches: Readonly<{
    [BranchId in keyof T['branches']]: EnhancementCopy;
  }>;
  coreNodes: Readonly<{
    [NodeId in keyof T['coreNodes']]: EnhancementCopy;
  }>;
  nodes: Readonly<{
    [NodeId in keyof T['nodes']]: EnhancementCopy;
  }>;
}>;

const enUS = {
  roles: {
    Assassin: { name: 'Assassin' },
    Tank: { name: 'Tank' },
    Mage: { name: 'Mage' },
    Marksman: { name: 'Marksman' },
    Fighter: { name: 'Fighter' },
    Support: { name: 'Support' },
  },
  ui: {
    treeTitle: (championName: string) => `Enhancement Tree - ${championName}`,
    candyBalance: (candies: number) => `${candies.toLocaleString('en-US')} 🍬`,
    masteryLevel: (level: number) => `Mastery: Level ${level.toLocaleString('en-US')}`,
    coreNodesTitle: '⚡ Core Nodes',
    ultimate: 'ULTIMATE',
    preview: 'Stat preview after unlocking',
    maximum: 'MAXIMUM',
    maximumReached: 'Maximum reached',
    saving: 'Saving…',
    unlock: 'Unlock',
    nextRank: (rank: number, maximumRank: number) =>
      `Lvl ${rank.toLocaleString('en-US')}/${maximumRank.toLocaleString('en-US')}`,
    lockReasons: {
      unavailable: {
        message: 'Unavailable in this mode',
        details: 'This enhancement is not available in the current combat engine',
      },
      maxed: {
        message: 'Maximum reached',
        details: (maximumRank: number) =>
          `This node is already at maximum rank (${maximumRank.toLocaleString('en-US')}/${maximumRank.toLocaleString('en-US')})`,
      },
      masteryLevel: {
        message: 'Mastery level too low',
        details: (requiredLevel: number, currentLevel: number) =>
          `Required: Level ${requiredLevel.toLocaleString('en-US')} (current: Level ${currentLevel.toLocaleString('en-US')})`,
      },
      candies: {
        message: 'Not enough candies',
        details: (requiredCandies: number, currentCandies: number) =>
          `Required: ${requiredCandies.toLocaleString('en-US')} 🍬 (current: ${currentCandies.toLocaleString('en-US')} 🍬)`,
      },
      prerequisite: {
        message: 'Prerequisite not unlocked',
        details: (name: string, requiredLevel: number, candyCost: number) => {
          const mastery =
            requiredLevel > 0 ? ` (Mastery ${requiredLevel.toLocaleString('en-US')} required)` : '';
          return `📌 ${name}${mastery} - ${candyCost.toLocaleString('en-US')} 🍬`;
        },
      },
    },
  },
  store: {
    loadError: 'Unable to load mastery and enhancements.',
    nodeNotFound: 'Enhancement not found.',
    accountRequired: 'Permanent enhancements require an account.',
    secureCommandUnsupported: 'This browser cannot secure the command.',
    saveFailed: 'Failed to save enhancement.',
    unlockSucceeded: (nodeName: string) => `${nodeName} was successfully upgraded.`,
    validation: {
      unavailable: 'This enhancement is not available in the current combat engine',
      masteryLevel: (requiredLevel: number) =>
        `Required mastery level: ${requiredLevel.toLocaleString('en-US')}`,
      candies: (requiredCandies: number) =>
        `Not enough candies: ${requiredCandies.toLocaleString('en-US')} required`,
      maxed: 'This node is already at maximum rank',
      prerequisite: 'Prerequisites have not been unlocked',
      fallback: 'Unable to unlock this node.',
    },
  },
  masteryUnlocks: {
    roster_offer_7: {
      name: 'Expanded Roster',
      description: 'Adds one champion to the starting selection without increasing team size.',
    },
    starter_reroll_1: {
      name: 'Roster Reroll',
      description:
        'Grants one reroll of the starting selection without providing a combat advantage.',
    },
  },
  statLabels: {
    hp: 'Health',
    mp: 'Mana',
    moveSpeed: 'Movement Speed',
    armor: 'Armor',
    magicResist: 'Magic Resistance',
    attackDamage: 'Attack Damage',
    attackSpeed: 'Attack Initiative',
    attackRange: 'Range Profile',
    abilityPower: 'Ability Power',
    hpRegen: 'Health Regeneration',
    mpRegen: 'Mana Regeneration',
    crit: 'Critical Strike Chance',
    armorPen: 'Armor Penetration',
    magicPen: 'Magic Penetration',
    lifesteal: 'Lifesteal',
    omnivamp: 'Omnivamp',
    tenacity: 'Tenacity',
    abilityHaste: 'Ability Haste',
  },
  branches: {
    assassin_burst: {
      name: 'Burst',
      description: 'Instant burst damage',
    },
    assassin_mobility: {
      name: 'Mobility',
      description: 'Movement and evasion',
    },
    assassin_sustain: {
      name: 'Survival',
      description: 'Lifesteal and evasion',
    },
    tank_defense: {
      name: 'Fortress',
      description: 'Ultimate defense',
    },
    tank_support: {
      name: 'Protector',
      description: 'Ally protection',
    },
    tank_thorn: {
      name: 'Thorns',
      description: 'Damage reflection',
    },
    mage_burst: {
      name: 'Burst',
      description: 'Explosive magic damage',
    },
    mage_control: {
      name: 'Control',
      description: 'Crowd control and area effects',
    },
    mage_sustain: {
      name: 'Sustain',
      description: 'Mana and regeneration',
    },
    marksman_dps: {
      name: 'DPS',
      description: 'Sustained damage',
    },
    marksman_range: {
      name: 'Tactical Shot',
      description: 'Positioning and direct damage',
    },
    marksman_survival: {
      name: 'Survival',
      description: 'Evasion and mobility',
    },
    fighter_bruiser: {
      name: 'Bruiser',
      description: 'Damage and durability',
    },
    fighter_duelist: {
      name: 'Duelist',
      description: 'Duels and counterattacks',
    },
    fighter_sustain: {
      name: 'Regeneration',
      description: 'Lifesteal and endurance',
    },
    support_enchanter: {
      name: 'Enchanter',
      description: 'Buffs and healing',
    },
    support_tanky: {
      name: 'Guardian',
      description: 'Protection and crowd control',
    },
    support_utility: {
      name: 'Utility',
      description: 'Vision and control',
    },
  },
  coreNodes: {
    assassin_core_1: {
      name: 'Sharpened Claws',
      description: '+5 Attack Damage',
    },
    assassin_core_2: {
      name: 'Agility',
      description: '+3% Movement Speed',
    },
    assassin_core_3: {
      name: 'Penetration',
      description: '+4 Armor Penetration',
    },
    tank_core_1: {
      name: 'Reinforced Armor',
      description: '+15 HP, +2 Armor',
    },
    tank_core_2: {
      name: 'Magic Resistance',
      description: '+3 Magic Resistance',
    },
    tank_core_3: {
      name: 'Vitality',
      description: '+25 HP, +2 HP Regeneration',
    },
    mage_core_1: {
      name: 'Arcane Spark',
      description: '+5 Ability Power',
    },
    mage_core_2: {
      name: 'Haste',
      description: '+5 Ability Haste',
    },
    mage_core_3: {
      name: 'Magic Penetration',
      description: '+4 Magic Penetration',
    },
    marksman_core_1: {
      name: 'Precision',
      description: '+5 Attack Damage',
    },
    marksman_core_2: {
      name: 'Tempo',
      description: '+8% Attack Initiative',
    },
    marksman_core_3: {
      name: 'Critical',
      description: '+5% Critical Strike Chance',
    },
    fighter_core_1: {
      name: 'Strength',
      description: '+10 HP, +3 Attack Damage',
    },
    fighter_core_2: {
      name: 'Endurance',
      description: '+5 Armor',
    },
    fighter_core_3: {
      name: 'Fury',
      description: '+5% Attack Initiative',
    },
    support_core_1: {
      name: 'Blessing',
      description: '+15 HP, +3 Ability Power',
    },
    support_core_2: {
      name: 'Guard',
      description: '+3 Armor, +3 Magic Resistance',
    },
    support_core_3: {
      name: 'Support Haste',
      description: '+8 Ability Haste',
    },
  },
  nodes: {
    assassin_burst_1: {
      name: 'Critical Strike',
      description: '+8% Critical Strike Chance',
    },
    assassin_burst_2: {
      name: 'Execution',
      description: '+10% damage against targets below 40% HP',
    },
    assassin_burst_3: {
      name: 'Sudden Death',
      description: 'Ultimate: Burst damage increased by 20%',
    },
    assassin_mobility_1: {
      name: 'Stealthy Step',
      description: '+5% out-of-combat Movement Speed',
    },
    assassin_mobility_2: {
      name: 'Ambush',
      description: '+15% damage from brush or while out of sight',
    },
    assassin_mobility_3: {
      name: 'Shadow',
      description: 'Ultimate: Become invisible for 1.5s after a kill',
    },
    assassin_sustain_1: {
      name: 'Bloodthirst',
      description: '+5% Lifesteal',
    },
    assassin_sustain_2: {
      name: 'Vampirism',
      description: '+3% Omnivamp',
    },
    assassin_sustain_3: {
      name: 'Phoenix',
      description: 'Ultimate: Below 20% HP, gain a 200 HP shield (60s cooldown)',
    },
    tank_defense_1: {
      name: 'Thick Skin',
      description: '+5 Armor, +5 Magic Resistance',
    },
    tank_defense_2: {
      name: 'Tenacity',
      description: '+10% Tenacity (crowd control reduction)',
    },
    tank_defense_3: {
      name: 'Immortal',
      description:
        'Ultimate: When HP reaches 0, remain at 1 HP with immunity for 2s (120s cooldown)',
    },
    tank_support_1: {
      name: 'Ally Shield',
      description: '20% of healing received is shared with the nearest ally',
    },
    tank_support_2: {
      name: 'Guardian',
      description: '+10% damage reduction for nearby allies',
    },
    tank_support_3: {
      name: 'Sacrifice',
      description: 'Ultimate: Can intercept damage directed at an ally (90s cooldown)',
    },
    tank_thorn_1: {
      name: 'Spikes',
      description: 'Reflect 5% of physical damage received back to attackers',
    },
    tank_thorn_2: {
      name: 'Burn',
      description: "Attacks against you deal 2% of the attacker's max HP as magic damage",
    },
    tank_thorn_3: {
      name: 'Vengeance',
      description: 'Ultimate: After taking 500 damage, deal 50 true damage to all nearby enemies',
    },
    mage_burst_1: {
      name: 'Focus',
      description: '+8 Ability Power',
    },
    mage_burst_2: {
      name: 'Combustion',
      description: '+15% magic damage',
    },
    mage_burst_3: {
      name: 'Arcane Storm',
      description: 'Ultimate: AoE abilities have a 20% chance to repeat',
    },
    mage_control_1: {
      name: 'Slow',
      description: 'Spells apply a 15% slow for 1s',
    },
    mage_control_2: {
      name: 'Channeling',
      description: '+10 Ability Haste',
    },
    mage_control_3: {
      name: 'Roots',
      description: 'Ultimate: Spells have a 20% chance to root the target for 1s',
    },
    mage_sustain_1: {
      name: 'Clarity',
      description: '+20 MP, +3 MP Regeneration',
    },
    mage_sustain_2: {
      name: 'Manaflow',
      description: 'Minion kills restore 5 MP',
    },
    mage_sustain_3: {
      name: 'Eternal Presence',
      description: 'Ultimate: Reduces ultimate cooldowns by 20%',
    },
    marksman_dps_1: {
      name: 'Lethality',
      description: '+5 Armor Penetration',
    },
    marksman_dps_2: {
      name: 'Phantom Strike',
      description: '+10% Attack Initiative for 3 turns after a takedown',
    },
    marksman_dps_3: {
      name: 'Rending Shot',
      description: 'Ultimate: Attacks have a 15% chance to inflict bleeding (5% max HP over 3s)',
    },
    marksman_range_1: {
      name: 'High Ground',
      description: '+5 Movement Speed',
    },
    marksman_range_2: {
      name: 'Precise Shot',
      description: '+8% damage against champions',
    },
    marksman_range_3: {
      name: 'Sniper',
      description: 'Ultimate: +15% damage against targets below 40% HP',
    },
    marksman_survival_1: {
      name: 'Dodge',
      description: '+3% chance to dodge an attack',
    },
    marksman_survival_2: {
      name: 'Lightning Fast',
      description: '+8% Movement Speed',
    },
    marksman_survival_3: {
      name: 'Smoke Screen',
      description:
        'Ultimate: When HP falls below 30%, become invisible for 1.5s and gain +30% speed (90s cooldown)',
    },
    fighter_bruiser_1: {
      name: 'Heavy Strike',
      description: '+5% damage',
    },
    fighter_bruiser_2: {
      name: 'Bloodletting',
      description: 'Attacks inflict bleeding (3% max HP over 2s)',
    },
    fighter_bruiser_3: {
      name: 'Berserker',
      description: 'Ultimate: Below 50% HP, deal +20% damage',
    },
    fighter_duelist_1: {
      name: 'Riposte',
      description: 'After dodging, the next attack deals +20% damage',
    },
    fighter_duelist_2: {
      name: 'Challenge',
      description: '+10% damage against enemy champions',
    },
    fighter_duelist_3: {
      name: 'Dead or Alive',
      description:
        'Ultimate: In a duel against a champion, gain +25% damage and +15% damage reduction',
    },
    fighter_sustain_1: {
      name: 'Lifesteal',
      description: '+4% Lifesteal',
    },
    fighter_sustain_2: {
      name: 'Recovery',
      description: '+5 HP Regeneration',
    },
    fighter_sustain_3: {
      name: 'Immortality',
      description: 'Ultimate: Kills restore 20% max HP',
    },
    support_enchanter_1: {
      name: 'Improved Healing',
      description: '+10% healing power',
    },
    support_enchanter_2: {
      name: 'Shield',
      description: 'Applied shields are 15% stronger',
    },
    support_enchanter_3: {
      name: 'Divine Aura',
      description: 'Ultimate: Nearby allies gain +10% to all damage',
    },
    support_tanky_1: {
      name: 'Bodyguard',
      description: '+20 HP, +5 Armor',
    },
    support_tanky_2: {
      name: 'Bind',
      description: 'Crowd control effects last 10% longer',
    },
    support_tanky_3: {
      name: 'Ultimate Sacrifice',
      description: 'Ultimate: Can absorb lethal damage directed at an ally (120s cooldown)',
    },
    support_utility_1: {
      name: 'Vision',
      description: 'Automatically detects enemies in nearby brush',
    },
    support_utility_2: {
      name: 'Area Bind',
      description: 'Area spells apply an additional 20% slow',
    },
    support_utility_3: {
      name: 'Total Control',
      description: 'Ultimate: Crowd control abilities affect a 30% larger area',
    },
  },
} as const satisfies MatchingEnhancementContent<typeof frFR>;

export type EnhancementRoleId = keyof typeof frFR.roles;
export type EnhancementBranchId = keyof typeof frFR.branches;
export type EnhancementCoreNodeId = keyof typeof frFR.coreNodes;
export type EnhancementNodeId = keyof typeof frFR.nodes;
export type EnhancementMasteryUnlockId = keyof typeof frFR.masteryUnlocks;

export const enhancementContent: Readonly<
  Record<EnhancementContentLocale, EnhancementContentCatalog>
> = {
  'fr-FR': frFR,
  'en-US': enUS,
};

export function getEnhancementNodeContent(
  locale: EnhancementContentLocale,
  nodeId: string,
): EnhancementCopy {
  const catalog = enhancementContent[locale];
  const copy = catalog.coreNodes[nodeId] ?? catalog.nodes[nodeId];
  if (!copy) throw new Error(`Missing enhancement node content: ${nodeId}`);
  return copy;
}

export function getEnhancementBranchContent(
  locale: EnhancementContentLocale,
  branchId: string,
): EnhancementCopy {
  const copy = enhancementContent[locale].branches[branchId];
  if (!copy) throw new Error(`Missing enhancement branch content: ${branchId}`);
  return copy;
}

export function getEnhancementMasteryUnlockContent(
  locale: EnhancementContentLocale,
  unlockId: string,
): EnhancementCopy {
  const copy = enhancementContent[locale].masteryUnlocks[unlockId];
  if (!copy) throw new Error(`Missing enhancement mastery unlock content: ${unlockId}`);
  return copy;
}

export function getEnhancementValidationMessage(
  locale: EnhancementContentLocale,
  reason: EnhancementValidationReason,
): string {
  const validation = enhancementContent[locale].store.validation;

  switch (reason.code) {
    case 'unavailable':
      return validation.unavailable;
    case 'mastery_level':
      return validation.masteryLevel(reason.requiredLevel);
    case 'candies':
      return validation.candies(reason.requiredCandies);
    case 'maxed':
      return validation.maxed;
    case 'prerequisite':
      return validation.prerequisite;
    case 'fallback':
      return validation.fallback;
  }
}
