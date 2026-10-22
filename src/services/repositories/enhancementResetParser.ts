import type { EnhancementResetPreview } from '@/services/interfaces/IEnhancementRepository';

export function parseEnhancementResetPreview(
  value: unknown,
  championId: string,
): EnhancementResetPreview {
  const invalid = () => new Error('ENHANCEMENT_RESET_INVALID_RESPONSE');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  const integer = (key: string) => {
    const n = row[key];
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0) throw invalid();
    return n;
  };
  if (
    row.champion_id !== championId ||
    row.contract_schema_version !== 1 ||
    row.active_run_preserved !== true ||
    typeof row.eligible !== 'boolean' ||
    typeof row.history_unavailable !== 'boolean' ||
    typeof row.fee_exempt !== 'boolean' ||
    !(row.reason === null || (typeof row.reason === 'string' && row.reason.length > 0)) ||
    !Array.isArray(row.removed_node_ids) ||
    row.removed_node_ids.some((id) => typeof id !== 'string') ||
    !row.unlocked_nodes ||
    typeof row.unlocked_nodes !== 'object' ||
    Array.isArray(row.unlocked_nodes)
  )
    throw invalid();
  const ranks = Object.entries(row.unlocked_nodes).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isSafeInteger(entry[1]) && entry[1] > 0,
  );
  if (!row.history_unavailable && ranks.length !== Object.keys(row.unlocked_nodes).length)
    throw invalid();
  const actualSpend = integer('actual_spend'),
    refundAmount = integer('refund_amount'),
    feeAmount = integer('fee_amount');
  if (
    (row.eligible &&
      (row.reason !== null ||
        row.history_unavailable ||
        actualSpend !== refundAmount + feeAmount)) ||
    (!row.eligible && (row.reason === null || refundAmount !== 0 || feeAmount !== 0))
  )
    throw invalid();
  const catalogVersion = integer('catalog_version'),
    policyVersion = integer('policy_version');
  if (catalogVersion < 1 || policyVersion < 1) throw invalid();
  return {
    championId,
    revision: integer('revision'),
    catalogVersion,
    contractSchemaVersion: 1,
    unlockedNodes: Object.fromEntries(ranks),
    removedNodeIds: row.removed_node_ids as string[],
    actualSpend,
    refundAmount,
    feeAmount,
    feeExempt: row.fee_exempt,
    resetCount: integer('reset_count'),
    remainingCandies: integer('remaining_candies'),
    policyVersion,
    eligible: row.eligible,
    historyUnavailable: row.history_unavailable,
    reason: row.reason as string | null,
    activeRunPreserved: true,
  };
}
