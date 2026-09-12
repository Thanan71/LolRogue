import type { Locale } from './fr';

type TutorialContent = Readonly<{
  help: string;
  close: string;
  progress: (current: number, total: number) => string;
  previous: string;
  next: string;
  done: string;
}>;

export const tutorialContent = {
  'fr-FR': {
    help: 'Aide',
    close: 'Fermer le tutoriel',
    progress: (current: number, total: number) =>
      `Étape ${current.toLocaleString('fr-FR')} sur ${total.toLocaleString('fr-FR')}`,
    previous: 'Précédent',
    next: 'Suivant',
    done: 'J’ai compris',
  },
  'en-US': {
    help: 'Help',
    close: 'Close tutorial',
    progress: (current: number, total: number) =>
      `Step ${current.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`,
    previous: 'Previous',
    next: 'Next',
    done: 'Got it',
  },
} as const satisfies Record<Locale, TutorialContent>;
