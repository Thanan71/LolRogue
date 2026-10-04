import { describe, expect, it } from 'vitest';
import {
  localizePersistedRunError,
  runErrorContent,
  verificationRejectionMessage,
  verificationRetryableMessage,
} from '@/i18n/runErrorContent';

describe.each(['fr-FR', 'en-US'] as const)('run rejection explanations in %s', (locale) => {
  const copy = runErrorContent[locale];

  it.each([
    ['run_attempt_expired', 'attemptExpired'],
    ['pending_choice', 'missingChoice'],
    ['invalid_sequence', 'incorrectSequence'],
    ['command_sequence_mismatch', 'incorrectSequence'],
    ['unsupported_attempt_version', 'versionConflict'],
    ['invalid_attempt_version_contract', 'versionConflict'],
    ['engine_version_mismatch', 'versionConflict'],
    ['ruleset_version_mismatch', 'versionConflict'],
  ] as const)('explains %s with an actionable category', (code, key) => {
    expect(verificationRejectionMessage(code, null, locale)).toBe(copy[key]);
  });

  it.each(['invalid_trace', 'invalid_combat_action_trace', 'future_server_rejection'])(
    'keeps %s out of player-facing feedback and points to support',
    (code) => {
      const message = verificationRejectionMessage(code, 7, locale);
      expect(message).toBe(copy.traceRejected(7));
      expect(message).toContain('8');
      expect(message).toContain('support');
      expect(message).not.toContain(code);
    },
  );
});

describe('retryable verification feedback', () => {
  it('retains server recovery advice when reading persisted messages in either language', () => {
    for (const copy of Object.values(runErrorContent)) {
      expect(localizePersistedRunError(copy.verificationFailed())).toBe(
        runErrorContent['fr-FR'].verificationFailed(),
      );
    }
  });

  it('distinguishes a temporarily unavailable version from a terminal version conflict', () => {
    expect(verificationRetryableMessage('unsupported_attempt_version', null)).toBe(
      runErrorContent['fr-FR'].verifierUpdating,
    );
    expect(verificationRetryableMessage('unexpected_backend_error', null)).toBe(
      runErrorContent['fr-FR'].verificationFailed(),
    );
  });
});
