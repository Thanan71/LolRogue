/**
 * Enhancement Tree Data — predefined trees for each champion role.
 * 
 * Each role (Assassin, Tank, Mage, etc.) has a unique enhancement tree
 * with three branches focusing on different playstyle aspects.
 */

import type { ChampionEnhancementTree, EnhancementBranch, EnhancementNode } from '@/types/enhancementTree';

// ─── Helper Functions ────────────────────────────────────────────────────────

function createNode(data: Omit<EnhancementNode, 'id'> & { id: string }): EnhancementNode {
  return data as EnhancementNode;
}

function createBranch(data: Omit<EnhancementBranch, 'nodes'> & { nodes: EnhancementNode[] }): EnhancementBranch {
  return data;
}

// ─── Assassin Enhancement Tree ───────────────────────────────────────────────

const ASSASSIN_CORE: EnhancementNode[] = [
  createNode({
    id: 'assassin_core_1',
    name: "Griffes Aiguisées",
    description: "+5 Dégâts d'attaque",
    type: 'stat',
    candyCost: 20,
    requiredMasteryLevel: 0,
    prerequisites: [],
    statBonuses: { atk: 5 },
  }),
  createNode({
    id: 'assassin_core_2',
    name: "Agilité",
    description: "+3% Vitesse de déplacement",
    type: 'stat',
    candyCost: 30,
    requiredMasteryLevel: 1,
    prerequisites: ['assassin_core_1'],
    percentBonuses: { spd: 0.03 },
  }),
  createNode({
    id: 'assassin_core_3',
    name: "Pénétration",
    description: "+4 Pénétration d'armure",
    type: 'stat',
    candyCost: 40,
    requiredMasteryLevel: 2,
    prerequisites: ['assassin_core_2'],
    statBonuses: { armorPen: 4 },
  }),
];

const ASSASSIN_BRANCHES: EnhancementBranch[] = [
  createBranch({
    id: 'assassin_burst',
    name: "Burst",
    description: "Dégâts explosifs instantanés",
    theme: 'domination',
    nodes: [
      createNode({
        id: 'assassin_burst_1',
        name: "Frappe Critique",
        description: "+8% Chances de coup critique",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        statBonuses: { crit: 8 },
      }),
      createNode({
        id: 'assassin_burst_2',
        name: "Exécution",
        description: "+10% de dégâts contre les cibles en dessous de 40% PV",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['assassin_burst_1'],
        effects: [{
          type: 'execute_damage',
          description: "Dégâts augmentés contre cibles blessées",
          condition: "Cible en dessous de 40% PV",
          value: 0.10,
        }],
      }),
      createNode({
        id: 'assassin_burst_3',
        name: "Mort Subite",
        description: "Ulti: Dégâts de burst augmentés de 20%",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['assassin_burst_2'],
        effects: [{
          type: 'burst_amplify',
          description: "Dégâts de burst ultimes augmentés",
          value: 0.20,
        }],
      }),
    ],
  }),
  createBranch({
    id: 'assassin_mobility',
    name: "Mobilité",
    description: "Mouvement et esquive",
    theme: 'precision',
    nodes: [
      createNode({
        id: 'assassin_mobility_1',
        name: "Pas Furtif",
        description: "+5% Vitesse de déplacement hors combat",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        effects: [{
          type: 'out_of_combat_speed',
          description: "Vitesse de déplacement augmentée hors combat",
          value: 0.05,
        }],
      }),
      createNode({
        id: 'assassin_mobility_2',
        name: "Embuscade",
        description: "+15% de dégâts depuis les broussailles ou hors de vue",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['assassin_mobility_1'],
        effects: [{
          type: 'ambush_damage',
          description: "Dégâts augmentés depuis la dissimulation",
          value: 0.15,
        }],
      }),
      createNode({
        id: 'assassin_mobility_3',
        name: "Ombre",
        description: "Ulti: Devient invisible pendant 1.5s après un kill",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['assassin_mobility_2'],
        effects: [{
          type: 'stealth_on_kill',
          description: "Invisibilité après un kill",
          duration: 1.5,
        }],
      }),
    ],
  }),
  createBranch({
    id: 'assassin_sustain',
    name: "Survie",
    description: "Vol de vie et esquive",
    theme: 'resolve',
    nodes: [
      createNode({
        id: 'assassin_sustain_1',
        name: "Soif de Sang",
        description: "+5% Vol de vie",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        statBonuses: { lifesteal: 5 },
      }),
      createNode({
        id: 'assassin_sustain_2',
        name: "Vampirisme",
        description: "+3% Omnivamp",
        type: 'stat',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['assassin_sustain_1'],
        statBonuses: { omnivamp: 3 },
      }),
      createNode({
        id: 'assassin_sustain_3',
        name: "Phénix",
        description: "Ulti: En dessous de 20% PV, gagne un bouclier de 200 PV (60s CD)",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['assassin_sustain_2'],
        effects: [{
          type: 'survival_shield',
          description: "Bouclier automatique quand PV bas",
          value: 200,
          condition: "En dessous de 20% PV",
          cooldown: 60,
        }],
      }),
    ],
  }),
];

export const ASSASSIN_TREE: ChampionEnhancementTree = {
  championId: '*',
  primaryRole: 'Assassin',
  branches: ASSASSIN_BRANCHES,
  coreNodes: ASSASSIN_CORE,
};

// ─── Tank Enhancement Tree ───────────────────────────────────────────────────

const TANK_CORE: EnhancementNode[] = [
  createNode({
    id: 'tank_core_1',
    name: "Armure Renforcée",
    description: "+15 PV, +2 Armure",
    type: 'stat',
    candyCost: 20,
    requiredMasteryLevel: 0,
    prerequisites: [],
    statBonuses: { hp: 15, def: 2 },
  }),
  createNode({
    id: 'tank_core_2',
    name: "Résistance Magique",
    description: "+3 Résistance magique",
    type: 'stat',
    candyCost: 30,
    requiredMasteryLevel: 1,
    prerequisites: ['tank_core_1'],
    statBonuses: { mr: 3 },
  }),
  createNode({
    id: 'tank_core_3',
    name: "Vitalité",
    description: "+25 PV, +2 Régénération PV",
    type: 'stat',
    candyCost: 40,
    requiredMasteryLevel: 2,
    prerequisites: ['tank_core_2'],
    statBonuses: { hp: 25, hpRegen: 2 },
  }),
];

const TANK_BRANCHES: EnhancementBranch[] = [
  createBranch({
    id: 'tank_defense',
    name: "Forteresse",
    description: "Défense ultime",
    theme: 'resolve',
    nodes: [
      createNode({
        id: 'tank_defense_1',
        name: "Peau Épaisse",
        description: "+5 Armure, +5 Résistance magique",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        statBonuses: { def: 5, mr: 5 },
      }),
      createNode({
        id: 'tank_defense_2',
        name: "Ténacité",
        description: "+10% Ténacité (réduction CC)",
        type: 'stat',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['tank_defense_1'],
        statBonuses: { tenacity: 10 },
      }),
      createNode({
        id: 'tank_defense_3',
        name: "Immortel",
        description: "Ulti: Quand PV tombent à 0, reste à 1 PV avec immunité 2s (120s CD)",
        type: 'ultimate',
        candyCost: 200,
        requiredMasteryLevel: 3,
        prerequisites: ['tank_defense_2'],
        effects: [{
          type: 'revive',
          description: "Survie automatique avec immunité temporaire",
          duration: 2,
          cooldown: 120,
        }],
      }),
    ],
  }),
  createBranch({
    id: 'tank_support',
    name: "Protecteur",
    description: "Protection des alliés",
    theme: 'inspiration',
    nodes: [
      createNode({
        id: 'tank_support_1',
        name: "Bouclier d'Allié",
        description: "Les soins reçus sont partagés à 20% avec l'allié le plus proche",
        type: 'passive',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        effects: [{
          type: 'heal_share',
          description: "Partage des soins avec alliés proches",
          value: 0.20,
        }],
      }),
      createNode({
        id: 'tank_support_2',
        name: "Gardien",
        description: "+10% de réduction des dégâts subis par les alliés proches",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['tank_support_1'],
        effects: [{
          type: 'ally_damage_reduction',
          description: "Réduction dégâts pour alliés proches",
          value: 0.10,
        }],
      }),
      createNode({
        id: 'tank_support_3',
        name: "Sacrifice",
        description: "Ulti: Peut intercepter les dégâts dirigés vers un allié (90s CD)",
        type: 'ultimate',
        candyCost: 200,
        requiredMasteryLevel: 3,
        prerequisites: ['tank_support_2'],
        effects: [{
          type: 'damage_intercept',
          description: "Interception des dégâts ciblés sur alliés",
          cooldown: 90,
        }],
      }),
    ],
  }),
  createBranch({
    id: 'tank_thorn',
    name: "Épines",
    description: "Renvoi de dégâts",
    theme: 'domination',
    nodes: [
      createNode({
        id: 'tank_thorn_1',
        name: "Pointes",
        description: "Renvoie 5% des dégâts physiques reçus aux attaquants",
        type: 'passive',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        effects: [{
          type: 'thornmail',
          description: "Renvoi de dégâts physiques",
          value: 0.05,
        }],
      }),
      createNode({
        id: 'tank_thorn_2',
        name: "Brûlure",
        description: "Les attaques contre vous leur infligent 2% de leurs PV max en dégâts magiques",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['tank_thorn_1'],
        effects: [{
          type: 'burn_reflect',
          description: "Dégâts basés sur PV max ennemis",
          value: 0.02,
        }],
      }),
      createNode({
        id: 'tank_thorn_3',
        name: "Vengeance",
        description: "Ulti: Après avoir subi 500 dégâts, renvoie 50 dégâts vrais à tous les ennemis proches",
        type: 'ultimate',
        candyCost: 200,
        requiredMasteryLevel: 3,
        prerequisites: ['tank_thorn_2'],
        effects: [{
          type: 'vengeance_burst',
          description: "Explosion de dégâts vrais après encaissement",
          value: 50,
          condition: "Après 500 dégâts subis",
        }],
      }),
    ],
  }),
];

export const TANK_TREE: ChampionEnhancementTree = {
  championId: '*',
  primaryRole: 'Tank',
  branches: TANK_BRANCHES,
  coreNodes: TANK_CORE,
};

// ─── Mage Enhancement Tree ───────────────────────────────────────────────────

const MAGE_CORE: EnhancementNode[] = [
  createNode({
    id: 'mage_core_1',
    name: "Étincelle Arcane",
    description: "+5 Puissance",
    type: 'stat',
    candyCost: 20,
    requiredMasteryLevel: 0,
    prerequisites: [],
    statBonuses: { ap: 5 },
  }),
  createNode({
    id: 'mage_core_2',
    name: "Hâte",
    description: "+5 Hâte d'habileté",
    type: 'stat',
    candyCost: 30,
    requiredMasteryLevel: 1,
    prerequisites: ['mage_core_1'],
    statBonuses: { abilityHaste: 5 },
  }),
  createNode({
    id: 'mage_core_3',
    name: "Pénétration Magique",
    description: "+4 Pénétration magique",
    type: 'stat',
    candyCost: 40,
    requiredMasteryLevel: 2,
    prerequisites: ['mage_core_2'],
    statBonuses: { magicPen: 4 },
  }),
];

const MAGE_BRANCHES: EnhancementBranch[] = [
  createBranch({
    id: 'mage_burst',
    name: "Burst",
    description: "Dégâts magiques explosifs",
    theme: 'domination',
    nodes: [
      createNode({
        id: 'mage_burst_1',
        name: "Concentration",
        description: "+8 Puissance",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        statBonuses: { ap: 8 },
      }),
      createNode({
        id: 'mage_burst_2',
        name: "Combustion",
        description: "+15% de dégâts magiques",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['mage_burst_1'],
        percentBonuses: { ap: 0.15 },
      }),
      createNode({
        id: 'mage_burst_3',
        name: "Tempête Arcane",
        description: "Ulti: Les compétences AoE ont 20% de chances de se répéter",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['mage_burst_2'],
        effects: [{
          type: 'spell_echo',
          description: "Chance de répéter les sorts AoE",
          value: 0.20,
        }],
      }),
    ],
  }),
  createBranch({
    id: 'mage_control',
    name: "Contrôle",
    description: "CC et zone",
    theme: 'sorcery',
    nodes: [
      createNode({
        id: 'mage_control_1',
        name: "Ralentissement",
        description: "Les sorts appliquent 15% de ralentissement pendant 1s",
        type: 'passive',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        effects: [{
          type: 'slow',
          description: "Ralentissement sur sorts",
          value: 0.15,
          duration: 1,
        }],
      }),
      createNode({
        id: 'mage_control_2',
        name: "Zone de Pouvoir",
        description: "+10% de portée des sorts",
        type: 'stat',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['mage_control_1'],
        percentBonuses: { abilityHaste: 0.10 },
      }),
      createNode({
        id: 'mage_control_3',
        name: "Racines",
        description: "Ulti: 20% de chances qu'un sort enracine la cible pendant 1s",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['mage_control_2'],
        effects: [{
          type: 'root_chance',
          description: "Chance d'enracinement",
          value: 0.20,
          duration: 1,
        }],
      }),
    ],
  }),
  createBranch({
    id: 'mage_sustain',
    name: "Soutien",
    description: "Mana et régénération",
    theme: 'inspiration',
    nodes: [
      createNode({
        id: 'mage_sustain_1',
        name: "Clarté",
        description: "+20 PM, +3 Régénération PM",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        statBonuses: { mp: 20, mpRegen: 3 },
      }),
      createNode({
        id: 'mage_sustain_2',
        name: "Flux de Mana",
        description: "Les kills de sbires restaurent 5 PM",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['mage_sustain_1'],
        effects: [{
          type: 'mana_restore',
          description: "Restauration de mana sur kill",
          value: 5,
        }],
      }),
      createNode({
        id: 'mage_sustain_3',
        name: "Présence Éternelle",
        description: "Ulti: Réduit les CD ultimes de 20%",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['mage_sustain_2'],
        effects: [{
          type: 'cdr_ultimate',
          description: "Réduction CD ultime",
          value: 0.20,
        }],
      }),
    ],
  }),
];

export const MAGE_TREE: ChampionEnhancementTree = {
  championId: '*',
  primaryRole: 'Mage',
  branches: MAGE_BRANCHES,
  coreNodes: MAGE_CORE,
};

// ─── Marksman Enhancement Tree ───────────────────────────────────────────────

const MARKSMAN_CORE: EnhancementNode[] = [
  createNode({
    id: 'marksman_core_1',
    name: "Précision",
    description: "+5 Dégâts d'attaque",
    type: 'stat',
    candyCost: 20,
    requiredMasteryLevel: 0,
    prerequisites: [],
    statBonuses: { atk: 5 },
  }),
  createNode({
    id: 'marksman_core_2',
    name: "Vitesse d'Attaque",
    description: "+8% Vitesse d'attaque",
    type: 'stat',
    candyCost: 30,
    requiredMasteryLevel: 1,
    prerequisites: ['marksman_core_1'],
    percentBonuses: { attackSpeed: 0.08 },
  }),
  createNode({
    id: 'marksman_core_3',
    name: "Critique",
    description: "+5% Chances de coup critique",
    type: 'stat',
    candyCost: 40,
    requiredMasteryLevel: 2,
    prerequisites: ['marksman_core_2'],
    statBonuses: { crit: 5 },
  }),
];

const MARKSMAN_BRANCHES: EnhancementBranch[] = [
  createBranch({
    id: 'marksman_dps',
    name: "DPS",
    description: "Dégâts continus",
    theme: 'precision',
    nodes: [
      createNode({
        id: 'marksman_dps_1',
        name: "Létalité",
        description: "+5 Pénétration d'armure",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        statBonuses: { armorPen: 5 },
      }),
      createNode({
        id: 'marksman_dps_2',
        name: "Frappe Fantôme",
        description: "+10% de vitesse d'attaque pendant 3s après un kill",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['marksman_dps_1'],
        effects: [{
          type: 'attack_speed_on_kill',
          description: "Vitesse d'attaque après kill",
          value: 0.10,
          duration: 3,
        }],
      }),
      createNode({
        id: 'marksman_dps_3',
        name: "Tir Déchirant",
        description: "Ulti: Les attaques ont 15% de chances d'infliger des saignements (5% PV max sur 3s)",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['marksman_dps_2'],
        effects: [{
          type: 'bleed',
          description: "Saignement sur attaques",
          value: 0.05,
          duration: 3,
        }],
      }),
    ],
  }),
  createBranch({
    id: 'marksman_range',
    name: "Portée",
    description: "Attaques à distance",
    theme: 'sorcery',
    nodes: [
      createNode({
        id: 'marksman_range_1',
        name: "Allonge",
        description: "+5% de portée d'attaque",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        percentBonuses: { attackRange: 0.05 },
      }),
      createNode({
        id: 'marksman_range_2',
        name: "Percée",
        description: "Les attaques traversent la première cible et touchent celle derrière (50% dégâts)",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['marksman_range_1'],
        effects: [{
          type: 'pierce',
          description: "Attaques traversantes",
          value: 0.50,
        }],
      }),
      createNode({
        id: 'marksman_range_3',
        name: "Sniper",
        description: "Ulti: +25% de dégâts contre les cibles à plus de 600 de distance",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['marksman_range_2'],
        effects: [{
          type: 'long_range_damage',
          description: "Dégâts augmentés à longue distance",
          value: 0.25,
          condition: "Cible à plus de 600 de distance",
        }],
      }),
    ],
  }),
  createBranch({
    id: 'marksman_survival',
    name: "Survie",
    description: "Esquive et mobilité",
    theme: 'resolve',
    nodes: [
      createNode({
        id: 'marksman_survival_1',
        name: "Esquive",
        description: "+3% de chances d'esquiver une attaque",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        effects: [{
          type: 'dodge',
          description: "Chance d'esquive",
          value: 0.03,
        }],
      }),
      createNode({
        id: 'marksman_survival_2',
        name: "Rapide comme l'Éclair",
        description: "+8% de vitesse de déplacement",
        type: 'stat',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['marksman_survival_1'],
        percentBonuses: { spd: 0.08 },
      }),
      createNode({
        id: 'marksman_survival_3',
        name: "Brouillard de Fumée",
        description: "Ulti: Quand PV tombent en dessous de 30%, devient invisible 1.5s et gagne +30% de vitesse (90s CD)",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['marksman_survival_2'],
        effects: [{
          type: 'smoke_screen',
          description: "Invisibilité et vitesse quand PV bas",
          duration: 1.5,
          cooldown: 90,
          condition: "En dessous de 30% PV",
        }],
      }),
    ],
  }),
];

export const MARKSMAN_TREE: ChampionEnhancementTree = {
  championId: '*',
  primaryRole: 'Marksman',
  branches: MARKSMAN_BRANCHES,
  coreNodes: MARKSMAN_CORE,
};

// ─── Fighter Enhancement Tree ────────────────────────────────────────────────

const FIGHTER_CORE: EnhancementNode[] = [
  createNode({
    id: 'fighter_core_1',
    name: "Force",
    description: "+10 PV, +3 Dégâts d'attaque",
    type: 'stat',
    candyCost: 20,
    requiredMasteryLevel: 0,
    prerequisites: [],
    statBonuses: { hp: 10, atk: 3 },
  }),
  createNode({
    id: 'fighter_core_2',
    name: "Endurance",
    description: "+5 Armure",
    type: 'stat',
    candyCost: 30,
    requiredMasteryLevel: 1,
    prerequisites: ['fighter_core_1'],
    statBonuses: { def: 5 },
  }),
  createNode({
    id: 'fighter_core_3',
    name: "Fureur",
    description: "+5% Vitesse d'attaque",
    type: 'stat',
    candyCost: 40,
    requiredMasteryLevel: 2,
    prerequisites: ['fighter_core_2'],
    percentBonuses: { attackSpeed: 0.05 },
  }),
];

const FIGHTER_BRANCHES: EnhancementBranch[] = [
  createBranch({
    id: 'fighter_bruiser',
    name: "Brute",
    description: "Dégâts et résistance",
    theme: 'precision',
    nodes: [
      createNode({
        id: 'fighter_bruiser_1',
        name: "Frappe Lourde",
        description: "+5% de dégâts",
        type: 'passive',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        percentBonuses: { atk: 0.05 },
      }),
      createNode({
        id: 'fighter_bruiser_2',
        name: "Saignée",
        description: "Les attaques appliquent des saignements (3% PV max sur 2s)",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['fighter_bruiser_1'],
        effects: [{
          type: 'bleed',
          description: "Saignement sur attaques",
          value: 0.03,
          duration: 2,
        }],
      }),
      createNode({
        id: 'fighter_bruiser_3',
        name: "Berserker",
        description: "Ulti: En dessous de 50% PV, +20% de dégâts et +10% de vitesse d'attaque",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['fighter_bruiser_2'],
        effects: [{
          type: 'berserker',
          description: "Boost de dégâts et vitesse quand PV bas",
          value: 0.20,
          condition: "En dessous de 50% PV",
        }],
      }),
    ],
  }),
  createBranch({
    id: 'fighter_duelist',
    name: "Duelliste",
    description: "1v1 et contre-attaque",
    theme: 'domination',
    nodes: [
      createNode({
        id: 'fighter_duelist_1',
        name: "Riposte",
        description: "Après une esquive, la prochaine attaque inflige +20% de dégâts",
        type: 'passive',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        effects: [{
          type: 'riposte',
          description: "Bonus de dégâts après esquive",
          value: 0.20,
        }],
      }),
      createNode({
        id: 'fighter_duelist_2',
        name: "Défi",
        description: "+10% de dégâts contre les champions ennemis",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['fighter_duelist_1'],
        effects: [{
          type: 'champion_damage',
          description: "Dégâts augmentés contre champions",
          value: 0.10,
        }],
      }),
      createNode({
        id: 'fighter_duelist_3',
        name: "Mort ou Vif",
        description: "Ulti: En 1v1 contre un champion, +25% de dégâts et +15% de réduction de dégâts",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['fighter_duelist_2'],
        effects: [{
          type: 'duelist',
          description: "Bonus en duel 1v1",
          value: 0.25,
          condition: "Seul contre un champion ennemi",
        }],
      }),
    ],
  }),
  createBranch({
    id: 'fighter_sustain',
    name: "Régénération",
    description: "Vol de vie et endurance",
    theme: 'resolve',
    nodes: [
      createNode({
        id: 'fighter_sustain_1',
        name: "Vol de Vie",
        description: "+4% Vol de vie",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        statBonuses: { lifesteal: 4 },
      }),
      createNode({
        id: 'fighter_sustain_2',
        name: "Récupération",
        description: "+5 Régénération PV",
        type: 'stat',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['fighter_sustain_1'],
        statBonuses: { hpRegen: 5 },
      }),
      createNode({
        id: 'fighter_sustain_3',
        name: "Immortalité",
        description: "Ulti: Les kills restaurent 20% PV max",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['fighter_sustain_2'],
        effects: [{
          type: 'heal_on_kill',
          description: "Soin massif sur kill",
          value: 0.20,
        }],
      }),
    ],
  }),
];

export const FIGHTER_TREE: ChampionEnhancementTree = {
  championId: '*',
  primaryRole: 'Fighter',
  branches: FIGHTER_BRANCHES,
  coreNodes: FIGHTER_CORE,
};

// ─── Support Enhancement Tree ────────────────────────────────────────────────

const SUPPORT_CORE: EnhancementNode[] = [
  createNode({
    id: 'support_core_1',
    name: "Bénédiction",
    description: "+15 PV, +3 Puissance",
    type: 'stat',
    candyCost: 20,
    requiredMasteryLevel: 0,
    prerequisites: [],
    statBonuses: { hp: 15, ap: 3 },
  }),
  createNode({
    id: 'support_core_2',
    name: "Garde",
    description: "+3 Armure, +3 Résistance magique",
    type: 'stat',
    candyCost: 30,
    requiredMasteryLevel: 1,
    prerequisites: ['support_core_1'],
    statBonuses: { def: 3, mr: 3 },
  }),
  createNode({
    id: 'support_core_3',
    name: "Hâte de Soutien",
    description: "+8 Hâte d'habileté",
    type: 'stat',
    candyCost: 40,
    requiredMasteryLevel: 2,
    prerequisites: ['support_core_2'],
    statBonuses: { abilityHaste: 8 },
  }),
];

const SUPPORT_BRANCHES: EnhancementBranch[] = [
  createBranch({
    id: 'support_enchanter',
    name: "Enchanteur",
    description: "Buffs et soins",
    theme: 'sorcery',
    nodes: [
      createNode({
        id: 'support_enchanter_1',
        name: "Soin Amélioré",
        description: "+10% de puissance des soins",
        type: 'passive',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        effects: [{
          type: 'heal_amp',
          description: "Amplification des soins",
          value: 0.10,
        }],
      }),
      createNode({
        id: 'support_enchanter_2',
        name: "Bouclier",
        description: "Les boucliers appliqués sont 15% plus puissants",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['support_enchanter_1'],
        effects: [{
          type: 'shield_amp',
          description: "Amplification des boucliers",
          value: 0.15,
        }],
      }),
      createNode({
        id: 'support_enchanter_3',
        name: "Aura Divine",
        description: "Ulti: Les alliés proches gagnent +10% de tous leurs dégâts",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['support_enchanter_2'],
        effects: [{
          type: 'damage_aura',
          description: "Aura de dégâts pour alliés",
          value: 0.10,
        }],
      }),
    ],
  }),
  createBranch({
    id: 'support_tanky',
    name: "Gardien",
    description: "Protection et CC",
    theme: 'resolve',
    nodes: [
      createNode({
        id: 'support_tanky_1',
        name: "Corps Garde",
        description: "+20 PV, +5 Armure",
        type: 'stat',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        statBonuses: { hp: 20, def: 5 },
      }),
      createNode({
        id: 'support_tanky_2',
        name: "Entrave",
        description: "Les sorts de CC durent 10% plus longtemps",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['support_tanky_1'],
        effects: [{
          type: 'cc_extension',
          description: "Durée de CC augmentée",
          value: 0.10,
        }],
      }),
      createNode({
        id: 'support_tanky_3',
        name: "Sacrifice Ultime",
        description: "Ulti: Peut absorber les dégâts mortels dirigés vers un allié (120s CD)",
        type: 'ultimate',
        candyCost: 200,
        requiredMasteryLevel: 3,
        prerequisites: ['support_tanky_2'],
        effects: [{
          type: 'damage_sacrifice',
          description: "Absorption de dégâts mortels",
          cooldown: 120,
        }],
      }),
    ],
  }),
  createBranch({
    id: 'support_utility',
    name: "Utilitaire",
    description: "Vision et contrôle",
    theme: 'inspiration',
    nodes: [
      createNode({
        id: 'support_utility_1',
        name: "Vision",
        description: "Détection automatique des ennemis dans les broussailles proches",
        type: 'passive',
        candyCost: 50,
        requiredMasteryLevel: 1,
        prerequisites: [],
        effects: [{
          type: 'bush_vision',
          description: "Vision dans les broussailles",
        }],
      }),
      createNode({
        id: 'support_utility_2',
        name: "Entrave de Zone",
        description: "Les sorts de zone ralentissent de 20% supplémentaires",
        type: 'passive',
        candyCost: 80,
        requiredMasteryLevel: 2,
        prerequisites: ['support_utility_1'],
        effects: [{
          type: 'aoe_slow',
          description: "Ralentissement de zone augmenté",
          value: 0.20,
        }],
      }),
      createNode({
        id: 'support_utility_3',
        name: "Contrôle Total",
        description: "Ulti: Les sorts de CC affectent une zone plus large (+30%)",
        type: 'ultimate',
        candyCost: 150,
        requiredMasteryLevel: 3,
        prerequisites: ['support_utility_2'],
        effects: [{
          type: 'cc_aoe',
          description: "Zone de CC augmentée",
          value: 0.30,
        }],
      }),
    ],
  }),
];

export const SUPPORT_TREE: ChampionEnhancementTree = {
  championId: '*',
  primaryRole: 'Support',
  branches: SUPPORT_BRANCHES,
  coreNodes: SUPPORT_CORE,
};

// ─── Tree Registry ───────────────────────────────────────────────────────────

export const ENHANCEMENT_TREES_BY_ROLE: Record<string, ChampionEnhancementTree> = {
  Assassin: ASSASSIN_TREE,
  Tank: TANK_TREE,
  Mage: MAGE_TREE,
  Marksman: MARKSMAN_TREE,
  Fighter: FIGHTER_TREE,
  Support: SUPPORT_TREE,
};

/**
 * Get the enhancement tree for a champion based on their primary role.
 * Falls back to Fighter tree if role is unknown.
 */
export function getEnhancementTreeForRole(role: string): ChampionEnhancementTree {
  return ENHANCEMENT_TREES_BY_ROLE[role] || FIGHTER_TREE;
}

/**
 * Get all available roles with enhancement trees.
 */
export function getAvailableRoles(): string[] {
  return Object.keys(ENHANCEMENT_TREES_BY_ROLE);
}

/**
 * Calculate total candy cost to unlock a specific node.
 */
export function getNodeTotalCost(node: EnhancementNode, currentRank: number = 0): number {
  const maxRanks = node.maxRanks || 1;
  if (currentRank >= maxRanks) return 0;
  return node.candyCost * (maxRanks - currentRank);
}

/**
 * Check if a node can be unlocked.
 */
export function canUnlockNode(
  node: EnhancementNode,
  unlockedNodes: Record<string, number>,
  masteryLevel: number,
  availableCandies: number
): boolean {
  // Check mastery level requirement
  if (masteryLevel < node.requiredMasteryLevel) return false;
  
  // Check candy cost
  if (availableCandies < node.candyCost) return false;
  
  // Check if already maxed
  const maxRanks = node.maxRanks || 1;
  const currentRank = unlockedNodes[node.id] || 0;
  if (currentRank >= maxRanks) return false;
  
  // Check prerequisites
  for (const prereqId of node.prerequisites) {
    const prereqRank = unlockedNodes[prereqId] || 0;
    if (prereqRank === 0) return false;
  }
  
  return true;
}