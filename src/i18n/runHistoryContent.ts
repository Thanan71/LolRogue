import { type Locale, locale } from './fr';

type RunHistoryCatalog = Readonly<{
  filters: string;
  all: string;
  outcome: string;
  difficulty: string;
  mode: string;
  engine: string;
  gameplayRuleset: string;
  progressionRuleset: string;
  reset: string;
  legacy: string;
  nonComparable: string;
  comparable: string;
  versions: (engine: string, gameplay: string, progression: string) => string;
  next: string;
  loadingMore: string;
  loadDetails: string;
  detailsError: string;
  rejected: string;
  showRejected: string;
  noRejected: string;
  rejectedError: string;
  rejectionDetail: string;
  rejectionCode: string;
  attemptId: string;
}>;

export const runHistoryContent = {
  'fr-FR': {
    filters: 'Filtrer l’historique',
    all: 'Tous',
    outcome: 'Résultat',
    difficulty: 'Difficulté',
    mode: 'Mode',
    engine: 'Moteur',
    gameplayRuleset: 'Version des règles de jeu',
    progressionRuleset: 'Version des règles de progression',
    reset: 'Réinitialiser les filtres',
    legacy: 'Legacy · non comparable',
    nonComparable: 'Anciennes versions · non comparable',
    comparable: 'Versions actuelles',
    versions: (engine, gameplay, progression) =>
      `${engine} · jeu v${gameplay} · progression v${progression}`,
    next: 'Charger les parties suivantes',
    loadingMore: 'Chargement des parties suivantes…',
    loadDetails: 'Charger les détails',
    detailsError: 'Les détails n’ont pas pu être chargés. Réessayez.',
    rejected: 'Tentatives rejetées',
    showRejected: 'Afficher les tentatives rejetées',
    noRejected: 'Aucune tentative rejetée',
    rejectedError: 'Les tentatives rejetées n’ont pas pu être chargées.',
    rejectionDetail: 'Diagnostic technique',
    rejectionCode: 'Code de rejet',
    attemptId: 'Identifiant de tentative',
  },
  'en-US': {
    filters: 'Filter run history',
    all: 'All',
    outcome: 'Outcome',
    difficulty: 'Difficulty',
    mode: 'Mode',
    engine: 'Engine',
    gameplayRuleset: 'Gameplay ruleset version',
    progressionRuleset: 'Progression ruleset version',
    reset: 'Reset filters',
    legacy: 'Legacy · not comparable',
    nonComparable: 'Older versions · not comparable',
    comparable: 'Current versions',
    versions: (engine, gameplay, progression) =>
      `${engine} · gameplay v${gameplay} · progression v${progression}`,
    next: 'Load more runs',
    loadingMore: 'Loading more runs…',
    loadDetails: 'Load details',
    detailsError: 'Run details could not be loaded. Try again.',
    rejected: 'Rejected attempts',
    showRejected: 'Show rejected attempts',
    noRejected: 'No rejected attempts',
    rejectedError: 'Rejected attempts could not be loaded.',
    rejectionDetail: 'Technical diagnostic',
    rejectionCode: 'Rejection code',
    attemptId: 'Attempt identifier',
  },
} as const satisfies Record<Locale, RunHistoryCatalog>;

export const runHistoryCopy = runHistoryContent[locale];
