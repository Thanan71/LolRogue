import { describe, expect, it } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import {
  createAuthorityCohortExecutionPlan,
  executeAuthorityCohortPlan,
} from '@/game/balance/authorityCohortExecution';

describe('authority cohort CI execution', () => {
  it('builds the exact versioned PR volume', () => {
    const plan = createAuthorityCohortExecutionPlan('pr');

    expect(plan.seeds).toHaveLength(30);
    expect(plan.cells).toHaveLength(18);
  });

  it('keeps full traces out of reports and only preserves selected extremes', () => {
    const authority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
    expect(authority).toBeDefined();
    const productionPlan = createAuthorityCohortExecutionPlan('pr');
    const result = executeAuthorityCohortPlan({
      authority: authority!,
      plan: {
        profile: 'pr',
        cells: productionPlan.cells.slice(0, 1),
        seeds: productionPlan.seeds.slice(0, 3),
      },
    });

    expect(result.report.cellCount).toBe(1);
    expect(result.report.seeds).toHaveLength(3);
    expect(result.report.groups).toHaveLength(1);
    expect(result.report.groups[0]?.reports).toHaveLength(1);
    expect(JSON.stringify(result.report)).not.toContain('"trace"');

    const traces = result.extremeTraces.groups[0]?.traces ?? [];
    expect(traces.length).toBeGreaterThan(0);
    expect(traces.length).toBeLessThanOrEqual(3);
    expect(traces.every((artifact) => artifact.reasons.length > 0)).toBe(true);
    expect(traces.every((artifact) => artifact.trace.length > 0)).toBe(true);
  });

  it('rejects empty or duplicate seed plans', () => {
    const authority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
    expect(authority).toBeDefined();
    const cell = createAuthorityCohortExecutionPlan('pr').cells[0]!;

    expect(() =>
      executeAuthorityCohortPlan({
        authority: authority!,
        plan: { profile: 'pr', cells: [cell], seeds: [] },
      }),
    ).toThrow(/no seeds/);
    expect(() =>
      executeAuthorityCohortPlan({
        authority: authority!,
        plan: { profile: 'pr', cells: [cell], seeds: [1, 1] },
      }),
    ).toThrow(/duplicate seeds/);
  });
});
