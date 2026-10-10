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
