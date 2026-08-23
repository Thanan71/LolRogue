import { describe, expect, it, vi } from 'vitest';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  type AuthorityReplayResult,
  type AuthorityRunCommand,
  type AuthorityRunSnapshot,
  type AuthorityVerificationResult,
  getAuthorityVerifier,
} from '@/game/authority';
import {
  type AuthorityCohortRuntime,
  AuthorityCohortSimulationError,
  createBalanceReproductionCommand,
  simulateAuthorityCohort,
} from '@/game/balance/authorityCohort';
import {
  type BalancePolicy,
  BalancePolicyDecisionError,
  type BalanceScenario,
  survivalGreedyPolicy,
} from '@/game/balance/balancePolicy';
import { runBalanceReproductionCli } from '@/game/balance/balanceReproCli';

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

const BASE_ATTEMPT = survivalGreedyPolicy.buildAttempt({
  scenario: TERMINAL_SCENARIO,
  seed: 42,
});
const BASE_RESULT = sourceRuntime().createSession(BASE_ATTEMPT).getResult();

function resultWithSnapshot(
  snapshot: Partial<AuthorityRunSnapshot>,
  result: Partial<AuthorityReplayResult> = {},
): AuthorityReplayResult {
  return {
    ...structuredClone(BASE_RESULT),
    ...result,
    snapshot: {
      ...structuredClone(BASE_RESULT.snapshot),
      ...snapshot,
    },
  };
}

function fakeRuntime(input: {
  initial?: AuthorityReplayResult;
  append?: (result: AuthorityReplayResult, command: AuthorityRunCommand) => AuthorityReplayResult;
  verification?:
    | AuthorityVerificationResult
    | ((result: AuthorityReplayResult) => AuthorityVerificationResult);
  createSessionError?: Error;
}): AuthorityCohortRuntime {
  let latest = structuredClone(input.initial ?? BASE_RESULT);
  return {
    engineVersion: 'test-engine',
    contentHash: 'f'.repeat(64),
    createSession() {
      if (input.createSessionError) throw input.createSessionError;
      return {
        append(command) {
          latest = input.append ? input.append(latest, command as AuthorityRunCommand) : latest;
        },
        getResult() {
          return structuredClone(latest);
        },
      };
    },
    verify() {
      if (typeof input.verification === 'function') return input.verification(latest);
      return input.verification ?? { ok: true, result: structuredClone(latest) };
    },
  };
}

function policyWith(nextCommand: BalancePolicy['nextCommand']): BalancePolicy {
  return { ...survivalGreedyPolicy, nextCommand };
}

function repeatedCommand(snapshot: Readonly<AuthorityRunSnapshot>): AuthorityRunCommand {
  return { sequence: snapshot.nextSequence, kind: 'abandon_run', payload: {} };
}

function captureSimulationError(run: () => unknown): AuthorityCohortSimulationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AuthorityCohortSimulationError);
    return error as AuthorityCohortSimulationError;
  }
  throw new Error('Expected authority cohort simulation to fail.');
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

  it('captures shop affordability and accepted purchase/recruitment commands', () => {
    const initial = resultWithSnapshot({
      currentNodeId: 'shop-1',
      expectedNodeIds: [],
      gold: 100,
      pendingEncounter: {
        nodeId: 'shop-1',
        nodeType: 'shop',
        encounterId: 'top-shop',
        claimed: false,
        itemOffers: [
          { itemId: 'long_sword', cost: 80, consumed: false, legal: true },
          { itemId: 'infinity_edge', cost: 50, consumed: false, legal: false },
        ],
        recruitOffers: [
          { championId: 'Lux', cost: 20, consumed: false, legal: true },
          { championId: 'Ashe', cost: 10, consumed: false, legal: false },
        ],
      },
    });
    const runtime = fakeRuntime({
      initial,
      append(result, command) {
        const snapshot = result.snapshot;
        if (command.kind === 'shop_buy_item') {
          if (snapshot.pendingEncounter?.nodeType !== 'shop') throw new Error('shop missing');
          return resultWithSnapshot({
            ...snapshot,
            gold: 20,
            nextSequence: snapshot.nextSequence + 1,
            pendingEncounter: {
              ...snapshot.pendingEncounter,
              itemOffers: snapshot.pendingEncounter.itemOffers.map((offer) =>
                offer.itemId === command.payload.item_id
                  ? { ...offer, consumed: true, legal: false }
                  : offer,
              ),
            },
          });
        }
        if (command.kind === 'shop_recruit') {
          if (snapshot.pendingEncounter?.nodeType !== 'shop') throw new Error('shop missing');
          return resultWithSnapshot({
            ...snapshot,
            gold: 0,
            nextSequence: snapshot.nextSequence + 1,
            team: [
              ...snapshot.team,
              { ...snapshot.team[0]!, championId: command.payload.champion_id },
            ],
            pendingEncounter: {
              ...snapshot.pendingEncounter,
              recruitOffers: snapshot.pendingEncounter.recruitOffers.map((offer) =>
                offer.championId === command.payload.champion_id
                  ? { ...offer, consumed: true, legal: false }
                  : offer,
              ),
            },
          });
        }
        return resultWithSnapshot({
          ...snapshot,
          terminal: true,
          endReason: 'defeat',
          pendingEncounter: null,
          pendingNodeType: null,
          nextSequence: snapshot.nextSequence + 1,
        });
      },
    });
    const policy = policyWith((snapshot): AuthorityRunCommand => {
      const shop = snapshot.pendingEncounter;
      if (shop?.nodeType === 'shop') {
        if (!shop.itemOffers.find((offer) => offer.itemId === 'long_sword')?.consumed) {
          return {
            sequence: snapshot.nextSequence,
            kind: 'shop_buy_item',
            payload: { node_id: shop.nodeId, item_id: 'long_sword' },
          };
        }
        if (!shop.recruitOffers.find((offer) => offer.championId === 'Lux')?.consumed) {
          return {
            sequence: snapshot.nextSequence,
            kind: 'shop_recruit',
            payload: { node_id: shop.nodeId, champion_id: 'Lux' },
          };
        }
      }
      return { sequence: snapshot.nextSequence, kind: 'abandon_run', payload: {} };
    });

    const cohort = simulateAuthorityCohort({
      authority: runtime,
      policy,
      scenario: TERMINAL_SCENARIO,
      seeds: [109],
    });

    expect(cohort.runs[0]?.observations).toEqual({
      shopVisits: [
        {
          commandIndex: 0,
          nodeId: 'shop-1',
          encounterId: 'top-shop',
          biome: initial.snapshot.currentBiome,
          goldOnEntry: 100,
          itemOffers: [
            { id: 'long_sword', cost: 80, legal: true, affordable: true },
            { id: 'infinity_edge', cost: 50, legal: false, affordable: false },
          ],
          recruitOffers: [
            { id: 'Lux', cost: 20, legal: true, affordable: true },
            { id: 'Ashe', cost: 10, legal: false, affordable: false },
          ],
        },
      ],
      purchases: [
        {
          commandIndex: 0,
          nodeId: 'shop-1',
          itemId: 'long_sword',
          offeredCost: 80,
          goldSpent: 80,
          completed: true,
        },
      ],
      recruitments: [
        {
          commandIndex: 1,
          nodeId: 'shop-1',
          encounterId: 'top-shop',
          championId: 'Lux',
          source: 'shop',
          offeredCost: 20,
          goldSpent: 20,
          succeeded: true,
        },
      ],
    });
  });

  it('rejects invalid safety-limit configuration before starting a cohort', () => {
    expect(() =>
      simulateAuthorityCohort({
        authority: sourceRuntime(),
        policy: survivalGreedyPolicy,
        scenario: TERMINAL_SCENARIO,
        seeds: [0],
        limits: { maxCommands: 0 },
      }),
    ).toThrow('maxCommands must be a positive safe integer');
  });

  it('stops at the command budget and retains only the diagnostic tail', () => {
    const runtime = fakeRuntime({
      append(result) {
        return resultWithSnapshot({
          ...result.snapshot,
          currentWave: result.snapshot.currentWave + 1,
          nextSequence: result.snapshot.nextSequence + 1,
        });
      },
    });
    const error = captureSimulationError(() =>
      simulateAuthorityCohort({
        authority: runtime,
        policy: policyWith(repeatedCommand),
        scenario: TERMINAL_SCENARIO,
        seeds: [101],
        limits: { maxCommands: 3, diagnosticCommandCount: 2 },
      }),
    );

    expect(error).toMatchObject({
      code: 'command_limit',
      cellId: TERMINAL_SCENARIO.id,
      seed: 101,
    });
    expect(error.lastSnapshot).toMatchObject({ currentWave: BASE_RESULT.snapshot.currentWave + 3 });
    expect(error.recentCommands).toHaveLength(2);
    expect(error.reproductionCommand).toContain('npm run balance:repro');
    expect(error.reproductionCommand).toContain('--seed 101');
    expect(error.reproductionCommand).toContain("--engine 'test-engine'");
    expect(error.reproductionCommand).toContain(`--content-hash '${'f'.repeat(64)}'`);
    expect(error.reproductionCommand).toContain('--max-commands 3');
    expect(error.reproductionCommand).toContain("--policy 'survival-greedy@1'");
  });

  it('detects a repeated decision from the same semantic state', () => {
    const runtime = fakeRuntime({
      append(result) {
        return resultWithSnapshot({
          ...result.snapshot,
          nextSequence: result.snapshot.nextSequence + 1,
        });
      },
    });
    const error = captureSimulationError(() =>
      simulateAuthorityCohort({
        authority: runtime,
        policy: policyWith(repeatedCommand),
        scenario: TERMINAL_SCENARIO,
        seeds: [102],
      }),
    );

    expect(error.code).toBe('deadlock');
    expect(error.recentCommands).toHaveLength(2);
    expect(error.recentCommands.map((command) => command.sequence)).toEqual([
      BASE_RESULT.snapshot.nextSequence,
      BASE_RESULT.snapshot.nextSequence + 1,
    ]);
  });

  it('fails when a policy stops before the run is terminal', () => {
    const error = captureSimulationError(() =>
      simulateAuthorityCohort({
        authority: fakeRuntime({}),
        policy: policyWith(() => null),
        scenario: TERMINAL_SCENARIO,
        seeds: [103],
      }),
    );

    expect(error).toMatchObject({ code: 'policy_stopped', seed: 103 });
    expect(error.lastSnapshot).toMatchObject({ terminal: false });
  });

  it('checks the wall-clock budget around every command', () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(5_001);
    const error = captureSimulationError(() =>
      simulateAuthorityCohort({
        authority: fakeRuntime({
          append(result) {
            return resultWithSnapshot({
              ...result.snapshot,
              currentWave: result.snapshot.currentWave + 1,
              nextSequence: result.snapshot.nextSequence + 1,
            });
          },
        }),
        policy: policyWith(repeatedCommand),
        scenario: TERMINAL_SCENARIO,
        seeds: [104],
        now,
      }),
    );

    expect(error).toMatchObject({ code: 'time_limit', seed: 104 });
    expect(error.recentCommands).toHaveLength(1);
  });

  it('surfaces terminal verification failures with reproduction context', () => {
    const error = captureSimulationError(() =>
      simulateAuthorityCohort({
        authority: fakeRuntime({
          initial: resultWithSnapshot({ terminal: true, endReason: 'defeat' }),
          verification: {
            ok: false,
            error: { code: 'run_not_terminal', message: 'not terminal', commandIndex: null },
          },
        }),
        policy: policyWith(repeatedCommand),
        scenario: TERMINAL_SCENARIO,
        seeds: [105],
      }),
    );

    expect(error).toMatchObject({ code: 'terminal_verification_failed', seed: 105 });
    expect(error.message).toContain('run_not_terminal');
  });

  it('rejects divergence between the incremental session and terminal replay', () => {
    const terminalResult = resultWithSnapshot({ terminal: true, endReason: 'defeat' });
    const error = captureSimulationError(() =>
      simulateAuthorityCohort({
        authority: fakeRuntime({
          initial: terminalResult,
          verification: {
            ok: true,
            result: { ...structuredClone(terminalResult), commandCount: 99 },
          },
        }),
        policy: policyWith(repeatedCommand),
        scenario: TERMINAL_SCENARIO,
        seeds: [106],
      }),
    );

    expect(error).toMatchObject({ code: 'incremental_divergence', seed: 106 });
  });

  it('wraps authority exceptions without losing the original cause', () => {
    const cause = new Error('session exploded');
    const error = captureSimulationError(() =>
      simulateAuthorityCohort({
        authority: fakeRuntime({ createSessionError: cause }),
        policy: policyWith(repeatedCommand),
        scenario: TERMINAL_SCENARIO,
        seeds: [107],
      }),
    );

    expect(error).toMatchObject({ code: 'authority_error', seed: 107, cause });
  });

  it('distinguishes policy decision failures from authority exceptions', () => {
    const cause = new BalancePolicyDecisionError('no_legal_command', 'policy is stuck');
    const error = captureSimulationError(() =>
      simulateAuthorityCohort({
        authority: fakeRuntime({}),
        policy: policyWith(() => {
          throw cause;
        }),
        scenario: TERMINAL_SCENARIO,
        seeds: [108],
      }),
    );

    expect(error).toMatchObject({ code: 'policy_error', seed: 108, cause });
  });

  it('encodes the complete scenario in a shell-safe reproduction command', () => {
    const scenario = { ...TERMINAL_SCENARIO, id: "cell-with-'quote" };
    const command = createBalanceReproductionCommand(scenario, -12, {
      engineVersion: AUTHORITY_ENGINE_VERSION,
      contentHash: AUTHORITY_CONTENT_HASH,
    });
    const encodedScenario = command.match(/--scenario-json '([^']+)'/)?.[1];

    expect(encodedScenario).toBeDefined();
    expect(JSON.parse(decodeURIComponent(encodedScenario ?? ''))).toEqual(scenario);
    expect(command).toContain('--seed -12');
    expect(command).toContain(`--content-hash '${AUTHORITY_CONTENT_HASH}'`);
  });

  it('reproduces a seed against both source and the current Edge bundle', async () => {
    let rendered = '';
    const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      rendered += String(chunk);
      return true;
    });
    try {
      await runBalanceReproductionCli([
        '--scenario-json',
        encodeURIComponent(JSON.stringify(TERMINAL_SCENARIO)),
        '--seed',
        '0',
      ]);
    } finally {
      output.mockRestore();
    }

    const report = JSON.parse(rendered);
    expect(report).toMatchObject({
      sourceEdgeParity: true,
      authority: {
        engineVersion: AUTHORITY_ENGINE_VERSION,
        contentHash: AUTHORITY_CONTENT_HASH,
      },
      policy: survivalGreedyPolicy.manifest,
      scenarioId: TERMINAL_SCENARIO.id,
      seed: 0,
      terminal: true,
    });
  });
});
