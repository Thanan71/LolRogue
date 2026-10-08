import { type Locale, locale } from './fr';

export type RunErrorCatalog = Readonly<{
  startInProgress: string;
  activeRun: string;
  activeRunAnotherTab: (runId: string) => string;
  profileNotReady: string;
  onlineStartRequired: string;
  invalidTeam: string;
  invalidTeamSize: (maximum: number) => string;
  invalidStarterCount: (required: number) => string;
  duplicateChampion: string;
  unknownChampion: string;
  unsupportedChampion: string;
  startFailed: string;
  dailyStarterChanged: string;
  championLocked: string;
  championRotationExpired: string;
  championRosterUnavailable: string;
  staleRun: string;
  finalizationInProgress: string;
  accountChanged: string;
  previousRunCheckFailed: string;
  activeRunElsewhere: (expiresAt: string) => string;
  previousVerificationPending: string;
  secureStartCommandUnavailable: string;
  previousAttemptOpen: string;
  secureFinishCommandUnavailable: string;
  abandonmentFailed: string;
  missingSaveData: string;
  missingServerAttempt: string;
  attemptOwnerChanged: string;
  attemptExpired: string;
  traceRejected: (commandIndex: number | null) => string;
  versionConflict: string;
  missingChoice: string;
  incorrectSequence: string;
  journalSyncFailed: string;
  sealFailed: string;
  verificationFailed: () => string;
  finalizationFailed: string;
  saveInterrupted: string;
  verificationInProgress: (retryAfterSeconds: number | null) => string;
  verifierUpdating: string;
  versionContractUnavailable: string;
  journalNotSealed: string;
  attemptNotFound: string;
  unexpected: string;
}>;

function formatExpiry(value: string, locale: Locale): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatNumber(value: number, contentLocale: Locale): string {
  return value.toLocaleString(contentLocale);
}

const frFR: RunErrorCatalog = {
  startInProgress: 'Un départ de partie est déjà en cours de vérification.',
  activeRun:
    'Terminez ou abandonnez explicitement la partie active avant d’en commencer une autre.',
  activeRunAnotherTab: (runId) =>
    `La partie ${runId} est active dans un autre onglet. Reprenez-la au lieu d’en commencer une autre.`,
  profileNotReady:
    'Votre profil authentifié n’est pas prêt. Relancez son chargement avant de commencer.',
  onlineStartRequired: 'Reconnectez-vous au réseau pour commencer une partie connectée.',
  invalidTeam: 'L’équipe de départ est invalide.',
  invalidTeamSize: (maximum) =>
    `Sélectionnez entre 1 et ${formatNumber(maximum, 'fr-FR')} champions.`,
  invalidStarterCount: (required) =>
    `Ce mode exige exactement ${formatNumber(required, 'fr-FR')} champion${required > 1 ? 's' : ''} de départ.`,
  duplicateChampion: 'Un champion ne peut apparaître qu’une fois dans l’équipe.',
  unknownChampion: 'L’équipe contient un champion inconnu.',
  unsupportedChampion: 'L’équipe contient un champion non pris en charge.',
  startFailed: 'La partie vérifiée n’a pas pu démarrer.',
  dailyStarterChanged:
    'L’offre du défi quotidien a changé. Sélectionnez le nouveau champion proposé.',
  championLocked: 'Ce champion est verrouillé. Choisissez un champion disponible ou débloquez-le.',
  championRotationExpired:
    'Les accès aux champions ont changé. Choisissez un champion dans la sélection actualisée.',
  championRosterUnavailable:
    'Impossible de vérifier les champions disponibles. Vérifiez la connexion puis réessayez.',
  staleRun: 'La partie demandée n’est plus la partie active.',
  finalizationInProgress: 'La finalisation d’une autre partie est déjà en cours.',
  accountChanged: 'Le compte authentifié a changé pendant l’opération.',
  previousRunCheckFailed: 'Impossible de vérifier les parties précédentes.',
  activeRunElsewhere: (expiresAt) =>
    `Une partie vérifiée est active sur un autre appareil jusqu’au ${formatExpiry(expiresAt, 'fr-FR')}. Reprenez-la sur cet appareil ou réessayez après son expiration.`,
  previousVerificationPending: 'Une partie précédente attend encore sa vérification.',
  secureStartCommandUnavailable: 'Ce navigateur ne peut pas créer la commande de départ sécurisée.',
  previousAttemptOpen:
    'Une partie vérifiée précédente est encore ouverte. Réessayez pour la récupérer avant d’en commencer une autre.',
  secureFinishCommandUnavailable: 'Ce navigateur ne peut pas créer la commande de fin sécurisée.',
  abandonmentFailed: 'L’abandon de la partie n’a pas pu être enregistré.',
  missingSaveData: 'Des données requises pour enregistrer la partie authentifiée sont absentes.',
  missingServerAttempt:
    'Cette partie ne possède aucune tentative serveur et ne peut pas accorder de progression authentifiée.',
  attemptOwnerChanged: 'Cette tentative appartient à un autre compte authentifié.',
  attemptExpired:
    'Le délai de validation de cette partie est dépassé. Commencez une nouvelle partie pour obtenir une progression vérifiée.',
  traceRejected: (commandIndex) =>
    `Le serveur n’a pas pu valider les actions de cette partie${commandIndex === null ? '.' : ` à l’action ${formatNumber(commandIndex + 1, 'fr-FR')}.`} Commencez une nouvelle partie ; si cela se reproduit, copiez le diagnostic pour le support.`,
  versionConflict:
    'La version de cette partie ne correspond pas à celle attendue par le serveur. Actualisez le jeu avant de commencer une nouvelle partie.',
  missingChoice:
    'Une amélioration obligatoire n’a pas été enregistrée avant la suite de la partie. Commencez une nouvelle partie ; si cela se reproduit, copiez le diagnostic pour le support.',
  incorrectSequence:
    'Les actions enregistrées ne sont pas dans l’ordre attendu. Commencez une nouvelle partie ; si cela se reproduit, copiez le diagnostic pour le support.',
  journalSyncFailed: 'Le journal des commandes de la partie n’a pas pu être synchronisé.',
  sealFailed: 'La tentative de partie n’a pas pu être scellée.',
  verificationFailed: () =>
    'Impossible de vérifier cette partie pour le moment. Vérifiez l’état du serveur puis réessayez.',
  finalizationFailed: 'La partie n’a pas pu être finalisée.',
  saveInterrupted: 'L’enregistrement a été interrompu. Réessayez pour continuer.',
  verificationInProgress: (retryAfterSeconds) =>
    retryAfterSeconds
      ? `La vérification est déjà en cours. Réessayez dans environ ${formatNumber(retryAfterSeconds, 'fr-FR')} ${retryAfterSeconds === 1 ? 'seconde' : 'secondes'}.`
      : 'La vérification est déjà en cours. Réessayez dans quelques secondes.',
  verifierUpdating:
    'Le vérificateur ne peut pas valider cette version pour le moment. Réessayez plus tard ; si cela persiste, copiez le diagnostic pour le support.',
  versionContractUnavailable:
    'La configuration de version du serveur empêche la vérification de cette partie. Réessayez plus tard ; si cela persiste, copiez le diagnostic pour le support.',
  journalNotSealed: 'Le journal de la partie n’est pas encore scellé. Relancez la vérification.',
  attemptNotFound: 'Cette tentative n’existe plus sur le serveur.',
  unexpected: 'Une erreur inattendue empêche la progression de la partie.',
};

const enUS: RunErrorCatalog = {
  startInProgress: 'A run start is already being verified.',
  activeRun: 'Finish or explicitly abandon the active run before starting another.',
  activeRunAnotherTab: (runId) =>
    `Run ${runId} is active in another tab. Resume it instead of starting another.`,
  profileNotReady: 'Your authenticated profile is not ready. Retry loading it before starting.',
  onlineStartRequired: 'Reconnect to the network to start an account run.',
  invalidTeam: 'The starting team is invalid.',
  invalidTeamSize: (maximum) => `Select between 1 and ${formatNumber(maximum, 'en-US')} champions.`,
  invalidStarterCount: (required) =>
    `This mode requires exactly ${formatNumber(required, 'en-US')} starter${required === 1 ? '' : 's'}.`,
  duplicateChampion: 'A champion can appear only once on the team.',
  unknownChampion: 'The team contains an unknown champion.',
  unsupportedChampion: 'The team contains an unsupported champion.',
  startFailed: 'The verified run could not be started.',
  dailyStarterChanged: 'The daily challenge offer changed. Select the newly offered champion.',
  championLocked: 'This champion is locked. Choose an available champion or unlock it.',
  championRotationExpired: 'Champion access changed. Choose a champion from the updated roster.',
  championRosterUnavailable:
    'Unable to check available champions. Check your connection and try again.',
  staleRun: 'The requested run is no longer the active run.',
  finalizationInProgress: 'Another run finalization is already in progress.',
  accountChanged: 'The authenticated account changed during the operation.',
  previousRunCheckFailed: 'Unable to check previous runs.',
  activeRunElsewhere: (expiresAt) =>
    `A verified run is active on another device until ${formatExpiry(expiresAt, 'en-US')}. Resume it there or retry after it expires.`,
  previousVerificationPending: 'A previous run is still waiting for verification.',
  secureStartCommandUnavailable: 'This browser cannot create the secure start command.',
  previousAttemptOpen:
    'A previous verified run is still open. Retry to recover it before starting another run.',
  secureFinishCommandUnavailable: 'This browser cannot create the secure finish command.',
  abandonmentFailed: 'The run abandonment could not be recorded.',
  missingSaveData: 'Required data for saving the authenticated run is missing.',
  missingServerAttempt:
    'This run has no server attempt and cannot grant authenticated progression.',
  attemptOwnerChanged: 'This run attempt belongs to another authenticated account.',
  attemptExpired:
    'The validation window for this run has expired. Start a new run to earn verified progression.',
  traceRejected: (commandIndex) =>
    `The server could not validate this run’s actions${commandIndex === null ? '.' : ` at action ${formatNumber(commandIndex + 1, 'en-US')}.`} Start a new run; if this happens again, copy the diagnostic for support.`,
  versionConflict:
    'This run’s version does not match the version expected by the server. Refresh the game before starting a new run.',
  missingChoice:
    'A required upgrade was not recorded before the run continued. Start a new run; if this happens again, copy the diagnostic for support.',
  incorrectSequence:
    'The recorded actions are not in the expected order. Start a new run; if this happens again, copy the diagnostic for support.',
  journalSyncFailed: 'The run command journal could not be synchronized.',
  sealFailed: 'The run attempt could not be sealed.',
  verificationFailed: () =>
    'Unable to verify this run right now. Check the server status and try again.',
  finalizationFailed: 'The run could not be finalized.',
  saveInterrupted: 'Run saving was interrupted. Retry to continue.',
  verificationInProgress: (retryAfterSeconds) =>
    retryAfterSeconds
      ? `Verification is already in progress. Retry in about ${formatNumber(retryAfterSeconds, 'en-US')} ${retryAfterSeconds === 1 ? 'second' : 'seconds'}.`
      : 'Verification is already in progress. Retry in a few seconds.',
  verifierUpdating:
    'The verifier cannot validate this version right now. Try again later; if it persists, copy the diagnostic for support.',
  versionContractUnavailable:
    'A server version configuration issue is preventing this run from being verified. Try again later; if it persists, copy the diagnostic for support.',
  journalNotSealed: 'The run journal has not been sealed yet. Retry verification.',
  attemptNotFound: 'This run attempt no longer exists on the server.',
  unexpected: 'An unexpected error is preventing run progression.',
};

export const runErrorContent = {
  'fr-FR': frFR,
  'en-US': enUS,
} as const satisfies Record<Locale, RunErrorCatalog>;

export const runError = runErrorContent[locale];

const STATIC_KEYS = [
  'startInProgress',
  'activeRun',
  'profileNotReady',
  'onlineStartRequired',
  'invalidTeam',
  'duplicateChampion',
  'unknownChampion',
  'unsupportedChampion',
  'startFailed',
  'dailyStarterChanged',
  'championLocked',
  'championRotationExpired',
  'championRosterUnavailable',
  'staleRun',
  'finalizationInProgress',
  'accountChanged',
  'previousRunCheckFailed',
  'previousVerificationPending',
  'secureStartCommandUnavailable',
  'previousAttemptOpen',
  'secureFinishCommandUnavailable',
  'abandonmentFailed',
  'missingSaveData',
  'missingServerAttempt',
  'attemptOwnerChanged',
  'attemptExpired',
  'versionConflict',
  'missingChoice',
  'incorrectSequence',
  'journalSyncFailed',
  'sealFailed',
  'finalizationFailed',
  'saveInterrupted',
  'verifierUpdating',
  'versionContractUnavailable',
  'journalNotSealed',
  'attemptNotFound',
  'unexpected',
] as const;

export function localizePersistedRunError(message: string | null): string {
  if (!message) return runError.unexpected;
  if (message === frFR.verificationFailed() || message === enUS.verificationFailed()) {
    return runError.verificationFailed();
  }
  for (const key of STATIC_KEYS) {
    if (message === frFR[key] || message === enUS[key]) return runError[key];
  }
  const retryDelay = message.match(/(?:environ|about)\s+(\d+)\s+second/iu)?.[1];
  if (retryDelay) return runError.verificationInProgress(Number(retryDelay));
  if (/vérification est déjà en cours|verification is already in progress/iu.test(message)) {
    return runError.verificationInProgress(null);
  }
  const verificationCode = message.match(
    /^(?:La vérification de la partie a échoué|Run verification failed) \(([^)]+)\)/u,
  )?.[1];
  if (verificationCode) return runError.verificationFailed();
  return runError.unexpected;
}

export function verificationRetryableMessage(
  code: string,
  retryAfterSeconds: number | null,
  contentLocale: Locale = locale,
): string {
  const copy = runErrorContent[contentLocale];
  switch (code) {
    case 'verification_in_progress':
      return copy.verificationInProgress(retryAfterSeconds);
    case 'unsupported_attempt_version':
      return copy.verifierUpdating;
    case 'invalid_attempt_version_contract':
      return copy.versionContractUnavailable;
    case 'run_attempt_not_sealed':
      return copy.journalNotSealed;
    default:
      return copy.verificationFailed();
  }
}

export function verificationRejectionMessage(
  code: string,
  commandIndex: number | null,
  contentLocale: Locale = locale,
): string {
  const copy = runErrorContent[contentLocale];
  switch (code) {
    case 'run_attempt_expired':
      return copy.attemptExpired;
    case 'run_attempt_not_found':
      return copy.attemptNotFound;
    case 'unsupported_attempt_version':
    case 'invalid_attempt_version_contract':
    case 'engine_version_mismatch':
    case 'ruleset_version_mismatch':
      return copy.versionConflict;
    case 'pending_choice':
      return copy.missingChoice;
    case 'invalid_sequence':
    case 'command_sequence_mismatch':
      return copy.incorrectSequence;
    default:
      // Unknown server codes remain useful to support, never raw player-facing copy.
      return copy.traceRejected(commandIndex);
  }
}

export function runStartValidationMessage(
  code: string | null,
  requiredStarterCount: number,
  maximumTeamSize: number,
): string {
  switch (code) {
    case 'invalid_team_size':
      return runError.invalidTeamSize(maximumTeamSize);
    case 'invalid_starter_count':
      return runError.invalidStarterCount(requiredStarterCount);
    case 'duplicate_champion':
      return runError.duplicateChampion;
    case 'unknown_champion':
      return runError.unknownChampion;
    case 'unsupported_champion':
      return runError.unsupportedChampion;
    default:
      return runError.invalidTeam;
  }
}
