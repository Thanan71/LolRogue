import { locale } from './fr';

const EXACT_TRANSLATIONS: Readonly<Record<string, string>> = {
  'Menu principal': 'Main menu',
  Connexion: 'Log in',
  'Sélection de départ': 'Starter selection',
  'Carte de la partie': 'Run map',
  Combat: 'Combat',
  Boutique: 'Shop',
  Recrutement: 'Recruitment',
  Repos: 'Rest',
  Événement: 'Event',
  Trésor: 'Treasure',
  'Résultat de la partie': 'Run result',
  'Défi quotidien': 'Daily challenge',
  Profil: 'Profile',
  'Base des champions': 'Champion database',
  Réglages: 'Settings',
  Crédits: 'Credits',
  'Guide et règles': 'Guide and rules',
  'Informations légales et confidentialité': 'Legal information and privacy',
  Administration: 'Administration',
  'Page introuvable': 'Page not found',

  Aide: 'Help',
  'Fermer le tutoriel': 'Close tutorial',
  Précédent: 'Previous',
  Suivant: 'Next',
  'J’ai compris': 'Got it',
  "J'ai compris": 'Got it',

  Tous: 'All',
  Sac: 'Bag',
  Équipés: 'Equipped',
  'Équipement du run': 'Run equipment',
  Inventaire: 'Inventory',
  'Inventaire plein': 'Inventory full',
  'Filtrer l’inventaire': 'Filter inventory',
  "Filtrer l'inventaire": 'Filter inventory',
  Trier: 'Sort',
  'Inventaire trié.': 'Inventory sorted.',
  'Objets disponibles': 'Available items',
  'Dans le sac': 'In bag',
  'Aucun objet dans cette catégorie.': 'No items in this category.',
  'Objet sélectionné': 'Selected item',
  'Disponible dans le sac': 'Available in bag',
  'Choisir un champion pour transférer': 'Choose a champion to transfer to',
  'Choisir un champion à équiper': 'Choose a champion to equip',
  'Équipement complet': 'Equipment full',
  'Objet unique déjà équipé': 'Unique item already equipped',
  'Porte déjà cet objet': 'Already carrying this item',
  Indisponible: 'Unavailable',

  'Escouade active': 'Active squad',
  'Sélection du champion': 'Champion selection',
  'Fiche sélectionnée': 'Selected sheet',
  'PV actuels / maximum': 'Current / maximum HP',
  'Emplacements d’objets': 'Item slots',
  "Emplacements d'objets": 'Item slots',
  'niveau maximum': 'maximum level',

  'Voie du haut': 'Top lane',
  Jungle: 'Jungle',
  'Voie du milieu': 'Mid lane',
  'Voie du bas': 'Bot lane',
  Rivière: 'River',
  'Base ennemie': 'Enemy base',
  'Générer la carte de la partie': 'Generate run map',
  'Territoire inconnu': 'Unknown territory',
  Biome: 'Biome',
  'Comprendre la carte': 'Understanding the map',
  'Tutoriel carte': 'Map tutorial',
  'Choisir un chemin': 'Choose a path',
  'Résoudre la rencontre': 'Resolve the encounter',
  'Améliorer la run': 'Upgrade the run',
  'Terminer et sauvegarder': 'Finish and save',
  'Repères et équipement de la run': 'Run landmarks and equipment',
  'Légende · Runes · Augments': 'Legend · Runes · Augments',
  'Légende de la carte': 'Map legend',
  Légende: 'Legend',
  Aucune: 'None',
  Aucun: 'None',
  Fermer: 'Close',
  'Itinéraire du biome': 'Biome route',
  'Progression en cours': 'Progress in progress',
  Recentrer: 'Recenter',
  'Carte interactive de la partie': 'Interactive run map',
  terminé: 'completed',
  'position actuelle': 'current position',
  accessible: 'accessible',
  'branche fermée': 'closed branch',
  verrouillé: 'locked',
  ICI: 'HERE',
  CHOIX: 'CHOICE',
  Élite: 'Elite',
  Départ: 'Start',
  Sortie: 'Exit',
  'Faites glisser la carte': 'Drag the map',

  'Compose ton équipe du jour': 'Build your daily team',
  'Compose ton équipe': 'Build your team',
  Équipe: 'Team',
  Runes: 'Runes',
  Départ: 'Start',
  'Sélectionne un champion pour continuer': 'Select a champion to continue',
  'Chargement du défi…': 'Loading challenge…',
  'Vérification…': 'Verifying…',
  'Reprendre la partie vérifiée': 'Resume verified run',
  'Confirmer le choix': 'Confirm selection',

  'Bonus de l’objet': 'Item bonuses',
  "Bonus de l'objet": 'Item bonuses',
  'État de la boutique': 'Shop status',
  'objets disponibles': 'items available',
  'Équipez votre escouade avant de reprendre la route. Les achats sont définitifs.':
    'Equip your squad before heading back out. Purchases are final.',
  'Votre équipe': 'Your team',
  'Statistiques du champion': 'Champion stats',
  Coût: 'Cost',
  'Chances de réussite': 'Success chance',
  Passer: 'Skip',
  'Points de vie de l’équipe': 'Team hit points',
  "Points de vie de l'équipe": 'Team hit points',
  'Issue inconnue': 'Unknown outcome',
  'Le choix vous appartient': 'The choice is yours',
  'Résultat de la rencontre': 'Encounter result',
  'Objet laissé sur place': 'Item left behind',
  'Recrutement impossible': 'Recruitment unavailable',
  'Rien ne se produit…': 'Nothing happens…',
  'Total :': 'Total:',

  "Arbre d'Amélioration": 'Enhancement Tree',
  "Arbre d'Amélioration -": 'Enhancement Tree -',
  'Nœuds de Base': 'Core Nodes',
  'Maximum atteint': 'Maximum reached',
  'Enregistrement…': 'Saving…',
  Débloquer: 'Unlock',
  'Indisponible dans ce mode': 'Unavailable in this mode',
  'Niveau de maîtrise insuffisant': 'Mastery level too low',
  'Bonbons insuffisants': 'Not enough candies',
  'Prérequis non débloqué': 'Prerequisite not unlocked',

  'Griffes Aiguisées': 'Sharpened Claws',
  Agilité: 'Agility',
  Pénétration: 'Penetration',
  Burst: 'Burst',
  'Dégâts explosifs instantanés': 'Instant burst damage',
  'Frappe Critique': 'Critical Strike',
  Exécution: 'Execution',
  'Mort Subite': 'Sudden Death',
  Mobilité: 'Mobility',
  'Mouvement et esquive': 'Movement and evasion',
  'Pas Furtif': 'Stealthy Step',
  Embuscade: 'Ambush',
  Ombre: 'Shadow',
  Survie: 'Survival',
  'Vol de vie et esquive': 'Lifesteal and evasion',
  'Soif de Sang': 'Bloodthirst',
  Vampirisme: 'Vampirism',
  Phénix: 'Phoenix',
  'Armure Renforcée': 'Reinforced Armor',
  'Résistance Magique': 'Magic Resistance',
  Vitalité: 'Vitality',
  Forteresse: 'Fortress',
  'Défense ultime': 'Ultimate defense',
  'Peau Épaisse': 'Thick Skin',
  Ténacité: 'Tenacity',
  Immortel: 'Immortal',
  Protecteur: 'Protector',
  'Protection des alliés': 'Ally protection',
  "Bouclier d'Allié": 'Ally Shield',
  Gardien: 'Guardian',
  Sacrifice: 'Sacrifice',
  Épines: 'Thorns',
  'Renvoi de dégâts': 'Damage reflection',
  Pointes: 'Spikes',
  Brûlure: 'Burn',
  Vengeance: 'Vengeance',
  'Étincelle Arcane': 'Arcane Spark',
  Force: 'Strength',
  Endurance: 'Endurance',
  Fureur: 'Fury',
  Brute: 'Bruiser',
  'Dégâts et résistance': 'Damage and durability',
  'Frappe Lourde': 'Heavy Strike',
  Saignée: 'Bleeding',
  Berserker: 'Berserker',
  Portée: 'Range',
  'Attaques à distance': 'Ranged attacks',
  Allonge: 'Reach',
  Percée: 'Piercing Shot',
  Sniper: 'Sniper',
  Esquive: 'Evasion',
  "Rapide comme l'Éclair": 'Lightning Fast',
  'Brouillard de Fumée': 'Smoke Screen',
  Utilitaire: 'Utility',
  'Vision et contrôle': 'Vision and control',
  Vision: 'Vision',
  'Entrave de Zone': 'Area Hindrance',
  'Contrôle Total': 'Total Control',
  'Corps Garde': 'Bodyguard',
  Entrave: 'Hindrance',
  'Sacrifice Ultime': 'Ultimate Sacrifice',
};

const REPLACEMENTS: readonly [RegExp, string][] = [
  [/^Étape (\d+) sur (\d+)$/u, 'Step $1 of $2'],
  [/^Niv\. (\d+)$/u, 'Lv. $1'],
  [/^Niv (\d+)\/(\d+)$/u, 'Lv. $1/$2'],
  [/^(\d+) objets$/u, '$1 items'],
  [/^Emplacement (\d+) vide$/u, 'Empty slot $1'],
  [/^Emplacement (\d+) : /u, 'Slot $1: '],
  [/^Équipé · /u, 'Equipped · '],
  [/^Vente · /u, 'Sell · '],
  [/^Vente : /u, 'Sell: '],
  [/^Porté par /u, 'Equipped by '],
  [/^Impossible de déplacer (.+)\. Réessaie\.$/u, 'Unable to move $1. Try again.'],
  [/^Impossible de déséquiper (.+)\. Réessaie\.$/u, 'Unable to unequip $1. Try again.'],
  [/^Impossible de vendre (.+)\. Réessaie\.$/u, 'Unable to sell $1. Try again.'],
  [/^Transfert effectué : (.+), de (.+) à (.+)\.$/u, 'Transfer complete: $1, from $2 to $3.'],
  [/^Objet équipé : (.+) sur (.+)\.$/u, 'Item equipped: $1 on $2.'],
  [/^Objet replacé dans le sac : (.+)\.$/u, 'Item returned to bag: $1.'],
  [/^Vente confirmée : (.+), \+(\d+) /u, 'Sale confirmed: $1, +$2 '],
  [/^Inventaire : vide\.$/iu, 'Inventory: empty.'],
  [/^(\d+) champions$/u, '$1 champions'],
  [/^Sélectionner (.+), niveau (\d+), (\d+) sur (\d+) PV, expérience (.+)$/u,
    'Select $1, level $2, $3 of $4 HP, experience $5'],
  [/^Progression des biomes : (\d+) sur (\d+)$/u, 'Biome progress: $1 of $2'],
  [/^(\d+) chemins? disponibles?$/u, '$1 available path(s)'],
  [/^colonne (\d+), ligne (\d+)$/u, 'column $1, row $2'],
  [/^Expédition · Biome (\d+) sur (\d+)$/u, 'Expedition · Biome $1 of $2'],
  [/^Relancer le roster \((\d+)\)$/u, 'Reroll roster ($1)'],
  [/^Cette run exige exactement (\d+) starters?\.$/u, 'This run requires exactly $1 starter(s).'],
  [/^Run normale :/u, 'Normal run:'],
  [/^Tous les joueurs affrontent/u, 'All players face'],
  [/^Une tentative vérifiée interrompue/u, 'An interrupted verified attempt'],
  [/^(.+) a été ajouté à l’inventaire\.$/u, '$1 was added to the inventory.'],
  [/^(.+) a rejoint votre équipe\.$/u, '$1 joined your team.'],
  [/^Soin de (\d+) % des PV$/u, 'Heal $1% of HP'],
  [/^Ce repos a déjà été utilisé\./u, 'This rest stop has already been used.'],
  [/^Toute l’équipe a récupéré/u, 'The whole team recovered'],
  [/^Le repos ne peut pas être appliqué/u, 'The rest cannot be applied'],
  [/^Le paiement du repos a échoué\.$/u, 'Rest payment failed.'],
  [/^Le soin n’a pas pu être enregistré\./u, 'The healing could not be saved.'],
  [/^Offrande :/u, 'Offering:'],
  [/^Objet obtenu :/u, 'Item obtained:'],
  [/^Équipe soignée :/u, 'Team healed:'],
  [/^Piège déclenché :/u, 'Trap triggered:'],
  [/^Amélioration :/u, 'Upgrade:'],
  [/^Inventaire plein —/u, 'Inventory full —'],
  [/^Équipe complète —/u, 'Team full —'],
  [/^Ce champion fait déjà partie de l’équipe\.$/u, 'This champion is already on the team.'],
  [/^Chances de réussite :/u, 'Success chance:'],
  [/^L’or n’est dépensé que si le recrutement réussit\.$/u,
    'Gold is only spent if recruitment succeeds.'],
  [/^(.+) rejoint ton équipe !$/u, '$1 joins your team!'],
  [/^(.+) a pris la fuite\.$/u, '$1 ran away.'],
  [/^Tu conserves ton or malgré cette tentative\.$/u, 'You keep your gold despite this attempt.'],
  [/^Maîtrise: Niveau (\d+)$/u, 'Mastery: Level $1'],
  [/^Requis: Niveau (\d+) \(actuel: Niveau (\d+)\)$/u, 'Required: Level $1 (current: Level $2)'],
  [/^Requis: (.+) \(actuel: (.+)\)$/u, 'Required: $1 (current: $2)'],
  [/^Ce nœud est déjà au niveau maximum/u, 'This node is already at maximum level'],
  [/^Maîtrise (\d+) requise$/u, 'Mastery $1 required'],
  [/^Ulti:/u, 'Ultimate:'],
  [/^Les attaques /u, 'Attacks '],
  [/^Les sorts /u, 'Spells '],
  [/^Quand PV /u, 'When HP '],
  [/^En dessous de /u, 'Below '],
  [/^Cible en dessous de /u, 'Target below '],
  [/^Cible à plus de /u, 'Target farther than '],
  [/^Après /u, 'After '],
  [/^Dégâts augmentés/u, 'Increased damage'],
  [/^Dégâts /u, 'Damage '],
  [/^Vitesse de déplacement/u, 'Move speed'],
  [/^Vitesse d'attaque/u, 'Attack speed'],
  [/^Résistance magique/u, 'Magic resistance'],
  [/^Régénération PV/u, 'HP regeneration'],
  [/^Pénétration d'armure/u, 'Armor penetration'],
  [/^Chance d'esquive/u, 'Evasion chance'],
  [/^Chances de coup critique/u, 'Critical strike chance'],
  [/^Vol de vie/u, 'Lifesteal'],
  [/^Bouclier/u, 'Shield'],
  [/^Invisibilité/u, 'Stealth'],
  [/^Attaques traversantes/u, 'Piercing attacks'],
  [/^Saignement/u, 'Bleeding'],
  [/^Vision dans/u, 'Vision in'],
  [/^Ralentissement/u, 'Slow'],
  [/^Durée de CC/u, 'CC duration'],
  [/^Absorption de dégâts/u, 'Damage absorption'],
  [/^Zone de CC/u, 'CC area'],
];

const WORD_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\bPV\b/gu, 'HP'],
  [/\bPM\b/gu, 'MP'],
  [/\bNiveau\b/gu, 'Level'],
  [/\bniveau\b/gu, 'level'],
  [/\bMaîtrise\b/gu, 'Mastery'],
  [/\bmaîtrise\b/gu, 'mastery'],
  [/\bDégâts\b/gu, 'Damage'],
  [/\bdégâts\b/gu, 'damage'],
  [/\bArmure\b/gu, 'Armor'],
  [/\barmure\b/gu, 'armor'],
  [/\bPuissance\b/gu, 'Ability Power'],
  [/\bpuissance\b/gu, 'ability power'],
  [/\bVitesse\b/gu, 'Speed'],
  [/\bvitesse\b/gu, 'speed'],
  [/\bCritique\b/gu, 'Critical'],
  [/\bcritique\b/gu, 'critical'],
  [/\bChampion inconnu\b/gu, 'Unknown champion'],
  [/\bchampion inconnu\b/gu, 'unknown champion'],
  [/\bobjets\b/gu, 'items'],
  [/\bobjet\b/gu, 'item'],
  [/\bÉquipe\b/gu, 'Team'],
  [/\béquipe\b/gu, 'team'],
  [/\bInventaire\b/gu, 'Inventory'],
  [/\binventaire\b/gu, 'inventory'],
  [/\bBonbons\b/gu, 'Candies'],
  [/\bbonbons\b/gu, 'candies'],
  [/\bRequis\b/gu, 'Required'],
  [/\brequis\b/gu, 'required'],
  [/\bactuel\b/gu, 'current'],
  [/\bactuelle\b/gu, 'current'],
  [/\bmaximum\b/gu, 'maximum'],
  [/\bsoins\b/gu, 'healing'],
  [/\bsoin\b/gu, 'heal'],
  [/\bOr\b/gu, 'Gold'],
  [/\bor\b/gu, 'gold'],
];

function preserveOuterWhitespace(original: string, translated: string): string {
  const leading = original.match(/^\s*/u)?.[0] ?? '';
  const trailing = original.match(/\s*$/u)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

export function translateLegacyTextToEnglish(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const exact = EXACT_TRANSLATIONS[trimmed];
  if (exact !== undefined) return preserveOuterWhitespace(value, exact);

  let translated = trimmed;
  for (const [pattern, replacement] of REPLACEMENTS) {
    translated = translated.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of WORD_REPLACEMENTS) {
    translated = translated.replace(pattern, replacement);
  }
  return preserveOuterWhitespace(value, translated);
}

const TRANSLATABLE_ATTRIBUTES = ['aria-label', 'aria-description', 'title', 'placeholder'] as const;

function translateElement(element: Element): void {
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const translated = translateLegacyTextToEnglish(current);
    if (translated !== current) element.setAttribute(attribute, translated);
  }
}

function translateSubtree(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    const current = root.nodeValue;
    if (!current) return;
    const translated = translateLegacyTextToEnglish(current);
    if (translated !== current) root.nodeValue = translated;
    return;
  }

  if (root instanceof Element) translateElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const value = current.nodeValue;
      if (value) {
        const translated = translateLegacyTextToEnglish(value);
        if (translated !== value) current.nodeValue = translated;
      }
    } else if (current instanceof Element) {
      translateElement(current);
    }
    current = walker.nextNode();
  }
}

export function installLegacyEnglishDomTranslation(): () => void {
  if (locale !== 'en-US' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => undefined;
  }

  translateSubtree(document.documentElement);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        translateSubtree(mutation.target);
        continue;
      }
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        translateElement(mutation.target);
        continue;
      }
      for (const node of mutation.addedNodes) translateSubtree(node);
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TRANSLATABLE_ATTRIBUTES],
  });

  return () => observer.disconnect();
}
