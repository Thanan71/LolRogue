import { describe, expect, it } from 'vitest';
import {
  evaluateAdvisorFindings,
  validateAdvisorPolicy,
} from '../scripts/lib/supabase-advisor-policy.mjs';

function policy(overrides = {}) {
  return {
    schemaVersion: 1,
    blockingLevels: { security: ['ERROR'], performance: [] },
    rejectUnknownFindings: false,
    enforceExpiration: false,
    exceptions: [],
    ...overrides,
  };
}

function reports({ security = [], performance = [] } = {}) {
  return { security: { results: security }, performance: { results: performance } };
}

describe('Supabase advisor policy', () => {
  it('always blocks every security ERROR finding', () => {
    const result = evaluateAdvisorFindings(
      policy(),
      reports({
        security: [{ cacheKey: 'security-error', name: 'unsafe_view', level: 'ERROR' }],
      }),
    );

    expect(result.blockers).toEqual([expect.objectContaining({ code: 'security-blocking-level' })]);
  });

  it('cannot configure security ERROR as non-blocking', () => {
    expect(() =>
      validateAdvisorPolicy(policy({ blockingLevels: { security: [], performance: [] } })),
    ).toThrow('security ERROR findings must always be blocking');
  });

  it('requires complete reports for both advisor families', () => {
    const result = evaluateAdvisorFindings(policy(), { security: { results: [] } });
    expect(result.blockers).toEqual([
      expect.objectContaining({
        code: 'invalid-report',
        detail: expect.stringContaining('performance'),
      }),
    ]);
  });
});
