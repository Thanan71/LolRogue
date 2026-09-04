import { locale } from './fr';

const COPY: Readonly<Record<string, string>> = {
  // Combat stage and spell UI.
  bouclier: 'shield',
  'Arène tactique': 'Tactical arena',
  'Préparez votre prochaine action': 'Prepare your next action',
  'Observez le tour adverse': 'Watch the enemy turn',
  'Effets estimés': 'Estimated effects',
  'Les dégâts sont estimés avant l’armure et la résistance de la cible.':
    'Damage is estimated before the target’s armor and resistance.',
  '✅ Prêt à lancer': '✅ Ready to cast',
  'pour lancer': 'to cast',
  'Compétences de': 'Abilities of',
  Disponible: 'Available',
  Verrouillé: 'Locked',
  Améliorable: 'Upgradeable',
  'Point de compétence disponible': 'Skill point available',
  'Dégâts estimés avec les statistiques actuelles, avant les défenses de la cible.':
    'Estimated damage with current stats, before the target’s defenses.',
  'Cible prête': 'Target ready',
  'Combat terminé': 'Combat complete',
  'Consultez le journal ou poursuivez depuis le résultat du combat.':
    'Review the combat log or continue from the combat result.',
  'Résolution serveur': 'Server resolution',
  'Votre prochaine action est en cours de résolution automatique.':
    'Your next action is being resolved automatically.',
  'L’action ennemie est en cours de résolution.': 'The enemy action is being resolved.',
  'Vos actions sont choisies automatiquement pour ce tour.':
    'Your actions are selected automatically for this turn.',
  'À vous de jouer': 'Your turn',
  'Choisissez une action, puis une cible lorsqu’elle est demandée.':
    'Choose an action, then a target when requested.',
  Préparation: 'Preparing',
  'Les commandes seront disponibles au début de votre tour.':
    'Controls will become available at the start of your turn.',
  'Les commandes sont verrouillées pendant l’action ennemie.':
    'Controls are locked during the enemy action.',
  'Sélectionnez un portrait valide': 'Select a valid portrait',
  'Mode manuel — choisissez une action ou appuyez sur Espace.':
    'Manual mode — choose an action or press Space.',
  "En attente du tour de l'ennemi…": 'Waiting for the enemy turn…',
  'Ton premier combat': 'Your first combat',
  'Règles du combat': 'Combat rules',
  'Ordre des tours': 'Turn order',
  'La vitesse fixe qui agit en premier. L’indicateur annonce le combattant actif et les ennemis jouent automatiquement.':
    'Speed determines who acts first. The indicator announces the active combatant and enemies act automatically.',
  'Choisis Attaque, Q, W, E ou R, puis une cible autorisée. Le bouton Exécuter le tour confirme la commande.':
    'Choose Attack, Q, W, E, or R, then an allowed target. The Execute turn button confirms the command.',
  'Coût et recharge': 'Cost and cooldown',
  'Chaque sort affiche son coût en PM et sa recharge. Un sort indisponible est désactivé et son état est annoncé.':
    'Each ability shows its MP cost and cooldown. An unavailable ability is disabled and its state is announced.',
  'Buffs, affaiblissements, contrôles et dégâts persistants sont visibles sur les portraits et consignés dans le journal.':
    'Buffs, debuffs, crowd control, and persistent damage are visible on portraits and recorded in the log.',
  'Auto est désactivé par défaut. Si tu l’actives, le jeu choisit tes actions ; le même bouton permet de reprendre la main.':
    'Auto is disabled by default. When enabled, the game chooses your actions; use the same button to take control again.',
  'Résultat du combat': 'Combat result',
  'Q / W / E / R : choisir un sort disponible.': 'Q / W / E / R: choose an available ability.',
  'Espace : exécuter le tour manuel.': 'Space: execute the manual turn.',
  'Échap : retourner à la carte lorsque le combat est terminé.':
    'Escape: return to the map when combat is complete.',
  'Tab puis Entrée ou Espace : activer le contrôle ayant le focus.':
    'Tab then Enter or Space: activate the focused control.',

  // Inventory/map support copy.
  'Choisir un champion pour transférer': 'Choose a champion to transfer to',
  'Choisir un champion à équiper': 'Choose a champion to equip',
  'Carte des prochains nœuds': 'Map of upcoming nodes',
  'Pénétration magique': 'Magic penetration',
  'Hâte de compétence': 'Ability haste',
  'V. DÉP': 'MOVE',
  '⚡ Nœuds de Base': '⚡ Core Nodes',

  // Admin dashboard.
  '✗ Défaite': '✗ Defeat',
  'Opération:': 'Operation:',
  'Chargement des logs...': 'Loading logs...',
  'Journal technique filtré': 'Filtered technical log',
  Méthode: 'Method',
  Opération: 'Operation',
  Durée: 'Duration',
  'Aucun log trouvé': 'No logs found',
  'Liste des Joueurs': 'Player list',
  Rafraîchir: 'Refresh',
  'Aucun joueur trouvé': 'No players found',
  '🔄 Rafraîchir': '🔄 Refresh',
  'Résultat:': 'Result:',
  'Défaites uniquement': 'Defeats only',
  'Vagues complétées': 'Waves completed',
  'Chargement des parties…': 'Loading runs…',
  'Historique filtré des runs': 'Filtered run history',
  Résultat: 'Result',
  Démarrées: 'Started',
  'À vérifier': 'Pending verification',
  Vérifiées: 'Verified',
  Rejetées: 'Rejected',
  Expirées: 'Expired',
  'Chargement de la surveillance…': 'Loading monitoring…',
  'Alerte de vérification authority': 'Authority verification alert',
  'Aucun seuil de rejet anormal détecté sur la fenêtre courante.':
    'No abnormal rejection threshold detected in the current window.',
  'Derniers rejets de vérification authority': 'Latest authority verification rejections',
  'Aucun rejet enregistré': 'No rejection recorded',
  Réessayer: 'Retry',
  'Invalider définitivement ce score Daily ?': 'Permanently invalidate this Daily score?',
  'Invalider le score': 'Invalidate score',
  'Chaque invalidation est attribuée et inscrite dans le journal d’audit.':
    'Each invalidation is attributed and recorded in the audit log.',
  'Chargement des signalements…': 'Loading reports…',
  '⚖️ Modération': '⚖️ Moderation',

  // Authentication / landing page.
  "Le nom d'utilisateur est requis.": 'Username is required.',
  'Accès à LoL Rogue': 'Access LoL Rogue',
  'Reprends ton ascension': 'Resume your ascent',
  'Crée ton profil de joueur': 'Create your player profile',
  'Connecte-toi pour retrouver ta progression.': 'Log in to restore your progression.',
  'Enregistre tes runs et ta progression.': 'Save your runs and progression.',
  'La Faille se réinvente': 'The Rift reinvented',
  'Une nouvelle ascension à chaque partie': 'A new ascent every run',
  'Compose ton escouade. Adapte ton build. Survis à chaque détour.':
    'Build your squad. Adapt your build. Survive every turn.',
  'Retrouve la tension d’un roguelike tactique dans des runs rapides où chaque champion, rune et décision peut renverser le combat.':
    'Experience the tension of a tactical roguelike in fast runs where every champion, rune, and decision can turn the fight.',
  'Décisions tactiques': 'Tactical decisions',
  'Chaque route transforme ton équipe.': 'Every route transforms your team.',
  'Retrouve tes runs et ta maîtrise.': 'Return to your runs and mastery.',
  'Défis quotidiens': 'Daily challenges',
  'Une même graine, un nouveau classement.': 'The same seed, a new leaderboard.',
  'Découvre le jeu immédiatement, sans sauvegarde en ligne.':
    'Discover the game immediately, without online saves.',
  'conditions d’utilisation et la politique de confidentialité': 'terms of use and privacy policy',

  // Credits.
  Création: 'Creation',
  'Équipe LolRogue': 'LolRogue Team',
  'Conception du jeu, direction artistique, développement et équilibrage.':
    'Game design, art direction, development, and balancing.',
  'Modèle de données et logique typée.': 'Data model and typed logic.',
  'Développement et production du client.': 'Client development and production.',
  'État local et orchestration des écrans.': 'Local state and screen orchestration.',
  'Authentification, données et autorité serveur.': 'Authentication, data, and server authority.',
  'Hébergement de l’application.': 'Application hosting.',
  'Univers et personnages créés par Riot Games.': 'Universe and characters created by Riot Games.',
  'Communauté Pokémon Rogue': 'Pokémon Rogue community',
  'Inspiration pour l’approche roguelike et la rejouabilité.':
    'Inspiration for the roguelike approach and replayability.',
  'Portraits de champions, icônes de compétences et données de référence.':
    'Champion portraits, ability icons, and reference data.',
  'Les personnes, technologies et univers qui ont rendu cette aventure possible.':
    'The people, technologies, and universes that made this adventure possible.',
  'Informations sur le projet': 'Project information',
  Modèle: 'Model',
  'Relation avec Riot Games': 'Relationship with Riot Games',
  'Sans affiliation ni approbation': 'No affiliation or endorsement',
  'Parcourir les crédits': 'Browse credits',
  'À propos des marques': 'About trademarks',
  'Un projet de fans indépendant': 'An independent fan project',
  'Consulter les informations légales et de confidentialité': 'View legal and privacy information',

  // Champion database.
  'Aucun champion trouvé': 'No champions found',
  'Essaie un autre nom, titre ou rôle.': 'Try another name, title, or role.',
  'Effacer la recherche': 'Clear search',
  'Retour à la liste': 'Back to list',

  // Events and run results.
  défense: 'defense',
  'objet mystérieux': 'mysterious item',
  caractéristique: 'stat',
  'Inventaire plein — l’objet a été laissé sur place.':
    'Inventory full — the item was left behind.',
  'Équipe complète — ce champion ne peut pas vous rejoindre.':
    'Team full — this champion cannot join you.',
  'Rencontre terminée': 'Encounter complete',
  'Événement déjà résolu': 'Event already resolved',
  'Cette rencontre a déjà livré son résultat. Reprenez votre route.':
    'This encounter has already produced its outcome. Continue your journey.',
  'Run terminé': 'Run complete',
  'Progression refusée': 'Progression rejected',
  'Diagnostic copié': 'Diagnostic copied',
  'Copier le diagnostic': 'Copy diagnostic',
  'Ajoutées à ta progression vérifiée.': 'Added to your verified progression.',
  'Calculées pour cette partie locale.': 'Calculated for this local run.',
  Éliminations: 'Eliminations',
  Soins: 'Healing',
  'Détails techniques pour le support': 'Technical details for support',
  'Répartition par champion': 'Breakdown by champion',
  'Bilan du run': 'Run summary',
  'Les chiffres à retenir': 'Key numbers',
  'Prochaine étape': 'Next step',
  'Prêt à repartir ?': 'Ready to go again?',
  'Détails de la partie': 'Run details',
  'Économie, soutien et progression': 'Economy, support, and progression',
  'MVP du run': 'Run MVP',
  'Légal et confidentialité': 'Legal and privacy',
  'Ta progression synchronisée et les résultats de tes dernières expéditions.':
    'Your synced progression and the results of your latest expeditions.',

  // Recruitment fragments.
  '— le champion peut fuir': '— the champion may flee',
  'rejoint ton équipe !': 'joins your team!',
  'a pris la fuite.': 'ran away.',
};

const PATTERNS: readonly [RegExp, string][] = [
  [/^\+(.+) bouclier$/u, '+$1 shield'],
  [/^Ranimé · (.+) PV$/u, 'Revived · $1 HP'],
  [/^(.+) → soi-même$/u, '$1 → self'],
  [/^(.+) de (.+) amélioré au rang (.+)\.$/u, '$1 of $2 upgraded to rank $3.'],
  [
    /^Impossible d’améliorer (.+) de (.+)\. Réessayez\.$/u,
    'Unable to upgrade $1 of $2. Try again.',
  ],
  [/^Améliorer (.+) · rang (.+) → (.+)$/u, 'Upgrade $1 · rank $2 → $3'],
  [/^Compétences de (.+)$/u, '$1 abilities'],
  [/^Vente confirmée : (.+), \+(.+) (?:or|gold)\.$/u, 'Sale confirmed: $1, +$2 gold.'],
  [/^(\d+) chemin(?:s)? disponible(?:s)?$/u, '$1 available path(s)'],
  [/^Progression des biomes : (.+) sur (.+)$/u, 'Biome progress: $1 of $2'],
  [/^, (.+) niveau\(x\) gagné\(s\)$/u, ', $1 level(s) gained'],
  [/^Expérience de (.+)$/u, '$1 experience'],
  [
    /^(.+) est sélectionné\. Choisissez maintenant une action\.$/u,
    '$1 is selected. Now choose an action.',
  ],
  [/^(.+) dans (.+) s$/u, '$1 in $2 s'],
  [/^(.+) % des dégâts de l'équipe$/u, "$1% of the team's damage"],
  [/^Objet obtenu : (.+)$/u, 'Item obtained: $1'],
  [/^Amélioration : \+(.+) (.+)$/u, 'Upgrade: +$1 $2'],
  [/^(.+) (?:or|gold) dépensé\(s\)\.$/u, '$1 gold spent.'],
  [/^Cette run exige exactement (.+) starter(.+)\.$/u, 'This run requires exactly $1 starter$2.'],
  [
    /^Run normale : ta difficulté et tes choix · sélectionne exactement (.+) champions(.*)$/u,
    'Normal run: your difficulty and choices · select exactly $1 champions$2',
  ],
  [/^(.+) slot\(s\) sélectionné$/u, '$1 slot(s) selected'],
];

export function translateAuditedEnglishCopy(value: string): string {
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) return value;
  let translated = COPY[normalized] ?? normalized;
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
    const translated = translateAuditedEnglishCopy(current);
    if (translated !== current) element.setAttribute(attribute, translated);
  }
}

function translateNode(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    const value = root.nodeValue;
    if (value) {
      const translated = translateAuditedEnglishCopy(value);
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
        const translated = translateAuditedEnglishCopy(value);
        if (translated !== value) current.nodeValue = translated;
      }
    } else if (current instanceof Element) translateElement(current);
    current = walker.nextNode();
  }
}

export function installAuditedEnglishCopyTranslation(): () => void {
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
      else if (mutation.type === 'attributes' && mutation.target instanceof Element)
        translateElement(mutation.target);
      else for (const node of mutation.addedNodes) translateNode(node);
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
