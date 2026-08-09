import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_VERIFICATION_SLO,
  type AuthorityAttemptAggregate,
  evaluateAuthorityRejectionAlerts,
} from '@/observability/authorityRejectionMonitor';

const now = new Date('2026-08-09T12:15:00.000Z');

function aggregate(overrides: Partial<AuthorityAttemptAggregate> = {}): AuthorityAttemptAggregate {
  return {
    windowStartedAt: '2026-08-09T12:10:00.000Z',
    engineVersion: 'run-engine-v13',
    gameplayRulesetVersion: 13,
    rejectionCode: null,
    attemptCount: 10,
    startedCount: 10,
    finishedCount: 0,
    verifiedCount: 0,
    rejectedCount: 0,
    expiredCount: 0,
    ...overrides,
  };
}

describe('authority rejection monitor', () => {
  it('formalizes the verification SLO and alert window', () => {
    expect(AUTHORITY_VERIFICATION_SLO).toEqual({
      target: 0.99,
      terminalLatencySeconds: 120,
      evaluationWindowDays: 30,
      pendingAlertMinutes: 5,
      alertWindowMinutes: 15,
    });
  });

  it('stays quiet below the rejection threshold', () => {
    expect(
      evaluateAuthorityRejectionAlerts(
        [
          aggregate({ attemptCount: 9 }),
          aggregate({ attemptCount: 1, rejectionCode: 'invalid_trace', rejectedCount: 1 }),
        ],
        now,
      ),
    ).toEqual([]);
  });

  it('alerts for a threshold breach or an unknown rejection code', () => {
    const [rateAlert] = evaluateAuthorityRejectionAlerts(
      [
        aggregate({ attemptCount: 8 }),
        aggregate({ attemptCount: 2, rejectionCode: 'invalid_trace', rejectedCount: 2 }),
      ],
      now,
    );
    expect(rateAlert).toMatchObject({
      engineVersion: 'run-engine-v13',
      gameplayRulesetVersion: 13,
      attemptCount: 10,
      rejectedCount: 2,
      rejectionRate: 0.2,
      reasons: ['rejection_rate'],
    });

    const [newCodeAlert] = evaluateAuthorityRejectionAlerts(
      [aggregate({ attemptCount: 1, rejectionCode: 'brand_new_code', rejectedCount: 1 })],
      now,
    );
    expect(newCodeAlert).toMatchObject({
      unknownCodes: ['brand_new_code'],
      reasons: ['new_rejection_code'],
    });
  });

  it('ignores buckets outside the fifteen-minute window', () => {
    expect(
      evaluateAuthorityRejectionAlerts(
        [
          aggregate({
            windowStartedAt: '2026-08-09T11:59:00.000Z',
            rejectionCode: 'brand_new_code',
            rejectedCount: 10,
          }),
        ],
        now,
      ),
    ).toEqual([]);
  });

  it('detects a pending_choice spike before the global minimum volume is reached', () => {
    const [alert] = evaluateAuthorityRejectionAlerts(
      [
        aggregate({
          attemptCount: 4,
          startedCount: 0,
          rejectionCode: 'pending_choice',
          rejectedCount: 4,
        }),
      ],
      now,
    );

    expect(alert).toMatchObject({
      engineVersion: 'run-engine-v13',
      attemptCount: 4,
      rejectedCount: 4,
      rejectionCodes: ['pending_choice'],
      reasons: ['rejection_code_spike'],
    });
  });
});
