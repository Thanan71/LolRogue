import { describe, expect, it } from 'vitest';
import { AUTHORITY_ENGINE_VERSION } from '@/game/authority/AuthorityRunEngine';
import { usesCanonicalProgression } from '@/game/run/runAuthorityJournal';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

describe('authority progression engine versioning', () => {
  it('keeps the current authority engine on canonical progression', () => {
    const currentAttempt = {
      engineVersion: AUTHORITY_ENGINE_VERSION,
    } as RunAuthorityAttempt;

    expect(usesCanonicalProgression(currentAttempt)).toBe(true);
  });

  it('does not silently treat unknown engine versions as canonical', () => {
    const unknownAttempt = {
      engineVersion: 'run-engine-v999',
    } as RunAuthorityAttempt;

    expect(usesCanonicalProgression(unknownAttempt)).toBe(false);
  });
});
