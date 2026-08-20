import type {
  AuthorityReplayResult,
  AuthorityReplaySession,
  AuthorityRunAttempt,
  AuthorityRunCommand,
  AuthorityVerificationOptions,
  AuthorityVerificationResult,
} from '@/game/authority/types';
import type { BalancePolicy, BalancePolicyManifest, BalanceScenario } from './balancePolicy';

/** The runtime boundary shared by the source verifier and the deployed Edge bundle. */
export interface AuthorityCohortRuntime {
  readonly engineVersion: string;
  readonly contentHash: string;
  createSession(attempt: AuthorityRunAttempt): AuthorityReplaySession;
  verify(
    attempt: AuthorityRunAttempt,
    trace: readonly unknown[],
    options?: AuthorityVerificationOptions,
  ): AuthorityVerificationResult;
}

export interface AuthorityCohortRun {
  readonly seed: number;
  readonly attempt: AuthorityRunAttempt;
  readonly trace: readonly AuthorityRunCommand[];
  readonly result: AuthorityReplayResult;
}

export interface AuthorityCohortResult {
  readonly authority: {
    readonly engineVersion: string;
    readonly contentHash: string;
  };
  readonly policy: BalancePolicyManifest;
  readonly scenarioId: string;
  readonly runs: readonly AuthorityCohortRun[];
}

export interface SimulateAuthorityCohortInput {
  readonly authority: AuthorityCohortRuntime;
  readonly policy: BalancePolicy;
  readonly scenario: BalanceScenario;
  readonly seeds: readonly number[];
}

function requireTerminalVerification(
  authority: AuthorityCohortRuntime,
  attempt: AuthorityRunAttempt,
  trace: readonly AuthorityRunCommand[],
): AuthorityReplayResult {
  const verification = authority.verify(attempt, trace, { requireTerminal: true });
  if (!verification.ok) {
    throw new Error(
      `Authority cohort trace failed terminal verification: ${verification.error.code}: ${verification.error.message}`,
    );
  }
  return verification.result;
}

/**
 * Drives one real authority session per seed through a versioned public-snapshot policy.
 * The completed trace is replayed once more by the selected verifier with terminal
 * verification enabled; callers may select either the source verifier or the current
 * Edge bundle without changing simulation behavior.
 */
export function simulateAuthorityCohort({
  authority,
  policy,
  scenario,
  seeds,
}: SimulateAuthorityCohortInput): AuthorityCohortResult {
  const runs = seeds.map((seed): AuthorityCohortRun => {
    const attempt = policy.buildAttempt({ scenario, seed });
    const session = authority.createSession(attempt);
    const trace: AuthorityRunCommand[] = [];

    while (true) {
      const snapshot = session.getResult().snapshot;
      if (snapshot.terminal) break;

      const next = policy.nextCommand(snapshot);
      if (next === null) break;
      session.append(next);
      trace.push(next);
    }

    return {
      seed,
      attempt,
      trace,
      result: requireTerminalVerification(authority, attempt, trace),
    };
  });

  return {
    authority: {
      engineVersion: authority.engineVersion,
      contentHash: authority.contentHash,
    },
    policy: { ...policy.manifest },
    scenarioId: scenario.id,
    runs,
  };
}
