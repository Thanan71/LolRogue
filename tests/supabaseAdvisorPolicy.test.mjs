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

  it('accepts only an exact allowlist identity, name and level contract', () => {
    const exception = {
      type: 'performance',
      cacheKey: 'multiple_permissive_policies_public_runs_authenticated_SELECT',
      name: 'multiple_permissive_policies',
      level: 'WARN',
      justification: 'Two intentional read policies remain separated for auditability.',
      expiresAt: '2026-09-30',
    };
    const exact = evaluateAdvisorFindings(
      policy({ exceptions: [exception] }),
      reports({
        performance: [
          {
            cacheKey: exception.cacheKey,
            name: exception.name,
            level: exception.level,
          },
        ],
      }),
    );
    expect(exact.blockers).toEqual([]);

    const changed = evaluateAdvisorFindings(
      policy({ exceptions: [exception] }),
      reports({
        performance: [{ cacheKey: exception.cacheKey, name: exception.name, level: 'INFO' }],
      }),
    );
    expect(changed.blockers).toEqual([
      expect.objectContaining({ code: 'finding-contract-changed' }),
    ]);
  });

  it('rejects duplicate exception IDs and vague justifications', () => {
    const exception = {
      type: 'security',
      cacheKey: 'rls_enabled_no_policy_public_internal',
      name: 'rls_enabled_no_policy',
      level: 'INFO',
      justification: 'Internal server-only table deliberately has no client read policy.',
      expiresAt: '2026-09-30',
    };
    expect(() => validateAdvisorPolicy(policy({ exceptions: [exception, exception] }))).toThrow(
      'is duplicated',
    );
    expect(() =>
      validateAdvisorPolicy(
        policy({ exceptions: [{ ...exception, justification: 'intentional' }] }),
      ),
    ).toThrow('justification must contain at least 20 characters');
  });
});
