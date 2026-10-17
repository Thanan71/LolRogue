import type { Locale } from '@/i18n/fr';

export const PATCH_NOTE_CATEGORIES = ['new', 'balance', 'fixes'] as const;
export type PatchNoteCategory = (typeof PATCH_NOTE_CATEGORIES)[number];
export interface PatchNote {
  /** Publication order, independent from deployment SHA, engine and npm version. Never reuse. */
  readonly sequence: number;
  readonly version: string;
  readonly publishedOn: string;
  readonly title: Readonly<Record<Locale, string>>;
  readonly entries: readonly {
    readonly category: PatchNoteCategory;
    readonly text: Readonly<Record<Locale, string>>;
  }[];
}

/** Append publications; preserve published IDs. A redeployment does not create a publication. */
export const PATCH_NOTES: readonly PatchNote[] = [
  {
    sequence: 1,
    version: '2026.10.07',
    publishedOn: '2026-10-07',
    title: { 'fr-FR': 'Les nouveautés à portée de main', 'en-US': 'Your updates at a glance' },
    entries: [
      {
        category: 'new',
        text: {
          'fr-FR':
            'Retrouve les nouveautés du jeu dans les notes de mise à jour, accessibles depuis le menu.',
          'en-US': 'Find game updates in the patch notes, available from the main menu.',
        },
      },
      {
        category: 'balance',
        text: {
          'fr-FR':
            'Le mode Normal démarre avec 2 champions ; le mode Classé conserve une équipe de 6 champions.',
          'en-US': 'Normal mode starts with 2 champions; Ranked mode keeps a team of 6 champions.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les notes déjà marquées comme lues restent consultables sans interrompre ta prochaine partie.',
          'en-US':
            'Notes you have marked as read stay available without interrupting your next run.',
        },
      },
    ],
  },
  {
    sequence: 2,
    version: '2026.10.09',
    publishedOn: '2026-10-09',
    title: {
      'fr-FR': 'Une interface plus claire, du menu au combat',
      'en-US': 'A clearer interface, from menu to combat',
    },
    entries: [
      {
        category: 'new',
        text: {
          'fr-FR':
            'Trouve tes champions avec la recherche, les filtres de rôle et les pages du catalogue. Ton équipe et les actions de départ restent accessibles pendant la préparation.',
          'en-US':
            'Find champions with search, role filters, and catalog pages. Your team and start actions stay within reach while preparing your run.',
        },
      },
      {
        category: 'new',
        text: {
          'fr-FR':
            'Les runes sont facultatives : tu peux démarrer sans rune ou consulter leurs effets avant de faire ton choix.',
          'en-US':
            'Runes are optional: start without a rune or inspect their effects before choosing.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'En combat manuel, choisis ton action et sa cible, puis confirme pour jouer le tour. Tu peux activer le mode automatique quand tu le souhaites.',
          'en-US':
            'In manual combat, choose an action and its target, then confirm to play the turn. Switch to automatic mode whenever you want.',
        },
      },
      {
        category: 'new',
        text: {
          'fr-FR':
            'Les portraits signalent les états des champions, comme l’étourdissement, avec leur durée restante pour mieux comprendre les tours de combat.',
          'en-US':
            'Portraits show champion statuses, such as stuns, with their remaining duration to make combat turns easier to follow.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'La navigation au clavier, le focus et les infobulles des compétences sont plus pratiques. Les textes, contrastes et panneaux restent plus lisibles sur les petits écrans.',
          'en-US':
            'Keyboard navigation, focus, and ability tooltips are easier to use. Text, contrast, and panels are clearer on small screens.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'La connexion depuis une partie invitée affiche les erreurs sans bloquer l’écran et demande confirmation avant l’abandon. Le parcours « Mot de passe oublié » permet de demander un lien et de choisir un nouveau mot de passe.',
          'en-US':
            'Signing in from a guest run shows errors without blocking the screen and asks for confirmation before abandoning the run. The Forgot password flow lets you request a link and choose a new password.',
        },
      },
      {
        category: 'new',
        text: {
          'fr-FR':
            'Avant de recruter, consulte le niveau d’arrivée et les statistiques prévues avec la maîtrise et les bonus actuels. En boutique, les rôles, compétences et passifs sont consultables avant l’achat.',
          'en-US':
            'Before recruiting, inspect the joining level and projected stats with mastery and current bonuses. In shops, review roles, abilities, and passives before buying.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Le menu met « Jouer » en premier pour lancer ta prochaine partie plus rapidement, tout en gardant les nouveautés disponibles.',
          'en-US':
            'The menu puts Play first so you can start your next run faster, while keeping game updates available.',
        },
      },
    ],
  },
  {
    sequence: 3,
    version: '2026.10.09.1',
    publishedOn: '2026-10-09',
    title: { 'fr-FR': 'Veigar fait grandir son pouvoir', 'en-US': 'Veigar grows his power' },
    entries: [
      {
        category: 'new',
        text: {
          'fr-FR':
            'Veigar rejoint les champions jouables : Coup malin, Matière noire différée, étourdissement ciblé et Explosion primordiale renforcée par les PV manquants.',
          'en-US':
            'Veigar joins the playable champions with Baleful Strike, delayed Dark Matter, a targeted stun and Primordial Burst amplified by missing HP.',
        },
      },
      {
        category: 'balance',
        text: {
          'fr-FR':
            'Veigar gagne +1 puissance par ennemi normal éliminé avec une compétence, +3 par élite et +10 par boss, jusqu’à +200. Ce bonus dure uniquement pendant le run.',
          'en-US':
            'Veigar gains +1 ability power per normal enemy killed with an ability, +3 per elite and +10 per boss, up to +200. This bonus lasts only for the current run.',
        },
      },
      {
        category: 'new',
        text: {
          'fr-FR':
            'Consulte les points de pouvoir et leur bonus en combat, dans les fiches de ton équipe et dans le journal. Ils sont conservés entre les combats et après un rechargement.',
          'en-US':
            'Check power points and their bonus in combat, your team details and the combat log. They persist between battles and after a reload.',
        },
      },
      {
        category: 'new',
        text: {
          'fr-FR':
            'Veigar peut être débloqué pour 400 éclats ou joué lorsqu’il est proposé dans la rotation hebdomadaire ou le défi quotidien.',
          'en-US':
            'Unlock Veigar for 400 shards, or play him when offered in the weekly rotation or Daily challenge.',
        },
      },
    ],
  },
  {
    sequence: 4,
    version: '2026.10.10',
    publishedOn: '2026-10-10',
    title: { 'fr-FR': 'Sauvegarde après rechargement', 'en-US': 'Saved runs after reloading' },
    entries: [
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Après un rechargement, une partie déjà sauvegardée retrouve automatiquement son résultat validé. Elle n’est plus affichée en échec et ses récompenses ne sont pas attribuées une deuxième fois.',
          'en-US':
            'After reloading, an already saved run automatically retrieves its verified result. It no longer appears as a failed save, and its rewards are not granted a second time.',
        },
      },
    ],
  },
  {
    sequence: 5,
    version: '0.2.0',
    publishedOn: '2026-10-11',
    title: {
      'fr-FR': 'Veigar profite aussi des assistances',
      'en-US': 'Veigar gains power from assists',
    },
    entries: [
      {
        category: 'balance',
        text: {
          'fr-FR':
            'Les assistances attribuées à Veigar lui donnent désormais des points de pouvoir : +1 sur un ennemi normal, +3 sur un élite et +10 sur un boss. Ses éliminations gardent leurs gains habituels ; chaque point donne +1 puissance, jusqu’à +200 pendant le run.',
          'en-US':
            'Credited assists now grant Veigar power points: +1 for a normal enemy, +3 for an elite and +10 for a boss. His kills keep their usual rewards; each point grants +1 ability power, up to +200 during the run.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les fiches et les tooltips expliquent les gains par élimination et par assistance. Les runs déjà commencés conservent leurs règles d’origine.',
          'en-US':
            'Champion details and tooltips explain kill and assist rewards. Runs already in progress keep their original rules.',
        },
      },
      {
        category: 'new',
        text: {
          'fr-FR':
            'Les versions du jeu et des nouvelles règles de run utilisent désormais le format major.minor.patch, à partir de 0.2.0. La date de publication reste indiquée séparément.',
          'en-US':
            'Game versions and new run rules now use the major.minor.patch format, starting with 0.2.0. The publication date remains separate.',
        },
      },
    ],
  },
  {
    sequence: 6,
    version: '0.2.1',
    publishedOn: '2026-10-11',
    title: { 'fr-FR': 'Maintenance des mises à jour', 'en-US': 'Release maintenance' },
    entries: [
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les outils de vérification et de publication ont été améliorés pour fiabiliser les prochaines mises à jour.',
          'en-US':
            'Verification and release tools have been improved to make upcoming updates more reliable.',
        },
      },
    ],
  },
  {
    sequence: 7,
    version: '0.2.2',
    publishedOn: '2026-10-11',
    title: { 'fr-FR': 'Maintenance simplifiée', 'en-US': 'Simplified maintenance' },
    entries: [
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les outils de maintenance et les vérifications avant publication sont regroupés pour faciliter et fiabiliser les prochaines mises à jour du jeu.',
          'en-US':
            'Maintenance tools and pre-release checks are grouped together to make upcoming game updates easier and more reliable.',
        },
      },
    ],
  },
  {
    sequence: 8,
    version: '0.2.3',
    publishedOn: '2026-10-11',
    title: { 'fr-FR': 'Mises à jour plus fiables', 'en-US': 'More reliable updates' },
    entries: [
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'La configuration des environnements et les contrôles de publication ont été renforcés pour fiabiliser les prochaines mises à jour. Les outils de build et de tests ont aussi été réorganisés, avec les mêmes règles de jeu et garanties de vérification.',
          'en-US':
            'Environment configuration and release checks have been strengthened to make upcoming updates more reliable. Build and test tools have also been reorganized while preserving the game rules and verification guarantees.',
        },
      },
    ],
  },
  {
    sequence: 9,
    version: '0.2.4',
    publishedOn: '2026-10-11',
    title: {
      'fr-FR': 'Runs et progression plus fiables',
      'en-US': 'More reliable runs and progression',
    },
    entries: [
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Le démarrage, la sauvegarde et la reprise des runs utilisent une orchestration commune, tout en conservant les sauvegardes existantes et les résultats validés par le serveur.',
          'en-US':
            'Run starts, saves and recovery now share a common orchestration while preserving existing saves and server-verified results.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les réponses réseau retardées sont ignorées après un changement de compte ou de run. Les rafraîchissements de progression concurrents ne remplacent plus les données les plus récentes.',
          'en-US':
            'Delayed network responses are ignored after switching accounts or runs. Concurrent progression refreshes no longer overwrite newer data.',
        },
      },
    ],
  },
  {
    sequence: 10,
    version: '0.2.5',
    publishedOn: '2026-10-13',
    title: {
      'fr-FR': 'Préparation et combats plus robustes',
      'en-US': 'More robust preparation and battles',
    },
    entries: [
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'La préparation des champions, le défi quotidien et les contrôles de combat ont été réorganisés pour faciliter les prochaines améliorations, tout en conservant les règles et les sauvegardes existantes.',
          'en-US':
            'Champion preparation, the daily challenge and battle controls have been reorganized to make future improvements easier while preserving existing rules and saves.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Tu peux réessayer de charger les champions du défi quotidien après une erreur réseau. Les réponses retardées après un changement de compte et les confirmations de départ répétées sont mieux prises en charge.',
          'en-US':
            'You can retry loading Daily champions after a network error. Delayed responses after switching accounts and repeated start confirmations are handled more reliably.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les transitions de combat évitent les actions automatiques en double et les redirections tardives vers une ancienne run. La vérification des résultats conserve la compatibilité des runs précédentes.',
          'en-US':
            'Battle transitions prevent duplicate automatic actions and delayed redirects to an old run. Result verification remains compatible with previous runs.',
        },
      },
    ],
  },
  {
    sequence: 11,
    version: '0.2.6',
    publishedOn: '2026-10-13',
    title: {
      'fr-FR': 'Maintenance de l’interface et des livraisons',
      'en-US': 'Interface and release maintenance',
    },
    entries: [
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les styles communs de l’interface sont regroupés en conservant le rendu sur ordinateur et mobile, le focus clavier et les préférences de réduction des animations. Le libellé de cible en combat gagne en contraste.',
          'en-US':
            'Shared interface styles are consolidated while preserving desktop and mobile rendering, keyboard focus and reduced-motion preferences. The battle target label has better contrast.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les contrôles de livraison vérifient les fichiers générés et les ressources du jeu sans modifier les anciennes versions. Un audit de sécurité incomplet bloque désormais la validation. Les règles et les sauvegardes restent compatibles.',
          'en-US':
            'Release checks verify generated files and game assets without modifying historical versions. An incomplete security audit now blocks validation. Rules and saves remain compatible.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les portraits, les icônes de sorts et le décor de combat se chargent aussi correctement dans le serveur de développement.',
          'en-US':
            'Portraits, spell icons and the battle backdrop now also load correctly in the development server.',
        },
      },
    ],
  },
  {
    sequence: 12,
    version: '0.2.7',
    publishedOn: '2026-10-17',
    title: {
      'fr-FR': 'Statistiques d’administration fiables',
      'en-US': 'Reliable administration statistics',
    },
    entries: [
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Les statistiques d’administration distinguent les totaux réels des lignes affichées. Les connexions quotidiennes sont définies en UTC et les données absentes sont indiquées comme indisponibles.',
          'en-US':
            'Administration statistics distinguish full totals from displayed rows. Daily logins are defined in UTC and missing data is marked as unavailable.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Le suivi des Candies distingue le solde, les gains, les dépenses et les remboursements enregistrés. Les historiques incomplets sont signalés sans inventer de gains à partir d’un solde.',
          'en-US':
            'Candy accounting distinguishes balances, earnings, spending and recorded refunds. Incomplete histories are identified without inferring earnings from balances.',
        },
      },
      {
        category: 'fixes',
        text: {
          'fr-FR':
            'Chaque section admin se charge et se relance indépendamment. Les réponses obsolètes sont ignorées et les données périmées sont signalées. Les contrôles d’accès restent appliqués par la base de données.',
          'en-US':
            'Each admin section loads and retries independently. Outdated responses are ignored and stale data is identified. Access controls remain enforced by the database.',
        },
      },
    ],
  },
];

export function latestPatchNote(notes: readonly PatchNote[] = PATCH_NOTES): PatchNote | undefined {
  return notes.reduce<PatchNote | undefined>(
    (latest, note) => (!latest || note.sequence > latest.sequence ? note : latest),
    undefined,
  );
}

export function unreadPatchNotes(
  lastSeenSequence: number,
  notes: readonly PatchNote[] = PATCH_NOTES,
): PatchNote[] {
  const seen =
    Number.isSafeInteger(lastSeenSequence) && lastSeenSequence >= 0 ? lastSeenSequence : 0;
  return notes.filter((note) => note.sequence > seen).sort((a, b) => b.sequence - a.sequence);
}
