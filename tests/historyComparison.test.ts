import { describe, expect, it } from 'vitest';
import { historyComparison } from '@/components/history/historyComparison';
import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionRegistry';
import type { RunHistoryEntry } from '@/services/interfaces/IRunRepository';
import type { Run } from '@/types/models';

const current: RunHistoryEntry = {
  run: { progression_source: 'verified' } as Run,
  attempt: {
    engineVersion: CURRENT_AUTHORITY_VERSION.engine,
    gameplayRulesetVersion: CURRENT_AUTHORITY_VERSION.gameplay,
    progressionRulesetVersion: 2,
    difficulty: 'normal',
    mode: 'normal',
  },
};
describe('history comparison labels', () => {
  it('keeps unverified and missing-attempt runs explicitly legacy', () => {
    expect(historyComparison({ ...current, attempt: null })).toBe('legacy');
    expect(
      historyComparison({ ...current, run: { progression_source: 'client_reported' } as Run }),
    ).toBe('legacy');
  });
  it('does not mix engine or ruleset cohorts with current gameplay', () => {
    expect(historyComparison(current)).toBe('comparable');
    expect(
      historyComparison({
        ...current,
        attempt: { ...current.attempt!, engineVersion: 'run-engine-v20' },
      }),
    ).toBe('nonComparable');
    expect(
      historyComparison({
        ...current,
        attempt: { ...current.attempt!, gameplayRulesetVersion: 20 },
      }),
    ).toBe('nonComparable');
  });
});
