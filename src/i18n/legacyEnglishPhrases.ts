import { locale } from './fr';

const PHRASES: Readonly<Record<string, string>> = {
  // Stats and common UI labels emitted outside the central catalog.
  'Points de vie': 'Health',
  'Points de mana': 'Mana',
  'Vitesse de déplacement': 'Move speed',
  Armure: 'Armor',
  'Résistance magique': 'Magic resistance',
  "Dégâts d'attaque": 'Attack damage',
  "Vitesse d'attaque": 'Attack speed',
  "Portée d'attaque": 'Attack range',
  "Initiative d'attaque": 'Attack initiative',
  'Initiative ATQ': 'Attack initiative',
  'I. ATQ': 'ATK INIT',
  'Profil de portée': 'Range profile',
  Puissance: 'Ability power',
  'Régénération PV': 'HP regeneration',
  'Régénération PM': 'MP regeneration',
  'Chance de critique': 'Critical strike chance',
  Attaque: 'Attack',
  Critique: 'Critical',
  'PV actuels / maximum': 'Current / maximum HP',
  'PV actuels / maximum ': 'Current / maximum HP ',
  'objets ·': 'items ·',
  '· Inventaire plein': '· Inventory full',
  Actuel: 'Current',
  devient: 'becomes',
  'Cet objet n’ajoute pas de caractéristique directe.': 'This item does not add a direct stat.',
  Déséquiper: 'Unequip',
  'Sélectionne un objet pour le gérer.': 'Select an item to manage it.',

  // Run map and tutorial.
  'Choisis ton prochain nœud accessible': 'Choose your next accessible node',
  Vague: 'Wave',
  'Active uniquement un nœud annoncé accessible. Ce choix ferme les autres branches de la même étape.':
    'Activate only a node announced as accessible. This choice closes the other branches at the same step.',
  'Combat, boutique, repos, événement, recrutement et trésor doivent être terminés avant de poursuivre.':
    'Combat, shop, rest, event, recruitment, and treasure encounters must be completed before continuing.',
  'Lis les valeurs des objets, sorts et augments avant de confirmer. Les récompenses apparaissent au retour sur la carte.':
    'Read item, spell, and augment values before confirming. Rewards appear when you return to the map.',
  'La sortie ouvre le biome suivant. Le boss final de la Base termine la run ; la progression connectée est ensuite vérifiée par le serveur.':
    'The exit opens the next biome. The final Base boss ends the run; connected progression is then verified by the server.',
  "Choix d'augment": 'Augment choice',
  'Récompenses du combat': 'Combat rewards',
  'XP/champion (KO inclus)': 'XP/champion (including KOs)',
  'Itinéraire du biome': 'Biome route',
  'Parcourez les choix avec Tab, puis utilisez Entrée ou Espace pour sélectionner un nœud accessible.':
    'Move through choices with Tab, then use Enter or Space to select an accessible node.',
  'Les chemins dorés sont parcourus, les chemins turquoise sont accessibles et les branches assombries sont fermées.':
    'Golden paths have been traveled, turquoise paths are accessible, and darkened branches are closed.',
  'Faites glisser la carte': 'Drag the map',
  'départ du biome': 'biome start',
  'activer pour choisir ce nœud et verrouiller les autres branches':
    'activate to choose this node and lock the other branches',
  "terminez d'abord le choix en attente": 'finish the pending choice first',

  // Starter selection.
  'Impossible de démarrer une partie vérifiée.': 'Unable to start a verified run.',
  'Une tentative vérifiée interrompue est prête à reprendre avec ses choix d’origine.':
    'An interrupted verified attempt is ready to resume with its original choices.',
  'Tous les joueurs affrontent la même seed quotidienne · 1 starter':
    'All players face the same daily seed · 1 starter',
  'Étapes de préparation': 'Preparation steps',
  'sauvegarde sur cet appareil uniquement': 'saved on this device only',
  'slot(s) sélectionné': 'slot(s) selected',

  // Shop.
  'Équipez votre escouade avant de reprendre la route. Les achats sont définitifs.':
    'Equip your squad before heading back out. Purchases are final.',
  'État de la boutique': 'Shop status',
  'objets disponibles': 'items available',
  'Inventaire ': 'Inventory ',
  'Équipe ': 'Team ',
  'Bonus de l’objet': 'Item bonuses',
  "Bonus de l'objet": 'Item bonuses',

  // Recruit.
  'Votre équipe': 'Your team',
  'Évaluez le renfort, sa place dans l’équipe et le risque avant de tenter le recrutement.':
    'Evaluate the recruit, their place on the team, and the risk before attempting recruitment.',
  'Champion inconnu': 'Unknown champion',
  Champion: 'Champion',
  'Statistiques du champion': 'Champion stats',
  'Coût :': 'Cost:',
  'Chances de réussite :': 'Success chance:',
  'L’or n’est dépensé que si le recrutement réussit.':
    'Gold is spent only if recruitment succeeds.',
  'Tu conserves ton or malgré cette tentative.': 'You keep your gold despite this attempt.',
  Passer: 'Skip',

  // Rest.
  'Ce repos a déjà été utilisé. Votre équipe peut repartir.':
    'This rest stop has already been used. Your team can move on.',
  'Le repos ne peut pas être appliqué pour le moment.': 'The rest cannot be applied right now.',
  'Le paiement du repos a échoué.': 'The rest payment failed.',
  'Le soin n’a pas pu être enregistré. Aucun changement n’a été conservé.':
    'The healing could not be saved. No changes were kept.',
  'Toute l’équipe a récupéré la totalité de ses PV.': 'The whole team recovered all of its HP.',
  'Comparez les PV actuels et projetés avant d’utiliser cette halte.':
    'Compare current and projected HP before using this rest stop.',
  'Points de vie de l’équipe': 'Team health',

  // Events.
  'Les événements modifient immédiatement votre expédition. Leur résultat est enregistré une seule fois.':
    'Events immediately affect your expedition. Their outcome is recorded only once.',
  'Issue inconnue': 'Unknown outcome',
  'Le choix vous appartient': 'The choice is yours',
  'Résultat de la rencontre': 'Encounter result',
  'Objet laissé sur place': 'Item left behind',
  'Recrutement impossible': 'Recruitment unavailable',
  'Aucun champion ne s’est présenté…': 'No champion appeared…',
  'Rien ne se produit…': 'Nothing happens…',
  caractéristique: 'stat',

  // Treasure.
  'Total :': 'Total:',

  // Enhancement UI.
  "Arbre d'Amélioration -": 'Enhancement Tree -',
  'Nœuds de Base': 'Core Nodes',
  'Maximum atteint': 'Maximum reached',
  'Enregistrement…': 'Saving…',
  Débloquer: 'Unlock',
};

const PATTERNS: readonly [RegExp, string][] = [
  [/^Impossible d’équiper (.+) sur (.+) : (.+)\.$/u, 'Unable to equip $1 on $2: $3.'],
  [/^(\d+) sur (\d+)$/u, '$1 of $2'],
  [/^(\d+)\/(\d+) objets · (.+)$/u, '$1/$2 items · $3'],
  [/^Aperçu sur (.+)$/u, 'Preview on $1'],
  [/^Transférer vers (.+)$/u, 'Transfer to $1'],
  [/^Équiper sur (.+)$/u, 'Equip on $1'],
  [/^Vendre pour (\d+) (?:or|gold)$/u, 'Sell for $1 gold'],
  [/^(.+) disponible pour cet objet\.$/u, '$1 available for this item.'],
  [/^(\d+) (?:or|gold)$/u, '$1 gold'],
  [/^Vente · (\d+) (?:or|gold)$/u, 'Sell · $1 gold'],
  [/^Vente : (\d+) (?:or|gold)$/u, 'Sell: $1 gold'],
  [/^Expédition · Biome (\d+) sur (\d+)$/u, 'Expedition · Biome $1 of $2'],
  [/^(.+) · Choisis ton prochain nœud accessible$/u, '$1 · Choose your next accessible node'],
  [/^Progression des biomes : (\d+) sur (\d+)$/u, 'Biome progress: $1 of $2'],
  [/^(\d+) chemin disponible$/u, '$1 available path'],
  [/^(\d+) chemins disponibles$/u, '$1 available paths'],
  [/^(.+), colonne (\d+), ligne (\d+)(.*)$/u, '$1, column $2, row $3$4'],
  [/^, départ du biome/u, ', biome start'],
  [
    /^, activer pour choisir ce nœud et verrouiller les autres branches/u,
    ', activate to choose this node and lock the other branches',
  ],
  [/^, terminez d'abord le choix en attente/u, ', finish the pending choice first'],
  [/^, (\d+) niveau\(x\) gagné\(s\)$/u, ', $1 level(s) gained'],
  [/^, objet : (.+)$/u, ', item: $1'],
  [/^Cette run exige exactement (\d+) starters?\.$/u, 'This run requires exactly $1 starter(s).'],
  [
    /^Run normale : ta difficulté et tes choix · sélectionne exactement (\d+) champions(.*)$/u,
    'Normal run: your difficulty and choices · select exactly $1 champions$2',
  ],
  [/^Relancer le roster \((\d+)\)$/u, 'Reroll roster ($1)'],
  [/^Choisir (.+)$/u, 'Choose $1'],
  [/^(.+) · (\d+)\/(\d+) slot\(s\) sélectionné$/u, '$1 · $2/$3 slot(s) selected'],
  [/^(.+) a été ajouté à l’inventaire\.$/u, '$1 was added to the inventory.'],
  [/^(.+) a rejoint votre équipe\.$/u, '$1 joined your team.'],
  [/^Soin de (\d+) % des PV$/u, 'Heal $1% of HP'],
  [
    /^Toute l’équipe a récupéré (\d+) % de ses PV maximum\.$/u,
    'The whole team recovered $1% of its maximum HP.',
  ],
  [/^Niv\. (\d+)$/u, 'Lv. $1'],
  [/^(.+) : (\d+) \/ (\d+) PV$/u, '$1: $2 / $3 HP'],
  [/^Coût : (\d+) (?:or|gold)$/u, 'Cost: $1 gold'],
  [/^Chances de réussite : (\d+) %(.*)$/u, 'Success chance: $1%$2'],
  [/^(.+) rejoint ton équipe !$/u, '$1 joins your team!'],
  [/^(.+) a pris la fuite\.$/u, '$1 ran away.'],
  [/^(\d+) (?:or|gold) dépensé\(s\)\.$/u, '$1 gold spent.'],
  [/^Offrande : −(\d+) (?:or|gold)$/u, 'Offering: −$1 gold'],
  [/^Objet obtenu : (.+)$/u, 'Item obtained: $1'],
  [/^Équipe soignée : \+(\d+) % de PV$/u, 'Team healed: +$1% HP'],
  [/^Piège déclenché : −(\d+) % de PV$/u, 'Trap triggered: −$1% HP'],
  [/^(.+) rejoint votre équipe !$/u, '$1 joins your team!'],
  [/^Amélioration : \+(\d+) (.+)$/u, 'Upgrade: +$1 $2'],
  [/^Inventaire plein — (.+)$/u, 'Inventory full — $1'],
  [/^Équipe complète — (.+)$/u, 'Team full — $1'],
  [/^Étape (\d+) sur (\d+)$/u, 'Step $1 of $2'],
  [/^Maîtrise: Niveau (\d+)$/u, 'Mastery: Level $1'],
  [/^Niv (\d+)\/(\d+)$/u, 'Lv. $1/$2'],
];

export function translateLegacyPhraseToEnglish(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  let translated = PHRASES[trimmed] ?? trimmed;
  for (const [pattern, replacement] of PATTERNS)
    translated = translated.replace(pattern, replacement);
  const leading = value.match(/^\s*/u)?.[0] ?? '';
  const trailing = value.match(/\s*$/u)?.[0] ?? '';
  return `${leading}${translated}${trailing}`;
}

const ATTRIBUTES = ['aria-label', 'aria-description', 'title', 'placeholder'] as const;

function translateElement(element: Element): void {
  for (const attribute of ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const translated = translateLegacyPhraseToEnglish(current);
    if (translated !== current) element.setAttribute(attribute, translated);
  }
}

function translateNode(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    const value = root.nodeValue;
    if (value) {
      const translated = translateLegacyPhraseToEnglish(value);
      if (translated !== value) root.nodeValue = translated;
    }
    return;
  }
  if (root instanceof Element) translateElement(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      const value = current.nodeValue;
      if (value) {
        const translated = translateLegacyPhraseToEnglish(value);
        if (translated !== value) current.nodeValue = translated;
      }
    } else if (current instanceof Element) translateElement(current);
    current = walker.nextNode();
  }
}

export function installLegacyEnglishPhraseTranslation(): () => void {
  if (
    locale !== 'en-US' ||
    typeof document === 'undefined' ||
    typeof MutationObserver === 'undefined'
  ) {
    return () => undefined;
  }
  translateNode(document.documentElement);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') translateNode(mutation.target);
      else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        translateElement(mutation.target);
      } else for (const node of mutation.addedNodes) translateNode(node);
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTES],
  });
  return () => observer.disconnect();
}
