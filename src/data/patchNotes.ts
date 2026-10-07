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
