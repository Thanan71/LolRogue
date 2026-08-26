export const legalEn = {
  title: 'Legal information and privacy',
  subtitle: 'Terms of use, data processing, and intellectual property.',
  version: 'Version dated',
  legalNotice: {
    title: 'Legal notice',
    paragraphs: [
      'LolRogue is a free, non-commercial community prototype published from France. The repository maintainer is responsible for editorial content. The current public contact channel is the GitHub repository; personal data should not be posted in an issue.',
      'Application hosting: Vercel. Authentication and database: Supabase. These providers may process the technical data required to deliver the service according to the region configured by the operator.',
    ],
    repository: 'Repository and technical contact',
  },
  terms: {
    title: 'Terms of use',
    paragraphs: [
      'The service is provided free of charge, without guarantees of availability or preservation of test progress. Score tampering, security bypasses, harassment, or abusive automation may invalidate a score or suspend access.',
      'The project sells no content and does not authorize commercial exploitation. An external legal audit and a Riot authorization assessment remain mandatory before any commercial distribution or public launch presented as legally cleared.',
    ],
  },
  privacy: {
    title: 'Privacy',
    paragraphs: [
      'For a signed-in account, the service processes the authentication email address, profile, leaderboard preferences, progress, runs, their commands, and combat metrics. This data is used to authenticate, resume and verify runs, grant progress, secure the leaderboard, and diagnose errors.',
      'The leaderboard never publishes an email address, account name, or player ID. It displays a chosen alias or anonymous pseudonym, ranked statistics, and, for the global leaderboard, the optional profile avatar. Users can remove all public scores from settings.',
    ],
    dailyPublic: 'Public daily leaderboard',
    diagnosticLogs: 'Technical logs',
    reviewedReports: 'Reviewed reports',
    accountData: 'maximum',
    guestData: 'maximum',
    maximum: 'maximum',
  },
  storage: {
    title: 'Local storage, cookies, and telemetry',
    intro:
      'LolRogue currently includes no advertising, behavioral analytics, or marketing cookies. The browser stores only the following functional data:',
    telemetry:
      'Remote logging is disabled by default. It cannot be enabled in production without a documented purpose, user notice, and a consent mechanism where required by law.',
  },
  rights: {
    title: 'Access, export, and deletion',
    paragraphs: [
      'Users can hide their scores in settings. To request an export, correction, or complete deletion, they must contact the operator without posting an email address, token, or private identifier in a public channel. The operator verifies identity out of band, provides the export, then deletes Auth, profile, progress, runs, and Daily participation according to the operating procedure.',
      'Until a private rights-exercise channel is configured, the public beta is blocked. Purely local data can be deleted immediately by clearing site data in the browser.',
    ],
  },
  riot: {
    title: 'Riot Games and intellectual property',
    detail:
      'League of Legends, its characters, trademarks, and resources belong to Riot Games. Riot policy may be revoked or change over time. Compliance must be reassessed before every public launch.',
    officialPolicy: 'Official Riot Games policy',
  },
  metadata: {
    lastUpdated: 'Last updated',
    region: 'Region',
    service: 'Service',
    serviceValue: 'Free, non-commercial prototype',
    navigation: 'Navigation',
    onThisPage: 'On this page',
    retention: 'Retention periods',
  },
  backToAuth: 'Back to login',
  targetRegion: 'France and the European Union',
  accountRetention: 'Until account deletion',
  guestRetention: 'Until browser data is cleared',
  storagePurposes: [
    'Supabase session and sign-in recovery',
    'Audio, readability, and control preferences',
    'Guest progress and local run recovery',
    'Tutorial seen/unseen state',
  ],
  riotNotice:
    "LolRogue was created in accordance with Riot Games' Legal Jibber Jabber policy using resources owned by Riot Games. Riot Games does not support or sponsor this project.",
} as const;
