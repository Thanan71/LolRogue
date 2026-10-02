import { describe, expect, it } from 'vitest';

import { gameOverContent } from '@/i18n/gameOverContent';
import type { RunSaveDiagnostic } from '@/types/run';
import { formatRunSaveDiagnostic } from '@/utils/runDiagnostic';

const diagnostic: RunSaveDiagnostic = {
  attemptId: 'attempt-42',
  engineVersion: 'run-engine-v21',
  rejectionCode: 'pending_choice',
};

describe('formatRunSaveDiagnostic', () => {
  it('formats support labels in French', () => {
    expect(formatRunSaveDiagnostic(diagnostic, gameOverContent['fr-FR'].save.diagnostic)).toBe(
      'Identifiant de tentative: attempt-42\nVersion de l’autorité: run-engine-v21\nCode de rejet: pending_choice',
    );
  });

  it('formats support labels in English', () => {
    expect(formatRunSaveDiagnostic(diagnostic, gameOverContent['en-US'].save.diagnostic)).toBe(
      'Attempt ID: attempt-42\nAuthority version: run-engine-v21\nRejection code: pending_choice',
    );
  });
});
