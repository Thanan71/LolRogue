/** The client definitions and their displayed prices belong to this exact catalogue. */
export const ENHANCEMENT_CATALOG_VERSION = 4;
export const ENHANCEMENT_CONTRACT_SCHEMA_VERSION = 1;

export function supportsEnhancementContract(
  contract: { catalogVersion: number; contractSchemaVersion: number } | null,
): boolean {
  return (
    contract?.catalogVersion === ENHANCEMENT_CATALOG_VERSION &&
    contract.contractSchemaVersion === ENHANCEMENT_CONTRACT_SCHEMA_VERSION
  );
}

export type EnhancementResetFailureKind = 'retryable' | 'conflict' | 'terminal';

/** Only uncertain outcomes may replay automatically. SQL business refusals are final. */
export function enhancementResetFailureKind(
  message?: string,
  sqlState?: string,
): EnhancementResetFailureKind {
  if (/^enhancement_(revision_conflict|reset_policy_conflict|reset_ineligible)/.test(message ?? ''))
    return 'conflict';
  if (
    (sqlState && /^(22|23|28|42|55|P0)/.test(sqlState)) ||
    /^(authentication_required|registered_account_required|player_not_found|invalid_enhancement|idempotency_key_reused|enhancement_[a-z_]+$)/.test(
      message ?? '',
    )
  )
    return 'terminal';
  return 'retryable';
}
