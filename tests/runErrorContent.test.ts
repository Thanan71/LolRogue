import { describe, expect, it } from 'vitest';
import {
  localizePersistedRunError,
  runErrorContent,
  verificationRejectionMessage,
  verificationRetryableMessage,
} from '@/i18n/runErrorContent';

describe('runErrorContent', () => {
  it('keeps strict key parity with localized functions in both catalogs', () => {
    expect(Object.keys(runErrorContent['en-US'])).toEqual(Object.keys(runErrorContent['fr-FR']));
    expect(runErrorContent['en-US'].verificationInProgress(12)).toContain('12 seconds');
    expect(runErrorContent['fr-FR'].verificationInProgress(12)).toContain('12 secondes');
  });

  it('maps verification codes without trusting server-provided prose', () => {
    expect(verificationRetryableMessage('verification_in_progress', 12)).toContain('12');
    expect(verificationRetryableMessage('temporary_failure', null)).toContain('temporary_failure');
    expect(verificationRejectionMessage('run_attempt_expired', null)).toBeTruthy();
    expect(verificationRejectionMessage('illegal_trace', 7)).toContain('illegal_trace');
    expect(
      localizePersistedRunError(
        'Run verification failed (verified_progression_commit_failed). Retry after checking the server status.',
      ),
    ).toBe(runErrorContent['fr-FR'].verificationFailed('verified_progression_commit_failed'));
    expect(localizePersistedRunError('untrusted backend prose')).toBe(
      runErrorContent['fr-FR'].unexpected,
    );
  });
});
