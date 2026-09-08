import { type Locale, locale } from './fr';

export type RunErrorCatalog = Readonly<{
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
  traceRejected: (code: string, commandIndex: number | null) => string;
  journalSyncFailed: string;
  sealFailed: string;
  verificationFailed: (code?: string) => string;
  finalizationFailed: string;
  saveInterrupted: string;
  verificationInProgress: (retryAfterSeconds: number | null) => string;
  verifierUpdating: string;
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

const frFR: RunErrorCatalog = {
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
  attemptExpired: 'Cette tentative de partie vérifiée a expiré.',
  traceRejected: (code, commandIndex) =>
    `La trace de partie a été rejetée (${code}${commandIndex === null ? '' : ` à la commande ${commandIndex + 1}`}).`,
  journalSyncFailed: 'Le journal des commandes de la partie n’a pas pu être synchronisé.',
  sealFailed: 'La tentative de partie n’a pas pu être scellée.',
  verificationFailed: (code) =>
    code
      ? `La vérification de la partie a échoué (${code}). Réessayez après avoir vérifié l’état du serveur.`
      : 'La partie n’a pas pu être vérifiée.',
  finalizationFailed: 'La partie n’a pas pu être finalisée.',
  saveInterrupted: 'L’enregistrement a été interrompu. Réessayez pour continuer.',
  verificationInProgress: (retryAfterSeconds) =>
    retryAfterSeconds
      ? `La vérification est déjà en cours. Réessayez dans environ ${retryAfterSeconds} secondes.`
      : 'La vérification est déjà en cours. Réessayez dans quelques secondes.',
  verifierUpdating: 'Le vérificateur est en cours de mise à jour pour cette version. Réessayez bientôt.',
  journalNotSealed: 'Le journal de la partie n’est pas encore scellé. Relancez la vérification.',
  attemptNotFound: 'Cette tentative n’existe plus sur le serveur.',
  unexpected: 'Une erreur inattendue empêche la progression de la partie.',
};

const enUS: RunErrorCatalog = {
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
  attemptExpired: 'This verified run attempt has expired.',
  traceRejected: (code, commandIndex) =>
    `The run trace was rejected (${code}${commandIndex === null ? '' : ` at command ${commandIndex + 1}`}).`,
  journalSyncFailed: 'The run command journal could not be synchronized.',
  sealFailed: 'The run attempt could not be sealed.',
  verificationFailed: (code) =>
    code
      ? `Run verification failed (${code}). Retry after checking the server status.`
      : 'The run could not be verified.',
  finalizationFailed: 'The run could not be finalized.',
  saveInterrupted: 'Run saving was interrupted. Retry to continue.',
  verificationInProgress: (retryAfterSeconds) =>
    retryAfterSeconds
      ? `Verification is already in progress. Retry in about ${retryAfterSeconds} seconds.`
      : 'Verification is already in progress. Retry in a few seconds.',
  verifierUpdating: 'The verifier is being updated for this run version. Retry shortly.',
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
  'journalSyncFailed',
  'sealFailed',
  'finalizationFailed',
  'saveInterrupted',
  'verifierUpdating',
  'journalNotSealed',
  'attemptNotFound',
  'unexpected',
] as const;

export function localizePersistedRunError(message: string | null): string {
  if (!message) return runError.unexpected;
  for (const key of STATIC_KEYS) {
    if (message === frFR[key] || message === enUS[key]) return runError[key];
  }
  const retryDelay = message.match(/(?:environ|about)\s+(\d+)\s+second/iu)?.[1];
  if (retryDelay) return runError.verificationInProgress(Number(retryDelay));
  if (/vérification est déjà en cours|verification is already in progress/iu.test(message)) {
    return runError.verificationInProgress(null);
  }
  return runError.unexpected;
}

export function verificationRetryableMessage(
  code: string,
  retryAfterSeconds: number | null,
): string {
  switch (code) {
    case 'verification_in_progress':
      return runError.verificationInProgress(retryAfterSeconds);
    case 'unsupported_attempt_version':
      return runError.verifierUpdating;
    case 'run_attempt_not_sealed':
      return runError.journalNotSealed;
    default:
      return runError.verificationFailed(code);
  }
}

export function verificationRejectionMessage(
  code: string,
  commandIndex: number | null,
): string {
  if (code === 'run_attempt_expired') return runError.attemptExpired;
  if (code === 'run_attempt_not_found') return runError.attemptNotFound;
  return runError.traceRejected(code, commandIndex);
}
