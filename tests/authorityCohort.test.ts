import { describe, expect, it, vi } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import {
  type AuthorityCohortRuntime,
  simulateAuthorityCohort,
} from '@/game/balance/authorityCohort';
import { type BalanceScenario, survivalGreedyPolicy } from '@/game/balance/balancePolicy';

const TERMINAL_SCENARIO: BalanceScenario = {
  id: 'authority-cohort-terminal-parity',
  difficulty: 'hard',
  team: [{ championId: 'Soraka', statMultiplier: 0.1 }],
  runeIds: [],
  masterySnapshot: {},
  enhancementSnapshot: {},
};

function sourceRuntime(): AuthorityCohortRuntime {
  const verifier = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
  if (!verifier) throw new Error('The current source authority verifier is unavailable.');
  return verifier;
}

describe('authority cohort simulation', () => {
  it('drives an incremental session and terminally verifies every generated trace', () => {
    const source = sourceRuntime();
    const createSession = vi.fn(source.createSession);
    const verify = vi.fn(source.verify);
    const seeds = [0, 1];
    const cohort = simulateAuthorityCohort({
      authority: { ...source, createSession, verify },
      policy: survivalGreedyPolicy,
      scenario: TERMINAL_SCENARIO,
      seeds,
    });

    expect(createSession).toHaveBeenCalledTimes(seeds.length);
    expect(verify).toHaveBeenCalledTimes(seeds.length);
    expect(verify.mock.calls.map((call) => call[2])).toEqual(
      seeds.map(() => ({ requireTerminal: true })),
    );
    expect(cohort).toMatchObject({
      authority: {
        engineVersion: AUTHORITY_ENGINE_VERSION,
        contentHash: AUTHORITY_CONTENT_HASH,
      },
      policy: survivalGreedyPolicy.manifest,
      scenarioId: TERMINAL_SCENARIO.id,
    });
    expect(cohort.runs.map((run) => run.seed)).toEqual(seeds);
    for (const run of cohort.runs) {
      expect(run.trace.length).toBeGreaterThan(0);
      expect(run.result).toMatchObject({
        engineVersion: AUTHORITY_ENGINE_VERSION,
        commandCount: run.trace.length,
        snapshot: { terminal: true },
      });
    }
  });
});
