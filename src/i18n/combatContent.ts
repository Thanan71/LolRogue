import { locale } from './fr';

export type CombatContentLocale = 'fr-FR' | 'en-US';

const combatNumberFormatters: Readonly<Record<CombatContentLocale, Intl.NumberFormat>> = {
  'fr-FR': new Intl.NumberFormat('fr-FR'),
  'en-US': new Intl.NumberFormat('en-US'),
};

function formatCombatNumber(localeCode: CombatContentLocale, value: number): string {
  return combatNumberFormatters[localeCode].format(value);
}

export const COMBAT_VISUAL_TITLE_IDS = [
  'basic_attack',
  'fallback:spell_q',
  'fallback:spell_w',
  'fallback:spell_e',
  'fallback:spell_r',
  'Annie:spell_q',
  'Annie:spell_w',
  'Annie:spell_e',
  'Annie:spell_r',
  'Ashe:spell_q',
  'Ashe:spell_w',
  'Ashe:spell_e',
  'Ashe:spell_r',
  'Darius:spell_q',
  'Darius:spell_w',
  'Darius:spell_e',
  'Darius:spell_r',
  'Garen:spell_q',
  'Garen:spell_w',
  'Garen:spell_e',
  'Garen:spell_r',
  'Jinx:spell_q',
  'Jinx:spell_w',
  'Jinx:spell_e',
  'Jinx:spell_r',
  'Leona:spell_q',
  'Leona:spell_w',
  'Leona:spell_e',
  'Leona:spell_r',
  'Lux:spell_q',
  'Lux:spell_w',
  'Lux:spell_e',
  'Lux:spell_r',
  'Malphite:spell_q',
  'Malphite:spell_w',
  'Malphite:spell_e',
  'Malphite:spell_r',
  'Soraka:spell_q',
  'Soraka:spell_w',
  'Soraka:spell_e',
  'Soraka:spell_r',
  'Warwick:spell_q',
  'Warwick:spell_w',
  'Warwick:spell_e',
  'Warwick:spell_r',
] as const;

export type CombatVisualTitleId = (typeof COMBAT_VISUAL_TITLE_IDS)[number];

export const COMBAT_ENHANCEMENT_EFFECT_IDS = [
  'assassin_burst_2:execute_damage',
  'assassin_burst_3:burst_amplify',
  'assassin_mobility_1:out_of_combat_speed',
  'assassin_mobility_2:ambush_damage',
  'assassin_mobility_3:stealth_on_kill',
  'assassin_sustain_3:survival_shield',
  'tank_defense_3:revive',
  'tank_support_1:heal_share',
  'tank_support_2:ally_damage_reduction',
  'tank_support_3:damage_intercept',
  'tank_thorn_1:thornmail',
  'tank_thorn_2:burn_reflect',
  'tank_thorn_3:vengeance_burst',
  'mage_burst_3:spell_echo',
  'mage_control_1:slow',
  'mage_control_3:root_chance',
  'mage_sustain_2:mana_restore',
  'mage_sustain_3:cdr_ultimate',
  'marksman_dps_2:attack_speed_on_kill',
  'marksman_dps_3:bleed',
  'marksman_range_2:champion_damage',
  'marksman_range_3:execute_damage',
  'marksman_survival_1:dodge',
  'marksman_survival_3:smoke_screen',
  'fighter_bruiser_2:bleed',
  'fighter_bruiser_3:berserker',
  'fighter_duelist_1:riposte',
  'fighter_duelist_2:champion_damage',
  'fighter_duelist_3:duelist',
  'fighter_sustain_3:heal_on_kill',
  'support_enchanter_1:heal_amp',
  'support_enchanter_2:shield_amp',
  'support_enchanter_3:damage_aura',
  'support_tanky_2:cc_extension',
  'support_tanky_3:damage_sacrifice',
  'support_utility_1:bush_vision',
  'support_utility_2:aoe_slow',
  'support_utility_3:cc_aoe',
] as const;

export type CombatEnhancementEffectId = (typeof COMBAT_ENHANCEMENT_EFFECT_IDS)[number];

type ActionLabelId = 'basic_attack' | 'spell_q' | 'spell_w' | 'spell_e' | 'spell_r';
type CrowdControlLabelId = 'stun' | 'snare' | 'silence' | 'slow' | 'knockup' | 'fear' | 'charm';
type PreviewDamageTone = 'physical' | 'magical' | 'true';
type PreviewControlId =
  | 'charm'
  | 'fear'
  | 'knockup'
  | 'root'
  | 'silence'
  | 'slow'
  | 'snare'
  | 'stun';
type PreviewUtilityId = 'buff' | 'debuff' | 'execute' | 'revive';
type PreviewStatId = 'armor' | 'attackDamage' | 'attackSpeed' | 'damageReduction' | 'moveSpeed';
type PresenterStatId =
  | 'hp'
  | 'mp'
  | 'atk'
  | 'ap'
  | 'def'
  | 'mr'
  | 'spd'
  | 'crit'
  | 'attackSpeed'
  | 'hpRegen'
  | 'mpRegen'
  | 'armorPen'
  | 'magicPen'
  | 'lifesteal'
  | 'omnivamp'
  | 'tenacity'
  | 'abilityHaste'
  | 'attackRange';

const visualTitlesFr = {
  basic_attack: 'Attaque de base',
  'fallback:spell_q': 'Compétence Q',
  'fallback:spell_w': 'Compétence W',
  'fallback:spell_e': 'Compétence E',
  'fallback:spell_r': 'Compétence ultime',
  'Annie:spell_q': 'Braise guidée',
  'Annie:spell_w': 'Cône ardent',
  'Annie:spell_e': 'Bouclier de lave',
  'Annie:spell_r': 'Invocation infernale',
  'Ashe:spell_q': 'Volée glaciale',
  'Ashe:spell_w': 'Éventail de givre',
  'Ashe:spell_e': 'Vision cristalline',
  'Ashe:spell_r': 'Flèche de glace',
  'Darius:spell_q': 'Arc sanglant',
  'Darius:spell_w': 'Frappe écrasante',
  'Darius:spell_e': 'Traction brutale',
  'Darius:spell_r': 'Exécution',
  'Garen:spell_q': 'Frappe décisive',
  'Garen:spell_w': 'Courage',
  'Garen:spell_e': 'Tourbillon d’acier',
  'Garen:spell_r': 'Jugement céleste',
  'Jinx:spell_q': 'Rafale balistique',
  'Jinx:spell_w': 'Décharge électrique',
  'Jinx:spell_e': 'Piège explosif',
  'Jinx:spell_r': 'Super roquette',
  'Leona:spell_q': 'Frappe solaire',
  'Leona:spell_w': 'Éclipse',
  'Leona:spell_e': 'Lame du zénith',
  'Leona:spell_r': 'Éruption solaire',
  'Lux:spell_q': 'Entrave de lumière',
  'Lux:spell_w': 'Prisme protecteur',
  'Lux:spell_e': 'Sphère radieuse',
  'Lux:spell_r': 'Rayon final',
  'Malphite:spell_q': 'Éclat de roche',
  'Malphite:spell_w': 'Onde tellurique',
  'Malphite:spell_e': 'Fracas terrestre',
  'Malphite:spell_r': 'Impact inarrêtable',
  'Soraka:spell_q': 'Pluie d’étoiles',
  'Soraka:spell_w': 'Grâce astrale',
  'Soraka:spell_e': 'Zone de silence',
  'Soraka:spell_r': 'Souhait cosmique',
  'Warwick:spell_q': 'Morsure',
  'Warwick:spell_w': 'Piste sanglante',
  'Warwick:spell_e': 'Hurlement de peur',
  'Warwick:spell_r': 'Bond bestial',
} as const satisfies Readonly<Record<CombatVisualTitleId, string>>;

const visualTitlesEn = {
  basic_attack: 'Basic attack',
  'fallback:spell_q': 'Q ability',
  'fallback:spell_w': 'W ability',
  'fallback:spell_e': 'E ability',
  'fallback:spell_r': 'Ultimate ability',
  'Annie:spell_q': 'Guided Ember',
  'Annie:spell_w': 'Blazing Cone',
  'Annie:spell_e': 'Lava Shield',
  'Annie:spell_r': 'Infernal Summoning',
  'Ashe:spell_q': 'Frost Volley',
  'Ashe:spell_w': 'Fan of Frost',
  'Ashe:spell_e': 'Crystal Vision',
  'Ashe:spell_r': 'Ice Arrow',
  'Darius:spell_q': 'Blood Arc',
  'Darius:spell_w': 'Crushing Blow',
  'Darius:spell_e': 'Brutal Pull',
  'Darius:spell_r': 'Execution',
  'Garen:spell_q': 'Decisive Strike',
  'Garen:spell_w': 'Courage',
  'Garen:spell_e': 'Steel Whirlwind',
  'Garen:spell_r': 'Celestial Judgment',
  'Jinx:spell_q': 'Ballistic Barrage',
  'Jinx:spell_w': 'Electric Blast',
  'Jinx:spell_e': 'Explosive Trap',
  'Jinx:spell_r': 'Super Rocket',
  'Leona:spell_q': 'Solar Strike',
  'Leona:spell_w': 'Eclipse',
  'Leona:spell_e': 'Zenith Blade',
  'Leona:spell_r': 'Solar Flare',
  'Lux:spell_q': 'Light Binding',
  'Lux:spell_w': 'Protective Prism',
  'Lux:spell_e': 'Radiant Orb',
  'Lux:spell_r': 'Final Beam',
  'Malphite:spell_q': 'Rock Shard',
  'Malphite:spell_w': 'Tectonic Wave',
  'Malphite:spell_e': 'Ground Slam',
  'Malphite:spell_r': 'Unstoppable Impact',
  'Soraka:spell_q': 'Starfall',
  'Soraka:spell_w': 'Astral Grace',
  'Soraka:spell_e': 'Zone of Silence',
  'Soraka:spell_r': 'Cosmic Wish',
  'Warwick:spell_q': 'Bite',
  'Warwick:spell_w': 'Blood Trail',
  'Warwick:spell_e': 'Howl of Fear',
  'Warwick:spell_r': 'Beastly Leap',
} as const satisfies Readonly<Record<CombatVisualTitleId, string>>;

const enhancementEffectsFr = {
  'assassin_burst_2:execute_damage': 'Dégâts augmentés contre cibles blessées',
  'assassin_burst_3:burst_amplify': 'Dégâts explosifs ultimes augmentés',
  'assassin_mobility_1:out_of_combat_speed': 'Vitesse de déplacement augmentée hors combat',
  'assassin_mobility_2:ambush_damage': 'Dégâts augmentés depuis la dissimulation',
  'assassin_mobility_3:stealth_on_kill': 'Invisibilité après une élimination',
  'assassin_sustain_3:survival_shield': 'Bouclier automatique quand PV bas',
  'tank_defense_3:revive': 'Survie automatique avec immunité temporaire',
  'tank_support_1:heal_share': 'Partage des soins avec alliés proches',
  'tank_support_2:ally_damage_reduction': 'Réduction dégâts pour alliés proches',
  'tank_support_3:damage_intercept': 'Interception des dégâts ciblés sur alliés',
  'tank_thorn_1:thornmail': 'Renvoi de dégâts physiques',
  'tank_thorn_2:burn_reflect': 'Dégâts basés sur PV max ennemis',
  'tank_thorn_3:vengeance_burst': 'Explosion de dégâts vrais après encaissement',
  'mage_burst_3:spell_echo': 'Chance de répéter les sorts de zone',
  'mage_control_1:slow': 'Ralentissement sur sorts',
  'mage_control_3:root_chance': "Chance d'enracinement",
  'mage_sustain_2:mana_restore': 'Restauration de mana après une élimination',
  'mage_sustain_3:cdr_ultimate': 'Réduction du délai de récupération ultime',
  'marksman_dps_2:attack_speed_on_kill': "Initiative d'attaque après élimination",
  'marksman_dps_3:bleed': 'Saignement sur attaques',
  'marksman_range_2:champion_damage': 'Dégâts directs augmentés',
  'marksman_range_3:execute_damage': 'Dégâts augmentés contre les cibles blessées',
  'marksman_survival_1:dodge': "Chance d'esquive",
  'marksman_survival_3:smoke_screen': 'Invisibilité et vitesse quand PV bas',
  'fighter_bruiser_2:bleed': 'Saignement sur attaques',
  'fighter_bruiser_3:berserker': 'Bonus de dégâts quand les PV sont bas',
  'fighter_duelist_1:riposte': 'Bonus de dégâts après esquive',
  'fighter_duelist_2:champion_damage': 'Dégâts augmentés contre champions',
  'fighter_duelist_3:duelist': 'Bonus en duel',
  'fighter_sustain_3:heal_on_kill': 'Soin massif après une élimination',
  'support_enchanter_1:heal_amp': 'Amplification des soins',
  'support_enchanter_2:shield_amp': 'Amplification des boucliers',
  'support_enchanter_3:damage_aura': 'Aura de dégâts pour alliés',
  'support_tanky_2:cc_extension': 'Durée des contrôles augmentée',
  'support_tanky_3:damage_sacrifice': 'Absorption de dégâts mortels',
  'support_utility_1:bush_vision': 'Vision dans les broussailles',
  'support_utility_2:aoe_slow': 'Ralentissement de zone augmenté',
  'support_utility_3:cc_aoe': 'Zone de contrôle augmentée',
} as const satisfies Readonly<Record<CombatEnhancementEffectId, string>>;

const enhancementEffectsEn = {
  'assassin_burst_2:execute_damage': 'Increased damage against wounded targets',
  'assassin_burst_3:burst_amplify': 'Increased ultimate burst damage',
  'assassin_mobility_1:out_of_combat_speed': 'Increased movement speed outside combat',
  'assassin_mobility_2:ambush_damage': 'Increased damage from concealment',
  'assassin_mobility_3:stealth_on_kill': 'Stealth after a kill',
  'assassin_sustain_3:survival_shield': 'Automatic shield at low HP',
  'tank_defense_3:revive': 'Automatic survival with temporary immunity',
  'tank_support_1:heal_share': 'Shares healing with nearby allies',
  'tank_support_2:ally_damage_reduction': 'Damage reduction for nearby allies',
  'tank_support_3:damage_intercept': 'Intercepts damage targeting allies',
  'tank_thorn_1:thornmail': 'Reflects physical damage',
  'tank_thorn_2:burn_reflect': 'Damage based on enemy maximum HP',
  'tank_thorn_3:vengeance_burst': 'Burst of true damage after taking damage',
  'mage_burst_3:spell_echo': 'Chance to repeat area-of-effect spells',
  'mage_control_1:slow': 'Spells apply a slow',
  'mage_control_3:root_chance': 'Chance to root',
  'mage_sustain_2:mana_restore': 'Restores mana on kill',
  'mage_sustain_3:cdr_ultimate': 'Reduced ultimate cooldown',
  'marksman_dps_2:attack_speed_on_kill': 'Attack initiative after an elimination',
  'marksman_dps_3:bleed': 'Attacks inflict bleeding',
  'marksman_range_2:champion_damage': 'Increased direct damage',
  'marksman_range_3:execute_damage': 'Increased damage against wounded targets',
  'marksman_survival_1:dodge': 'Chance to dodge',
  'marksman_survival_3:smoke_screen': 'Stealth and speed at low HP',
  'fighter_bruiser_2:bleed': 'Attacks inflict bleeding',
  'fighter_bruiser_3:berserker': 'Damage boost at low HP',
  'fighter_duelist_1:riposte': 'Bonus damage after dodging',
  'fighter_duelist_2:champion_damage': 'Increased damage against champions',
  'fighter_duelist_3:duelist': 'Bonus in a one-on-one duel',
  'fighter_sustain_3:heal_on_kill': 'Major heal on kill',
  'support_enchanter_1:heal_amp': 'Increased healing',
  'support_enchanter_2:shield_amp': 'Increased shielding',
  'support_enchanter_3:damage_aura': 'Damage aura for allies',
  'support_tanky_2:cc_extension': 'Increased crowd-control duration',
  'support_tanky_3:damage_sacrifice': 'Absorbs lethal damage',
  'support_utility_1:bush_vision': 'Vision inside brush',
  'support_utility_2:aoe_slow': 'Increased area slow',
  'support_utility_3:cc_aoe': 'Increased crowd-control area',
} as const satisfies Readonly<Record<CombatEnhancementEffectId, string>>;

const presenterStatsFr = {
  hp: 'PV',
  mp: 'PM',
  atk: 'ATQ',
  ap: 'PUI',
  def: 'Armure',
  mr: 'RM',
  spd: 'Vitesse',
  crit: 'Critique',
  attackSpeed: 'Initiative ATQ',
  hpRegen: 'Régénération PV',
  mpRegen: 'Régénération PM',
  armorPen: 'Pen. Armure',
  magicPen: 'Pen. Magique',
  lifesteal: 'Vol de vie',
  omnivamp: 'Omnivampirisme',
  tenacity: 'Ténacité',
  abilityHaste: 'Hâte',
  attackRange: 'Profil de portée',
} as const satisfies Readonly<Record<PresenterStatId, string>>;

const presenterStatsEn = {
  hp: 'HP',
  mp: 'MP',
  atk: 'AD',
  ap: 'AP',
  def: 'Armor',
  mr: 'MR',
  spd: 'Speed',
  crit: 'Critical strike',
  attackSpeed: 'Attack initiative',
  hpRegen: 'HP regen',
  mpRegen: 'MP regen',
  armorPen: 'Armor pen.',
  magicPen: 'Magic pen.',
  lifesteal: 'Lifesteal',
  omnivamp: 'Omnivamp',
  tenacity: 'Tenacity',
  abilityHaste: 'Ability haste',
  attackRange: 'Range profile',
} as const satisfies Readonly<Record<PresenterStatId, string>>;

const frFR = {
  page: {
    title: 'Combat',
    command: {
      targetRequired: 'Cible requise',
      targetReady: 'Cible prête',
      selectedTarget: (name: string) =>
        `${name} est sélectionné. Choisissez maintenant une action.`,
      combatFinished: 'Combat terminé',
      combatFinishedDetail: 'Consultez le journal ou poursuivez depuis le résultat du combat.',
      serverResolution: 'Résolution serveur',
      automaticAction: 'Action automatique',
      enemyTurn: 'Tour adverse',
      automaticPlayerDetail: 'Votre prochaine action est en cours de résolution automatique.',
      automaticEnemyDetail: 'L’action ennemie est en cours de résolution.',
      autoplayActive: 'Jeu automatique actif',
      autoplayDetail: 'Vos actions sont choisies automatiquement pour ce tour.',
      yourTurn: 'À vous de jouer',
      yourTurnDetail: 'Choisissez une action, puis une cible lorsqu’elle est demandée.',
      preparation: 'Préparation',
      preparationDetail: 'Les commandes seront disponibles au début de votre tour.',
      enemyTurnDetail: 'Les commandes sont verrouillées pendant l’action ennemie.',
      selectValidPortrait: 'Sélectionnez un portrait valide',
      targetDependsOnAction: 'Selon l’action choisie',
    },
    status: {
      enemyAction: 'Action ennemie',
      countdown: (label: string, seconds: string) => `${label} dans ${seconds} s`,
      manual: 'Mode manuel — choisissez une action ou appuyez sur Espace.',
      waitingForEnemy: "En attente du tour de l'ennemi…",
    },
    tutorial: {
      title: 'Ton premier combat',
      buttonLabel: 'Règles du combat',
      steps: [
        {
          title: 'Ordre des tours',
          body: 'La vitesse fixe qui agit en premier. L’indicateur annonce le combattant actif et les ennemis jouent automatiquement.',
        },
        {
          title: 'Action et cible',
          body: 'Choisis Attaque, Q, W, E ou R, puis une cible autorisée. Le bouton Exécuter le tour confirme la commande.',
        },
        {
          title: 'Coût et recharge',
          body: 'Chaque sort affiche son coût en PM et sa recharge. Un sort indisponible est désactivé et son état est annoncé.',
        },
        {
          title: 'Statuts et journal',
          body: 'Renforcements, affaiblissements, contrôles et dégâts persistants sont visibles sur les portraits et consignés dans le journal.',
        },
        {
          title: 'Jeu automatique',
          body: 'Le jeu automatique est désactivé par défaut. Si tu l’actives, le jeu choisit tes actions ; le même bouton permet de reprendre la main.',
        },
      ],
    },
    arenaTitle: 'Arène tactique',
    resultTitle: 'Résultat du combat',
    steps: {
      action: '1 · Action',
      target: '2 · Cible',
      confirmation: '3 · Confirmation',
    },
    spaceAria: (label: string) => `${label} (Espace)`,
    spaceShortcut: '[Espace]',
    shortcuts: {
      spells: 'Q / W / E / R : choisir un sort disponible.',
      execute: 'Espace : exécuter le tour manuel.',
      leave: 'Échap : retourner à la carte lorsque le combat est terminé.',
      focus: 'Tab puis Entrée ou Espace : activer le contrôle ayant le focus.',
    },
  },
  portrait: {
    target: (name: string) => `Cibler ${name}`,
    health: (name: string) => `PV de ${name}`,
    mana: (name: string) => `PM de ${name}`,
  },
  stage: {
    hpShort: 'PV',
    shield: (amount: number) => `+${formatCombatNumber('fr-FR', amount)} bouclier`,
    revived: (amount: number) => `Ranimé · ${formatCombatNumber('fr-FR', amount)} PV`,
    actionAnnouncement: (
      source: string,
      action: string,
      target: string | undefined,
      amount: string | undefined,
    ) =>
      `${source} utilise ${action}${target ? ` sur ${target}` : ''}${amount ? ` : ${amount}` : ''}.`,
    targets: (count: number) => `${formatCombatNumber('fr-FR', count)} cibles`,
    target: 'cible',
    self: 'soi-même',
    actionTarget: (source: string, target: string) => `${source} → ${target}`,
    prepareAction: 'Préparez votre prochaine action',
    observeEnemyTurn: 'Observez le tour adverse',
  },
  ui: {
    phase: (phase: string) => `Phase: ${phase}`,
  },
  tooltip: {
    mana: 'PM :',
    estimatedEffects: 'Effets estimés',
    estimateNote: 'Les dégâts sont estimés avant l’armure et la résistance de la cible.',
    cooldownTurnCount: (current: number) =>
      `${formatCombatNumber('fr-FR', current)} ${current === 1 ? 'tour' : 'tours'}`,
    cooldownStatus: (current: number) =>
      `⏳ Recharge : ${formatCombatNumber('fr-FR', current)} ${
        current === 1 ? 'tour restant' : 'tours restants'
      }`,
    ready: '✅ Prêt à lancer',
    press: 'Appuyez sur',
    toCast: 'pour lancer',
  },
  preview: {
    damage: {
      physical: 'Dégâts physiques',
      magical: 'Dégâts magiques',
      true: 'Dégâts bruts',
    } satisfies Readonly<Record<PreviewDamageTone, string>>,
    control: {
      charm: 'Charme',
      fear: 'Peur',
      knockup: 'Projection',
      root: 'Immobilisation',
      silence: 'Silence',
      slow: 'Ralentissement',
      snare: 'Immobilisation',
      stun: 'Étourdissement',
    } satisfies Readonly<Record<PreviewControlId, string>>,
    utility: {
      buff: 'Bonus temporaire',
      debuff: 'Affaiblissement',
      execute: "Seuil d'exécution",
      revive: 'Réanimation',
    } satisfies Readonly<Record<PreviewUtilityId, string>>,
    stats: {
      armor: 'Armure',
      attackDamage: "Dégâts d'attaque",
      attackSpeed: "Initiative d'attaque",
      damageReduction: 'Réduction des dégâts',
      moveSpeed: 'Vitesse de déplacement',
    } satisfies Readonly<Record<PreviewStatId, string>>,
    unknownStat: 'Statistique inconnue',
    damageOverTime: (damageLabel: string) => `${damageLabel} sur la durée`,
    beforeDefenses: 'avant défenses',
    healOverTime: 'Soin sur la durée',
    heal: 'Soin',
    shield: 'Bouclier',
    genericControl: 'Contrôle',
    maxHealth: 'des PV max',
  },
  logs: {
    actions: {
      basic_attack: 'Attaque de base',
      spell_q: 'Sort Q',
      spell_w: 'Sort W',
      spell_e: 'Sort E',
      spell_r: 'Sort R (Ultime)',
    } satisfies Readonly<Record<ActionLabelId, string>>,
    crowdControl: {
      stun: 'étourdissement',
      snare: 'immobilisation',
      silence: 'silence',
      slow: 'ralentissement',
      knockup: 'projection',
      fear: 'peur',
      charm: 'charme',
    } satisfies Readonly<Record<CrowdControlLabelId, string>>,
    roundStart: (round: number) => `=== Tour ${formatCombatNumber('fr-FR', round)} ===`,
    action: (champion: string, action: string) => `${champion}: ${action}`,
    crowdControlApplied: (source: string, target: string, control: string, duration: number) =>
      `${source} → ${target}: ${control} (${formatCombatNumber('fr-FR', duration)} ${duration === 1 ? 'tour' : 'tours'})`,
    turnSkipped: (champion: string, controls: string) =>
      `${champion} perd son action (${controls})`,
    damage: (source: string, target: string, amount: number, isCrit: boolean) =>
      `${source} → ${target}: ${formatCombatNumber('fr-FR', amount)} dégâts${isCrit ? ' CRITIQUE !' : ''}`,
    heal: (source: string, target: string, amount: number) =>
      `${source} → ${target}: +${formatCombatNumber('fr-FR', amount)} PV`,
    shield: (source: string, target: string, amount: number) =>
      `${source} → ${target}: +${formatCombatNumber('fr-FR', amount)} bouclier`,
    revive: (source: string, target: string, amount: number) =>
      `${source} ranime ${target} avec ${formatCombatNumber('fr-FR', amount)} PV`,
    defeated: (champion: string) => `${champion} a été vaincu !`,
    result: {
      draw: 'Égalité !',
      player: 'Victoire !',
      enemy: 'Défaite !',
    },
  },
  visuals: visualTitlesFr,
  presenter: {
    stats: presenterStatsFr,
    unavailable: (description: string) => `${description} (indisponible)`,
    ranked: (description: string, rank: number, maxRanks: number) =>
      `${description} (Rang ${formatCombatNumber('fr-FR', rank)}/${formatCombatNumber('fr-FR', maxRanks)})`,
    effects: enhancementEffectsFr,
  },
} as const;

type MatchingLocaleCatalog<T> = T extends (...args: infer Args) => unknown
  ? (...args: Args) => string
  : T extends string
    ? string
    : T extends readonly [unknown, ...unknown[]]
      ? { readonly [Key in keyof T]: MatchingLocaleCatalog<T[Key]> }
      : T extends object
        ? { readonly [Key in keyof T]: MatchingLocaleCatalog<T[Key]> }
        : T;

const enUS = {
  page: {
    title: 'Combat',
    command: {
      targetRequired: 'Target required',
      targetReady: 'Target ready',
      selectedTarget: (name: string) => `${name} is selected. Now choose an action.`,
      combatFinished: 'Combat over',
      combatFinishedDetail: 'Review the log or continue from the combat result.',
      serverResolution: 'Server resolution',
      automaticAction: 'Automatic action',
      enemyTurn: 'Enemy turn',
      automaticPlayerDetail: 'Your next action is being resolved automatically.',
      automaticEnemyDetail: 'The enemy action is being resolved.',
      autoplayActive: 'Autoplay active',
      autoplayDetail: 'Your actions are selected automatically for this turn.',
      yourTurn: 'Your turn',
      yourTurnDetail: 'Choose an action, then a target when prompted.',
      preparation: 'Preparing',
      preparationDetail: 'Commands will become available at the start of your turn.',
      enemyTurnDetail: 'Commands are locked during the enemy action.',
      selectValidPortrait: 'Select a valid portrait',
      targetDependsOnAction: 'Depends on the selected action',
    },
    status: {
      enemyAction: 'Enemy action',
      countdown: (label: string, seconds: string) => `${label} in ${seconds}s`,
      manual: 'Manual mode — choose an action or press Space.',
      waitingForEnemy: "Waiting for the enemy's turn…",
    },
    tutorial: {
      title: 'Your first combat',
      buttonLabel: 'Combat rules',
      steps: [
        {
          title: 'Turn order',
          body: 'Speed determines who acts first. The indicator announces the active combatant, and enemies play automatically.',
        },
        {
          title: 'Action and target',
          body: 'Choose Attack, Q, W, E, or R, then an allowed target. The Execute turn button confirms the command.',
        },
        {
          title: 'Cost and cooldown',
          body: 'Each spell shows its MP cost and cooldown. An unavailable spell is disabled and its status is announced.',
        },
        {
          title: 'Statuses and log',
          body: 'Buffs, debuffs, crowd control, and damage-over-time effects appear on portraits and in the combat log.',
        },
        {
          title: 'Autoplay',
          body: 'Auto is off by default. When enabled, the game chooses your actions; use the same button to take control again.',
        },
      ],
    },
    arenaTitle: 'Tactical arena',
    resultTitle: 'Combat result',
    steps: {
      action: '1 · Action',
      target: '2 · Target',
      confirmation: '3 · Confirmation',
    },
    spaceAria: (label: string) => `${label} (Space)`,
    spaceShortcut: '[Space]',
    shortcuts: {
      spells: 'Q / W / E / R: choose an available spell.',
      execute: 'Space: execute the manual turn.',
      leave: 'Escape: return to the map once combat is over.',
      focus: 'Tab, then Enter or Space: activate the focused control.',
    },
  },
  portrait: {
    target: (name: string) => `Target ${name}`,
    health: (name: string) => `${name}'s HP`,
    mana: (name: string) => `${name}'s MP`,
  },
  stage: {
    hpShort: 'HP',
    shield: (amount: number) => `+${formatCombatNumber('en-US', amount)} shield`,
    revived: (amount: number) => `Revived · ${formatCombatNumber('en-US', amount)} HP`,
    actionAnnouncement: (
      source: string,
      action: string,
      target: string | undefined,
      amount: string | undefined,
    ) => `${source} uses ${action}${target ? ` on ${target}` : ''}${amount ? `: ${amount}` : ''}.`,
    targets: (count: number) => `${formatCombatNumber('en-US', count)} targets`,
    target: 'target',
    self: 'self',
    actionTarget: (source: string, target: string) => `${source} → ${target}`,
    prepareAction: 'Prepare your next action',
    observeEnemyTurn: 'Watch the enemy turn',
  },
  ui: {
    phase: (phase: string) => `Phase: ${phase}`,
  },
  tooltip: {
    mana: 'MP:',
    estimatedEffects: 'Estimated effects',
    estimateNote: 'Damage is estimated before the target’s armor and magic resistance.',
    cooldownTurnCount: (current: number) =>
      `${formatCombatNumber('en-US', current)} ${current === 1 ? 'turn' : 'turns'}`,
    cooldownStatus: (current: number) =>
      `⏳ Cooldown: ${formatCombatNumber('en-US', current)} ${
        current === 1 ? 'turn' : 'turns'
      } remaining`,
    ready: '✅ Ready to cast',
    press: 'Press',
    toCast: 'to cast',
  },
  preview: {
    damage: {
      physical: 'Physical damage',
      magical: 'Magic damage',
      true: 'True damage',
    },
    control: {
      charm: 'Charm',
      fear: 'Fear',
      knockup: 'Knockup',
      root: 'Root',
      silence: 'Silence',
      slow: 'Slow',
      snare: 'Root',
      stun: 'Stun',
    },
    utility: {
      buff: 'Temporary buff',
      debuff: 'Debuff',
      execute: 'Execute threshold',
      revive: 'Revive',
    },
    stats: {
      armor: 'Armor',
      attackDamage: 'Attack damage',
      attackSpeed: 'Attack initiative',
      damageReduction: 'Damage reduction',
      moveSpeed: 'Movement speed',
    },
    unknownStat: 'Unknown stat',
    damageOverTime: (damageLabel: string) => `${damageLabel} over time`,
    beforeDefenses: 'before defenses',
    healOverTime: 'Healing over time',
    heal: 'Healing',
    shield: 'Shield',
    genericControl: 'Crowd control',
    maxHealth: 'of max HP',
  },
  logs: {
    actions: {
      basic_attack: 'Basic attack',
      spell_q: 'Q spell',
      spell_w: 'W spell',
      spell_e: 'E spell',
      spell_r: 'R spell (Ultimate)',
    },
    crowdControl: {
      stun: 'stun',
      snare: 'root',
      silence: 'silence',
      slow: 'slow',
      knockup: 'knockup',
      fear: 'fear',
      charm: 'charm',
    },
    roundStart: (round: number) => `=== Round ${formatCombatNumber('en-US', round)} ===`,
    action: (champion: string, action: string) => `${champion}: ${action}`,
    crowdControlApplied: (source: string, target: string, control: string, duration: number) =>
      `${source} → ${target}: ${control} (${formatCombatNumber('en-US', duration)} ${duration === 1 ? 'turn' : 'turns'})`,
    turnSkipped: (champion: string, controls: string) =>
      `${champion} loses their action (${controls})`,
    damage: (source: string, target: string, amount: number, isCrit: boolean) =>
      `${source} → ${target}: ${formatCombatNumber('en-US', amount)} damage${isCrit ? ' CRITICAL!' : ''}`,
    heal: (source: string, target: string, amount: number) =>
      `${source} → ${target}: +${formatCombatNumber('en-US', amount)} HP`,
    shield: (source: string, target: string, amount: number) =>
      `${source} → ${target}: +${formatCombatNumber('en-US', amount)} shield`,
    revive: (source: string, target: string, amount: number) =>
      `${source} revives ${target} with ${formatCombatNumber('en-US', amount)} HP`,
    defeated: (champion: string) => `${champion} was defeated!`,
    result: {
      draw: 'Draw!',
      player: 'Victory!',
      enemy: 'Defeat!',
    },
  },
  visuals: visualTitlesEn,
  presenter: {
    stats: presenterStatsEn,
    unavailable: (description: string) => `${description} (unavailable)`,
    ranked: (description: string, rank: number, maxRanks: number) =>
      `${description} (Rank ${formatCombatNumber('en-US', rank)}/${formatCombatNumber('en-US', maxRanks)})`,
    effects: enhancementEffectsEn,
  },
} as const satisfies MatchingLocaleCatalog<typeof frFR>;

export type CombatContentCatalog = MatchingLocaleCatalog<typeof frFR>;

export const combatContent: Readonly<Record<CombatContentLocale, CombatContentCatalog>> = {
  'fr-FR': frFR,
  'en-US': enUS,
};

export const combatCopy = combatContent[locale];

export function combatVisualTitleId(
  championId: string | undefined,
  action: 'spell_q' | 'spell_w' | 'spell_e' | 'spell_r',
): CombatVisualTitleId {
  const candidate = `${championId ?? 'fallback'}:${action}` as CombatVisualTitleId;
  return COMBAT_VISUAL_TITLE_IDS.includes(candidate) ? candidate : `fallback:${action}`;
}

export function combatEnhancementEffectId(
  nodeId: string,
  effectType: string,
): CombatEnhancementEffectId | undefined {
  const candidate = `${nodeId}:${effectType}` as CombatEnhancementEffectId;
  return COMBAT_ENHANCEMENT_EFFECT_IDS.includes(candidate) ? candidate : undefined;
}
