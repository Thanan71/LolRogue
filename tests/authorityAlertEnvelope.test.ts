import { describe, expect, it } from 'vitest';
import { createExternalAuthorityAlertEnvelope } from '@/observability/authorityAlertEnvelope';
import type { AuthorityRejectionSignal } from '@/observability/authorityRejectionMonitor';

describe('external authority alert envelope', () => {
  it('allowlists aggregate fields and drops journals, actions and player identity', () => {
    const unsafeSignal = {
      engineVersion: 'run-engine-v13',
      gameplayRulesetVersion: 13,
      attemptCount: 10,
      rejectedCount: 4,
      rejectionRate: 0.4,
      rejectionCodes: ['pending_choice'],
      unknownCodes: [],
      reasons: ['rejection_rate'],
      attemptId: '11111111-1111-4111-8111-111111111111',
      userId: '22222222-2222-4222-8222-222222222222',
      commands: [{ kind: 'move_node', payload: { node_id: 'secret-path' } }],
      journal: 'full-player-journal',
    } as AuthorityRejectionSignal & Record<string, unknown>;

    const envelope = createExternalAuthorityAlertEnvelope(
      unsafeSignal,
      new Date('2026-08-09T12:15:00.000Z'),
    );
    expect(envelope).toEqual({
      schemaVersion: 1,
      kind: 'authority_rejection',
      observedAt: '2026-08-09T12:15:00.000Z',
      windowMinutes: 15,
      engineVersion: 'run-engine-v13',
      gameplayRulesetVersion: 13,
      attemptCount: 10,
      rejectedCount: 4,
      rejectionRate: 0.4,
      rejectionCodes: ['pending_choice'],
      unknownCodes: [],
      reasons: ['rejection_rate'],
    });
    expect(JSON.stringify(envelope)).not.toMatch(/attemptId|commands|journal|node_id|userId/);
  });

  it('bounds rejection code arrays in the external payload', () => {
    const codes = Array.from({ length: 30 }, (_, index) => `code_${index}`);
    const envelope = createExternalAuthorityAlertEnvelope({
      engineVersion: 'run-engine-v13',
      gameplayRulesetVersion: 13,
      attemptCount: 30,
      rejectedCount: 30,
      rejectionRate: 1,
      rejectionCodes: codes,
      unknownCodes: codes,
      reasons: ['new_rejection_code', 'rejection_rate'],
    });
    expect(envelope.rejectionCodes).toHaveLength(20);
    expect(envelope.unknownCodes).toHaveLength(20);
  });
});
