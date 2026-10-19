import type { DailyChallenge } from '@/types/dailyRun';

export function starterChallengeFixture(overrides: Partial<DailyChallenge> = {}): DailyChallenge {
  return {
    dailyDate: '2026-10-11',
    seed: 424_242,
    startsAt: '2026-10-11T00:00:00.000Z',
    expiresAt: '2026-10-12T00:00:00.000Z',
    difficulty: 'normal',
    dailyRulesetVersion: 1,
    gameplayRulesetVersion: 22,
    engineVersion: 'run-engine-0.2.0',
    gameplayContentHash: 'a'.repeat(64),
    scoreVersion: 1,
    starterIds: ['Garen', 'Annie', 'Ashe'],
    attemptPolicy: 'one_official_attempt_per_utc_day',
    hasAttempted: false,
    attemptId: null,
    attemptStatus: null,
    published: false,
    score: null,
    ...overrides,
  };
}
