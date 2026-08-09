import {
  AUTHORITY_REJECTION_ALERT_POLICY,
  type AuthorityRejectionSignal,
} from './authorityRejectionMonitor';

export interface ExternalAuthorityAlertEnvelope {
  schemaVersion: 1;
  kind: 'authority_rejection';
  observedAt: string;
  windowMinutes: number;
  engineVersion: string;
  gameplayRulesetVersion: number;
  attemptCount: number;
  rejectedCount: number;
  rejectionRate: number;
  rejectionCodes: string[];
  unknownCodes: string[];
  reasons: AuthorityRejectionSignal['reasons'];
}

const MAX_ALERT_CODES = 20;

export function createExternalAuthorityAlertEnvelope(
  signal: AuthorityRejectionSignal,
  observedAt = new Date(),
): ExternalAuthorityAlertEnvelope {
  return {
    schemaVersion: 1,
    kind: 'authority_rejection',
    observedAt: observedAt.toISOString(),
    windowMinutes: AUTHORITY_REJECTION_ALERT_POLICY.windowMinutes,
    engineVersion: signal.engineVersion,
    gameplayRulesetVersion: signal.gameplayRulesetVersion,
    attemptCount: signal.attemptCount,
    rejectedCount: signal.rejectedCount,
    rejectionRate: signal.rejectionRate,
    rejectionCodes: signal.rejectionCodes.slice(0, MAX_ALERT_CODES),
    unknownCodes: signal.unknownCodes.slice(0, MAX_ALERT_CODES),
    reasons: [...signal.reasons],
  };
}
