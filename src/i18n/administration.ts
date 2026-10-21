import type { AdministrationGroup, AdministrationView } from '@/features/administration';
interface AdministrationCopy {
  navigation: string;
  subsections: string;
  contextPreserved: string;
  groups: Record<AdministrationGroup, string>;
  views: Record<AdministrationView, string>;
}
const fr: AdministrationCopy = {
  navigation: 'Sections de l’administration',
  subsections: 'Sous-sections',
  contextPreserved: 'Les filtres appliqués sont conservés dans le lien.',
  groups: {
    overview: 'Vue globale',
    players: 'Joueurs',
    runs: 'Runs',
    balance: 'Équilibrage',
    moderation: 'Modération',
    monitoring: 'Surveillance',
  },
  views: {
    dashboard: 'Tableau de bord',
    analytics: 'Analyses temporelles',
    list: 'Liste',
    reports: 'Rapports',
    calibration: 'Calibration terrain',
    queue: 'File de modération',
    logs: 'Journaux',
    authority: 'Autorité',
    service: 'État du service',
  },
};
const en: AdministrationCopy = {
  navigation: 'Administration sections',
  subsections: 'Subsections',
  contextPreserved: 'Applied filters are preserved in the link.',
  groups: {
    overview: 'Overview',
    players: 'Players',
    runs: 'Runs',
    balance: 'Balance',
    moderation: 'Moderation',
    monitoring: 'Monitoring',
  },
  views: {
    dashboard: 'Dashboard',
    analytics: 'Time analytics',
    list: 'List',
    reports: 'Reports',
    calibration: 'Field calibration',
    queue: 'Moderation queue',
    logs: 'Logs',
    authority: 'Authority',
    service: 'Service health',
  },
};
export function getAdministrationCopy(language: string): AdministrationCopy {
  return language.startsWith('en') ? en : fr;
}
