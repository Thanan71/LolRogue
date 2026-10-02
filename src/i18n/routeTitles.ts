import type { Locale } from './fr';

const ROUTE_TITLES = {
  'fr-FR': {
    '/': 'Menu principal',
    '/auth': 'Connexion',
    '/starter-select': 'Sélection de départ',
    '/run': 'Carte de la partie',
    '/combat': 'Combat',
    '/shop': 'Boutique',
    '/recruit': 'Recrutement',
    '/rest': 'Repos',
    '/event': 'Événement',
    '/treasure': 'Trésor',
    '/game-over': 'Résultat de la partie',
    '/daily-run': 'Défi quotidien',
    '/profile': 'Profil',
    '/database': 'Base des champions',
    '/settings': 'Réglages',
    '/credits': 'Crédits',
    '/rules': 'Guide et règles',
    '/legal': 'Informations légales et confidentialité',
    '/admin': 'Administration',
  },
  'en-US': {
    '/': 'Main menu',
    '/auth': 'Log in',
    '/starter-select': 'Starter selection',
    '/run': 'Run map',
    '/combat': 'Combat',
    '/shop': 'Shop',
    '/recruit': 'Recruitment',
    '/rest': 'Rest',
    '/event': 'Event',
    '/treasure': 'Treasure',
    '/game-over': 'Run result',
    '/daily-run': 'Daily challenge',
    '/profile': 'Profile',
    '/database': 'Champion database',
    '/settings': 'Settings',
    '/credits': 'Credits',
    '/rules': 'Guide and rules',
    '/legal': 'Legal and privacy information',
    '/admin': 'Administration',
  },
} as const satisfies Record<Locale, Readonly<Record<string, string>>>;

export const ROUTE_TITLE_PATHS = Object.freeze(Object.keys(ROUTE_TITLES['fr-FR']));

export function routeTitle(locale: Locale, pathname: string): string {
  const catalog: Readonly<Record<string, string>> = ROUTE_TITLES[locale];
  return catalog[pathname] ?? (locale === 'en-US' ? 'Page not found' : 'Page introuvable');
}
