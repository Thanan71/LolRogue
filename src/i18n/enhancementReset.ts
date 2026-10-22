import type { Locale } from './fr';

const messages = {
  'fr-FR': {
    succeeded:
      'Arbre réinitialisé. Les Candies attestées ont été remboursées ; la maîtrise et la run en cours sont conservées.',
    saveFailed: 'La réinitialisation n’a pas pu être confirmée. Réessaie avec la même demande.',
    conflict: 'L’arbre ou la politique a changé. Recharge l’aperçu avant de confirmer.',
    historyUnavailable:
      'L’historique ne permet pas un remboursement sûr. Tes achats sont conservés ; contacte le support.',
    accountRequired: 'Connecte-toi à ton compte pour réinitialiser cet arbre.',
    loadFailed: 'Impossible de charger l’aperçu de réinitialisation. Réessaie.',
  },
  'en-US': {
    succeeded:
      'Tree reset. Attested Candies were refunded; mastery and the current run are preserved.',
    saveFailed: 'The reset could not be confirmed. Retry the same request.',
    conflict: 'The tree or policy changed. Reload the preview before confirming.',
    historyUnavailable:
      'The history cannot establish a safe refund. Your purchases are preserved; contact support.',
    accountRequired: 'Sign in to your account to reset this tree.',
    loadFailed: 'The reset preview could not be loaded. Retry.',
  },
} as const;

export function getEnhancementResetCopy(locale: Locale) {
  return messages[locale];
}
