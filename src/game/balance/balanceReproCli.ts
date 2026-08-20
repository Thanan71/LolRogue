import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  AUTHORITY_CONTENT_HASH,
  AUTHORITY_ENGINE_VERSION,
  getAuthorityVerifier,
} from '@/game/authority';
import { simulateAuthorityCohort } from '@/game/balance/authorityCohort';
import {
  type BalanceScenario,
  SURVIVAL_GREEDY_POLICY_MANIFEST,
  survivalGreedyPolicy,
} from '@/game/balance/balancePolicy';

type AuthorityVerifier = NonNullable<ReturnType<typeof getAuthorityVerifier>>;

function positiveInteger(value: string | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${option} must be a positive safe integer.`);
  }
  return parsed;
}

function requiredSeed(value: string | undefined): number {
  if (value === undefined) throw new Error('--seed is required.');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('--seed must be a safe integer.');
  return parsed;
}

function parseScenario(value: string | undefined): BalanceScenario {
  if (!value) throw new Error('--scenario-json is required.');
  const parsed: unknown = JSON.parse(decodeURIComponent(value));
  if (!parsed || typeof parsed !== 'object' || !('id' in parsed)) {
    throw new Error('--scenario-json must encode a balance scenario object.');
  }
  return parsed as BalanceScenario;
}

async function resolveCurrentEdgeVerifier(): Promise<AuthorityVerifier> {
  const resolverUrl = pathToFileURL(
    resolve(process.cwd(), 'supabase/functions/verify-run/authority-version-resolver.generated.ts'),
  ).href;
  const resolver = (await import(/* @vite-ignore */ resolverUrl)) as {
    resolveAuthorityVerifier(
      engineVersion: string,
      contentHash: string,
    ): Promise<AuthorityVerifier | undefined>;
  };
  const verifier = await resolver.resolveAuthorityVerifier(
    AUTHORITY_ENGINE_VERSION,
    AUTHORITY_CONTENT_HASH,
  );
  if (!verifier) throw new Error('The current Edge authority verifier is unavailable.');
  return verifier;
}

function summarizeCohort(cohort: ReturnType<typeof simulateAuthorityCohort>) {
  const run = cohort.runs[0];
  if (!run) throw new Error('The reproduction cohort did not produce a run.');
  return {
    authority: cohort.authority,
    policy: cohort.policy,
    scenarioId: cohort.scenarioId,
    seed: run.seed,
    terminal: run.result.snapshot.terminal,
    won: run.result.snapshot.won,
    endReason: run.result.snapshot.endReason,
    commandCount: run.result.commandCount,
    combatCount: run.result.combatSummaries.length,
    biomesVisited: run.result.snapshot.biomesVisited,
    totalWavesCompleted: run.result.snapshot.totalWavesCompleted,
  };
}

export async function runBalanceReproductionCli(arguments_: readonly string[]): Promise<void> {
  const { values } = parseArgs({
    args: [...arguments_],
    strict: true,
    options: {
      'scenario-json': { type: 'string' },
      seed: { type: 'string' },
      engine: { type: 'string' },
      'content-hash': { type: 'string' },
      policy: { type: 'string' },
      'max-commands': { type: 'string' },
      'max-run-ms': { type: 'string' },
    },
  });
  const scenario = parseScenario(values['scenario-json']);
  const seed = requiredSeed(values.seed);
  if (values.engine !== undefined && values.engine !== AUTHORITY_ENGINE_VERSION) {
    throw new Error(
      `Reproduction requires authority engine ${values.engine}, but current is ${AUTHORITY_ENGINE_VERSION}.`,
    );
  }
  if (values['content-hash'] !== undefined && values['content-hash'] !== AUTHORITY_CONTENT_HASH) {
    throw new Error(
      `Reproduction requires content hash ${values['content-hash']}, but current is ${AUTHORITY_CONTENT_HASH}.`,
    );
  }
  const expectedPolicy = `${SURVIVAL_GREEDY_POLICY_MANIFEST.id}@${SURVIVAL_GREEDY_POLICY_MANIFEST.version}`;
  if (values.policy !== undefined && values.policy !== expectedPolicy) {
    throw new Error(`Unsupported balance policy ${values.policy}; expected ${expectedPolicy}.`);
  }
  const maxCommands = positiveInteger(values['max-commands'], '--max-commands');
  const maxRunMilliseconds = positiveInteger(values['max-run-ms'], '--max-run-ms');
  const sourceAuthority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
  if (!sourceAuthority) throw new Error('The current source authority verifier is unavailable.');
  const edgeAuthority = await resolveCurrentEdgeVerifier();
  const limits = {
    ...(maxCommands === undefined ? {} : { maxCommands }),
    ...(maxRunMilliseconds === undefined ? {} : { maxRunMilliseconds }),
  };
  const sourceCohort = simulateAuthorityCohort({
    authority: sourceAuthority,
    policy: survivalGreedyPolicy,
    scenario,
    seeds: [seed],
    limits,
  });
  const edgeCohort = simulateAuthorityCohort({
    authority: edgeAuthority,
    policy: survivalGreedyPolicy,
    scenario,
    seeds: [seed],
    limits,
  });
  if (JSON.stringify(sourceCohort) !== JSON.stringify(edgeCohort)) {
    throw new Error('Source and current Edge authority cohorts diverged during reproduction.');
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        sourceEdgeParity: true,
        ...summarizeCohort(sourceCohort),
      },
      null,
      2,
    )}\n`,
  );
}
