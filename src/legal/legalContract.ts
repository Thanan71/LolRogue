export const LEGAL_POLICY_VERSION = '2026-08-08';

export const RIOT_FAN_PROJECT_NOTICE =
  'LolRogue a été créé conformément à la politique « Legal Jibber Jabber » de Riot Games en utilisant des ressources appartenant à Riot Games. Riot Games ne soutient ni ne sponsorise ce projet.';

export const PRIVACY_RETENTION = {
  publicDailyLeaderboardMonths: 13,
  diagnosticLogDays: 14,
  reviewedModerationReportMonths: 24,
  accountData: 'Jusqu’à la suppression du compte',
  guestData: 'Jusqu’à l’effacement des données du navigateur',
} as const;

export const PRODUCTION_LEGAL_GATE = {
  targetRegion: 'France et Union européenne',
  monetizationAllowed: false,
  publicReleaseCleared: false,
  requiresExternalCounsel: true,
  requiresRiotClearanceAssessment: true,
} as const;

export const LOCAL_STORAGE_PURPOSES = [
  'Session Supabase et reprise de connexion',
  'Préférences audio, lisibilité et commandes',
  'Progression invitée et reprise locale de partie',
  'État vu/non vu des tutoriels',
] as const;
