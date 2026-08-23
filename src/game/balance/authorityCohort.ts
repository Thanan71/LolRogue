import type {
  AuthorityReplayResult,
  AuthorityReplaySession,
  AuthorityRunAttempt,
  AuthorityRunCommand,
  AuthorityRunSnapshot,
  AuthorityVerificationOptions,
  AuthorityVerificationResult,
} from '@/game/authority/types';
import {
  type BalancePolicy,
  BalancePolicyDecisionError,
  type BalancePolicyManifest,
  type BalanceScenario,
  SURVIVAL_GREEDY_POLICY_MANIFEST,
} from './balancePolicy';
import {
  type AuthorityCohortCell,
  type AuthorityCohortStratum,
  createAuthorityCohortStratum,
} from './authorityCohortMatrix';

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
  readonly observations: AuthorityCohortRunObservations;
}

export interface AuthorityCohortShopOfferObservation {
  readonly id: string;
  readonly cost: number;
  readonly legal: boolean;
  readonly affordable: boolean;
}

export interface AuthorityCohortShopVisitObservation {
  readonly commandIndex: number;
  readonly nodeId: string;
  readonly encounterId: string;
  readonly biome: AuthorityRunSnapshot['currentBiome'];
  readonly goldOnEntry: number;
  readonly itemOffers: readonly AuthorityCohortShopOfferObservation[];
  readonly recruitOffers: readonly AuthorityCohortShopOfferObservation[];
}

export interface AuthorityCohortPurchaseObservation {
  readonly commandIndex: number;
  readonly nodeId: string;
  readonly itemId: string;
  readonly offeredCost: number | null;
  readonly goldSpent: number;
  readonly completed: boolean;
}

export interface AuthorityCohortRecruitmentObservation {
  readonly commandIndex: number;
  readonly nodeId: string;
  readonly encounterId: string | null;
  readonly championId: string;
  readonly source: 'shop' | 'encounter' | 'event';
  readonly offeredCost: number | null;
  readonly goldSpent: number;
  readonly succeeded: boolean;
}

export interface AuthorityCohortRunObservations {
  readonly shopVisits: readonly AuthorityCohortShopVisitObservation[];
  readonly purchases: readonly AuthorityCohortPurchaseObservation[];
  readonly recruitments: readonly AuthorityCohortRecruitmentObservation[];
}

export interface AuthorityCohortResult {
  readonly authority: {
    readonly engineVersion: string;
    readonly contentHash: string;
  };
  readonly policy: BalancePolicyManifest;
  readonly scenarioId: string;
  readonly stratum: AuthorityCohortStratum;
  readonly runs: readonly AuthorityCohortRun[];
}

export interface SimulateAuthorityCohortInput {
  readonly authority: AuthorityCohortRuntime;
  readonly policy: BalancePolicy;
  readonly scenario: BalanceScenario;
  readonly seeds: readonly number[];
  readonly limits?: Partial<AuthorityCohortSafetyLimits>;
  readonly now?: () => number;
}

export interface SimulateAuthorityCohortMatrixInput {
  readonly authority: AuthorityCohortRuntime;
  readonly cells: readonly AuthorityCohortCell[];
  /** The same seeds are replayed in every cell to keep comparisons paired. */
  readonly seeds: readonly number[];
  readonly limits?: Partial<AuthorityCohortSafetyLimits>;
  readonly now?: () => number;
}

export interface AuthorityCohortMatrixResult {
  readonly cohorts: readonly AuthorityCohortResult[];
}

export interface GateAuthorityCohortDeterminismInput
  extends Omit<SimulateAuthorityCohortMatrixInput, 'authority'> {
  readonly sourceAuthority: AuthorityCohortRuntime;
  readonly edgeAuthority: AuthorityCohortRuntime;
}

export interface AuthorityCohortSafetyLimits {
  readonly maxCommands: number;
  /** Cooperative deadline checked before and after each synchronous policy/authority call. */
  readonly maxRunMilliseconds: number;
  readonly diagnosticCommandCount: number;
}

export const DEFAULT_AUTHORITY_COHORT_SAFETY_LIMITS = Object.freeze({
  maxCommands: 400,
  maxRunMilliseconds: 5_000,
  diagnosticCommandCount: 20,
}) satisfies AuthorityCohortSafetyLimits;

export type AuthorityCohortFailureCode =
  | 'authority_error'
  | 'command_limit'
  | 'deadlock'
  | 'incremental_divergence'
  | 'policy_error'
  | 'policy_stopped'
  | 'terminal_verification_failed'
  | 'time_limit';

export interface AuthorityCohortFailureContext {
  readonly code: AuthorityCohortFailureCode;
  readonly cellId: string;
  readonly seed: number;
  readonly lastSnapshot: AuthorityRunSnapshot | null;
  readonly recentCommands: readonly AuthorityRunCommand[];
  readonly reproductionCommand: string;
}

export class AuthorityCohortSimulationError extends Error {
  readonly code: AuthorityCohortFailureCode;
  readonly cellId: string;
  readonly seed: number;
  readonly lastSnapshot: AuthorityRunSnapshot | null;
  readonly recentCommands: readonly AuthorityRunCommand[];
  readonly reproductionCommand: string;
  readonly cause?: unknown;

  constructor(
    message: string,
    context: AuthorityCohortFailureContext,
    options: { cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'AuthorityCohortSimulationError';
    this.code = context.code;
    this.cellId = context.cellId;
    this.seed = context.seed;
    this.lastSnapshot = context.lastSnapshot;
    this.recentCommands = context.recentCommands;
    this.reproductionCommand = context.reproductionCommand;
    this.cause = options.cause;
  }
}

function shellQuote(value: string): string {
  return `'${value.split("'").join(`'"'"'`)}'`;
}

export function createBalanceReproductionCommand(
  scenario: BalanceScenario,
  seed: number,
  authority: Pick<AuthorityCohortRuntime, 'engineVersion' | 'contentHash'>,
  limits: AuthorityCohortSafetyLimits = DEFAULT_AUTHORITY_COHORT_SAFETY_LIMITS,
  policy: BalancePolicyManifest = SURVIVAL_GREEDY_POLICY_MANIFEST,
): string {
  const encodedScenario = encodeURIComponent(JSON.stringify(scenario)).split("'").join('%27');
  return [
    'npm run balance:repro --',
    `--scenario-json ${shellQuote(encodedScenario)}`,
    `--seed ${seed}`,
    `--engine ${shellQuote(authority.engineVersion)}`,
    `--content-hash ${shellQuote(authority.contentHash)}`,
    `--policy ${shellQuote(`${policy.id}@${policy.version}`)}`,
    `--max-commands ${limits.maxCommands}`,
    `--max-run-ms ${limits.maxRunMilliseconds}`,
  ].join(' ');
}

function resolveSafetyLimits(
  overrides: Partial<AuthorityCohortSafetyLimits> | undefined,
): AuthorityCohortSafetyLimits {
  const limits = { ...DEFAULT_AUTHORITY_COHORT_SAFETY_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive safe integer.`);
    }
  }
  return limits;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function decisionFingerprint(snapshot: AuthorityRunSnapshot, next: AuthorityRunCommand): string {
  const { nextSequence: _nextSequence, ...semanticSnapshot } = snapshot;
  const { sequence: _sequence, ...semanticCommand } = next;
  return stableSerialize([semanticSnapshot, semanticCommand]);
}

function captureShopVisit(
  snapshot: AuthorityRunSnapshot,
  commandIndex: number,
): AuthorityCohortShopVisitObservation | null {
  const pending = snapshot.pendingEncounter;
  if (!pending || pending.nodeType !== 'shop') return null;
  return {
    commandIndex,
    nodeId: pending.nodeId,
    encounterId: pending.encounterId,
    biome: snapshot.currentBiome,
    goldOnEntry: snapshot.gold,
    itemOffers: pending.itemOffers.map((offer) => ({
      id: offer.itemId,
      cost: offer.cost,
      legal: offer.legal,
      affordable: !offer.consumed && offer.legal && offer.cost <= snapshot.gold,
    })),
    recruitOffers: pending.recruitOffers.map((offer) => ({
      id: offer.championId,
      cost: offer.cost,
      legal: offer.legal,
      affordable: !offer.consumed && offer.legal && offer.cost <= snapshot.gold,
    })),
  };
}

function newlyAddedChampionIds(
  before: AuthorityRunSnapshot,
  after: AuthorityRunSnapshot,
): string[] {
  const previous = new Set(before.team.map((member) => member.championId));
  return after.team
    .map((member) => member.championId)
    .filter((championId) => !previous.has(championId));
}

function captureAcceptedCommandObservations(input: {
  command: AuthorityRunCommand;
  commandIndex: number;
  before: AuthorityRunSnapshot;
  after: AuthorityRunSnapshot;
  purchases: AuthorityCohortPurchaseObservation[];
  recruitments: AuthorityCohortRecruitmentObservation[];
}): void {
  const { command, commandIndex, before, after, purchases, recruitments } = input;
  const pending = before.pendingEncounter;
  const goldSpent = Math.max(0, before.gold - after.gold);

  if (command.kind === 'shop_buy_item') {
    const beforeShop = pending?.nodeType === 'shop' ? pending : null;
    const afterShop = after.pendingEncounter?.nodeType === 'shop' ? after.pendingEncounter : null;
    purchases.push({
      commandIndex,
      nodeId: command.payload.node_id,
      itemId: command.payload.item_id,
      offeredCost:
        beforeShop?.itemOffers.find((offer) => offer.itemId === command.payload.item_id)?.cost ??
        null,
      goldSpent,
      completed:
        after.inventory.some((entry) => entry.item.id === command.payload.item_id) ||
        afterShop?.itemOffers.some(
          (offer) => offer.itemId === command.payload.item_id && offer.consumed,
        ) === true,
    });
    return;
  }

  if (command.kind === 'shop_recruit') {
    const beforeShop = pending?.nodeType === 'shop' ? pending : null;
    recruitments.push({
      commandIndex,
      nodeId: command.payload.node_id,
      encounterId: beforeShop?.encounterId ?? null,
      championId: command.payload.champion_id,
      source: 'shop',
      offeredCost:
        beforeShop?.recruitOffers.find((offer) => offer.championId === command.payload.champion_id)
          ?.cost ?? null,
      goldSpent,
      succeeded: newlyAddedChampionIds(before, after).includes(command.payload.champion_id),
    });
    return;
  }

  if (command.kind === 'recruit') {
    const beforeRecruit = pending?.nodeType === 'recruit' ? pending : null;
    recruitments.push({
      commandIndex,
      nodeId: command.payload.node_id,
      encounterId: beforeRecruit?.encounterId ?? null,
      championId: beforeRecruit?.championId ?? 'unknown',
      source: 'encounter',
      offeredCost: beforeRecruit?.cost ?? null,
      goldSpent,
      succeeded:
        beforeRecruit !== null &&
        newlyAddedChampionIds(before, after).includes(beforeRecruit.championId),
    });
    return;
  }

  if (command.kind === 'event') {
    for (const championId of newlyAddedChampionIds(before, after)) {
      recruitments.push({
        commandIndex,
        nodeId: command.payload.node_id,
        encounterId: pending?.nodeType === 'event' ? pending.encounterId : null,
        championId,
        source: 'event',
        offeredCost: null,
        goldSpent,
        succeeded: true,
      });
    }
  }
}

function failSimulation(input: {
  code: AuthorityCohortFailureCode;
  message: string;
  scenario: BalanceScenario;
  seed: number;
  lastSnapshot: AuthorityRunSnapshot | null;
  trace: readonly AuthorityRunCommand[];
  limits: AuthorityCohortSafetyLimits;
  policy: BalancePolicyManifest;
  authority: Pick<AuthorityCohortRuntime, 'engineVersion' | 'contentHash'>;
  cause?: unknown;
}): never {
  const recentCommands = structuredClone(input.trace.slice(-input.limits.diagnosticCommandCount));
  throw new AuthorityCohortSimulationError(
    input.message,
    {
      code: input.code,
      cellId: input.scenario.id,
      seed: input.seed,
      lastSnapshot: input.lastSnapshot ? structuredClone(input.lastSnapshot) : null,
      recentCommands,
      reproductionCommand: createBalanceReproductionCommand(
        input.scenario,
        input.seed,
        input.authority,
        input.limits,
        input.policy,
      ),
    },
    { cause: input.cause },
  );
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
  limits: limitOverrides,
  now = () => performance.now(),
}: SimulateAuthorityCohortInput): AuthorityCohortResult {
  const limits = resolveSafetyLimits(limitOverrides);
  const stratum = createAuthorityCohortStratum(scenario, policy.manifest);
  const runs = seeds.map((seed): AuthorityCohortRun => {
    const trace: AuthorityRunCommand[] = [];
    const shopVisits: AuthorityCohortShopVisitObservation[] = [];
    const purchases: AuthorityCohortPurchaseObservation[] = [];
    const recruitments: AuthorityCohortRecruitmentObservation[] = [];
    const visitedShopNodeIds = new Set<string>();
    let lastSnapshot: AuthorityRunSnapshot | null = null;
    let startedAt = 0;

    const assertWithinDeadline = () => {
      const elapsed = now() - startedAt;
      if (!Number.isFinite(elapsed) || elapsed > limits.maxRunMilliseconds) {
        failSimulation({
          code: 'time_limit',
          message: `Authority cohort run exceeded ${limits.maxRunMilliseconds} ms.`,
          scenario,
          seed,
          lastSnapshot,
          trace,
          limits,
          policy: policy.manifest,
          authority,
        });
      }
    };

    try {
      startedAt = now();
      const attempt = policy.buildAttempt({ scenario, seed });
      const session = authority.createSession(attempt);
      const seenDecisions = new Set<string>();

      while (true) {
        lastSnapshot = session.getResult().snapshot;
        if (lastSnapshot.terminal) break;
        assertWithinDeadline();
        if (!visitedShopNodeIds.has(lastSnapshot.currentNodeId ?? '')) {
          const visit = captureShopVisit(lastSnapshot, trace.length);
          if (visit) {
            visitedShopNodeIds.add(visit.nodeId);
            shopVisits.push(visit);
          }
        }
        if (trace.length >= limits.maxCommands) {
          failSimulation({
            code: 'command_limit',
            message: `Authority cohort run reached ${limits.maxCommands} commands before becoming terminal.`,
            scenario,
            seed,
            lastSnapshot,
            trace,
            limits,
            policy: policy.manifest,
            authority,
          });
        }

        const commandIndex = trace.length;
        const beforeCommand = lastSnapshot;
        const next = policy.nextCommand(beforeCommand);
        if (next === null) {
          failSimulation({
            code: 'policy_stopped',
            message: 'Balance policy returned null before the authority run became terminal.',
            scenario,
            seed,
            lastSnapshot,
            trace,
            limits,
            policy: policy.manifest,
            authority,
          });
        }
        const fingerprint = decisionFingerprint(lastSnapshot, next);
        if (seenDecisions.has(fingerprint)) {
          failSimulation({
            code: 'deadlock',
            message: 'Balance policy repeated the same command from an unchanged semantic state.',
            scenario,
            seed,
            lastSnapshot,
            trace: [...trace, next],
            limits,
            policy: policy.manifest,
            authority,
          });
        }
        seenDecisions.add(fingerprint);
        trace.push(next);
        session.append(next);
        lastSnapshot = session.getResult().snapshot;
        captureAcceptedCommandObservations({
          command: next,
          commandIndex,
          before: beforeCommand,
          after: lastSnapshot,
          purchases,
          recruitments,
        });
        assertWithinDeadline();
      }

      assertWithinDeadline();
      const verification = authority.verify(attempt, trace, { requireTerminal: true });
      assertWithinDeadline();
      if (!verification.ok) {
        failSimulation({
          code: 'terminal_verification_failed',
          message: `Authority cohort trace failed terminal verification: ${verification.error.code}: ${verification.error.message}`,
          scenario,
          seed,
          lastSnapshot,
          trace,
          limits,
          policy: policy.manifest,
          authority,
        });
      }
      const incrementalResult = session.getResult();
      if (stableSerialize(incrementalResult) !== stableSerialize(verification.result)) {
        failSimulation({
          code: 'incremental_divergence',
          message: 'Incremental authority result diverged from terminal replay verification.',
          scenario,
          seed,
          lastSnapshot,
          trace,
          limits,
          policy: policy.manifest,
          authority,
        });
      }

      return {
        seed,
        attempt,
        trace,
        result: verification.result,
        observations: {
          shopVisits,
          purchases,
          recruitments,
        },
      };
    } catch (error) {
      if (error instanceof AuthorityCohortSimulationError) throw error;
      failSimulation({
        code: error instanceof BalancePolicyDecisionError ? 'policy_error' : 'authority_error',
        message: error instanceof Error ? error.message : 'Unknown authority cohort failure.',
        scenario,
        seed,
        lastSnapshot,
        trace,
        limits,
        policy: policy.manifest,
        authority,
        cause: error,
      });
    }
  });

  return {
    authority: {
      engineVersion: authority.engineVersion,
      contentHash: authority.contentHash,
    },
    policy: { ...policy.manifest },
    scenarioId: scenario.id,
    stratum,
    runs,
  };
}

/** Runs a paired seed set independently for every pre-stratified matrix cell. */
export function simulateAuthorityCohortMatrix({
  authority,
  cells,
  seeds,
  limits,
  now,
}: SimulateAuthorityCohortMatrixInput): AuthorityCohortMatrixResult {
  return {
    cohorts: cells.map((cell) => {
      const cohort = simulateAuthorityCohort({
        authority,
        policy: cell.policy,
        scenario: cell.scenario,
        seeds,
        limits,
        now,
      });
      if (cohort.stratum.fingerprint !== cell.stratum.fingerprint) {
        throw new Error(`Authority cohort cell "${cell.id}" changed after matrix creation.`);
      }
      return cohort;
    }),
  };
}

function assertMatchingCohortMatrices(
  expected: AuthorityCohortMatrixResult,
  actual: AuthorityCohortMatrixResult,
  comparison: 'source replay' | 'source / Edge bundle',
): void {
  if (stableSerialize(expected) === stableSerialize(actual)) return;

  const mismatchedIndex = expected.cohorts.findIndex(
    (cohort, index) => stableSerialize(cohort) !== stableSerialize(actual.cohorts[index]),
  );
  const expectedCohort = expected.cohorts[mismatchedIndex];
  const actualCohort = actual.cohorts[mismatchedIndex];
  const mismatchedRunIndex = expectedCohort?.runs.findIndex(
    (run, index) => stableSerialize(run) !== stableSerialize(actualCohort?.runs[index]),
  );
  const seed =
    mismatchedRunIndex !== undefined && mismatchedRunIndex >= 0
      ? expectedCohort?.runs[mismatchedRunIndex]?.seed
      : undefined;
  const location = expectedCohort
    ? ` in cell "${expectedCohort.scenarioId}"${seed === undefined ? '' : ` for seed ${seed}`}`
    : '';
  throw new Error(`Authority cohort ${comparison} divergence${location}.`);
}

/**
 * Initial balance safety gate: every paired cell/seed is executed twice by the source
 * authority and once by the current Edge runtime. Cohort simulation already turns
 * crashes, deadlines, deadlocks and incremental replay drift into hard failures; the
 * exact matrix comparison additionally rejects nondeterminism and stale Edge bundles.
 */
export function gateAuthorityCohortDeterminism({
  sourceAuthority,
  edgeAuthority,
  cells,
  seeds,
  limits,
  now,
}: GateAuthorityCohortDeterminismInput): AuthorityCohortMatrixResult {
  const input = { cells, seeds, limits, now };
  const firstSource = simulateAuthorityCohortMatrix({ authority: sourceAuthority, ...input });
  const secondSource = simulateAuthorityCohortMatrix({ authority: sourceAuthority, ...input });
  assertMatchingCohortMatrices(firstSource, secondSource, 'source replay');

  const edge = simulateAuthorityCohortMatrix({ authority: edgeAuthority, ...input });
  assertMatchingCohortMatrices(firstSource, edge, 'source / Edge bundle');
  return firstSource;
}
