export const AUTHORITY_REJECTION_ALERT_POLICY = {
  windowMinutes: 15,
  minimumAttempts: 5,
  rejectionRateThreshold: 0.2,
  sameCodeSpikeThreshold: 3,
} as const;

export const KNOWN_AUTHORITY_REJECTION_CODES = new Set([
  'combat_limit',
  'encounter_already_claimed',
  'encounter_pending',
  'insufficient_gold',
  'invalid_attempt',
  'invalid_attempt_contract',
  'invalid_champion',
  'invalid_claimed_journal',
  'invalid_combat_action_trace',
  'invalid_combat_result',
  'invalid_command',
  'invalid_content',
  'invalid_encounter',
  'invalid_item',
  'invalid_node',
  'invalid_offer',
  'invalid_progression',
  'invalid_sequence',
  'invalid_trace',
  'invalid_verifier_result',
  'inventory_full',
  'offer_consumed',
  'pending_choice',
  'result_rejected',
  'run_not_terminal',
  'trace_too_large',
  'treasure_not_collected',
  'unknown_command',
  'verification_failed',
  'wrong_encounter_type',
]);

export interface AuthorityAttemptAggregate {
  windowStartedAt: string;
  engineVersion: string;
  gameplayRulesetVersion: number;
  rejectionCode: string | null;
  attemptCount: number;
  startedCount: number;
  finishedCount: number;
  verifiedCount: number;
  rejectedCount: number;
  expiredCount: number;
}

export interface AuthorityRejectionSignal {
  engineVersion: string;
  gameplayRulesetVersion: number;
  attemptCount: number;
  rejectedCount: number;
  rejectionRate: number;
  rejectionCodes: string[];
  unknownCodes: string[];
  reasons: Array<'new_rejection_code' | 'rejection_code_spike' | 'rejection_rate'>;
}

function finiteCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function evaluateAuthorityRejectionAlerts(
  aggregates: readonly AuthorityAttemptAggregate[],
  now = new Date(),
): AuthorityRejectionSignal[] {
  const windowStart = now.getTime() - AUTHORITY_REJECTION_ALERT_POLICY.windowMinutes * 60_000;
  const grouped = new Map<
    string,
    Omit<AuthorityRejectionSignal, 'rejectionRate' | 'reasons' | 'unknownCodes'> & {
      codes: Map<string, number>;
    }
  >();

  for (const aggregate of aggregates) {
    const bucketTime = Date.parse(aggregate.windowStartedAt);
    if (!Number.isFinite(bucketTime) || bucketTime < windowStart || bucketTime > now.getTime()) {
      continue;
    }
    const key = `${aggregate.engineVersion}\0${aggregate.gameplayRulesetVersion}`;
    const group = grouped.get(key) ?? {
      engineVersion: aggregate.engineVersion,
      gameplayRulesetVersion: aggregate.gameplayRulesetVersion,
      attemptCount: 0,
      rejectedCount: 0,
      rejectionCodes: [],
      codes: new Map<string, number>(),
    };
    group.attemptCount += finiteCount(aggregate.attemptCount);
    group.rejectedCount += finiteCount(aggregate.rejectedCount);
    if (aggregate.rejectionCode && aggregate.rejectedCount > 0) {
      group.codes.set(
        aggregate.rejectionCode,
        (group.codes.get(aggregate.rejectionCode) ?? 0) + finiteCount(aggregate.rejectedCount),
      );
    }
    grouped.set(key, group);
  }

  return [...grouped.values()].flatMap((group) => {
    const rejectionRate = group.attemptCount === 0 ? 0 : group.rejectedCount / group.attemptCount;
    const rejectionCodes = [...group.codes.keys()].sort();
    const unknownCodes = rejectionCodes.filter(
      (code) => !KNOWN_AUTHORITY_REJECTION_CODES.has(code),
    );
    const reasons: AuthorityRejectionSignal['reasons'] = [];
    if (unknownCodes.length > 0) reasons.push('new_rejection_code');
    if (
      [...group.codes.values()].some(
        (count) => count >= AUTHORITY_REJECTION_ALERT_POLICY.sameCodeSpikeThreshold,
      )
    ) {
      reasons.push('rejection_code_spike');
    }
    if (
      group.attemptCount >= AUTHORITY_REJECTION_ALERT_POLICY.minimumAttempts &&
      rejectionRate >= AUTHORITY_REJECTION_ALERT_POLICY.rejectionRateThreshold
    ) {
      reasons.push('rejection_rate');
    }
    if (reasons.length === 0) return [];
    return [
      {
        engineVersion: group.engineVersion,
        gameplayRulesetVersion: group.gameplayRulesetVersion,
        attemptCount: group.attemptCount,
        rejectedCount: group.rejectedCount,
        rejectionRate,
        rejectionCodes,
        unknownCodes,
        reasons,
      },
    ];
  });
}
