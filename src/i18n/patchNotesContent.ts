import { type Locale, locale } from './fr';

const catalogs = {
  'fr-FR': {
    title: 'Notes de mise à jour',
    history: 'Historique des publications',
    back: 'Retour au menu',
    all: 'Toutes les catégories',
    filter: 'Filtrer par catégorie',
    categories: { new: 'Nouveau', balance: 'Équilibrage', fixes: 'Correctifs' },
    summary: 'Du nouveau depuis ta dernière visite',
    unread: (count: number) => `${count} publication${count > 1 ? 's' : ''} à découvrir`,
    view: 'Voir les nouveautés',
    markRead: 'Marquer comme lu',
    understood: 'J’ai compris',
    read: 'Les nouveautés sont marquées comme lues.',
    later: 'Plus tard',
    empty: 'Aucune publication dans cette catégorie.',
    localFallback:
      'Lecture enregistrée sur cet appareil. La synchronisation réessaiera automatiquement.',
  },
  'en-US': {
    title: 'Patch notes',
    history: 'Publication history',
    back: 'Back to menu',
    all: 'All categories',
    filter: 'Filter by category',
    categories: { new: 'New', balance: 'Balance', fixes: 'Fixes' },
    summary: 'New since your last visit',
    unread: (count: number) => `${count} publication${count > 1 ? 's' : ''} to discover`,
    view: 'See what’s new',
    markRead: 'Mark as read',
    understood: 'Got it',
    read: 'Updates marked as read.',
    later: 'Later',
    empty: 'No publications in this category.',
    localFallback: 'Reading saved on this device. Sync will retry automatically.',
  },
} as const;

export function getPatchNotesContent(contentLocale: Locale = locale) {
  return catalogs[contentLocale];
}
