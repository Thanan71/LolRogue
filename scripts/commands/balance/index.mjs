import { existsSync } from 'node:fs';
import path from 'node:path';
import { commandCatalog } from '../../lib/command-catalog.mjs';
import { targetPlan, toolCommand } from '../../lib/command-runner.mjs';

const balanceTests = [
  'contentCatalogAnalysis',
  'contentBalance',
  'economyBalance',
  'economyBalanceRuleset',
  'earlyTopRuleset',
  'combatBalanceRuleset',
  'championCombatMatrix',
  'mapEconomyBaseline',
  'mapEconomyRuleset',
  'mapEconomyAffordability',
  'balancePolicy',
  'authorityCohort',
  'authorityCohortMatrix',
  'authorityCohortReport',
  'authorityCohortBaseline',
  'authorityCohortProfiles',
  'authorityCohortExecution',
  'authorityCohortDeterminism',
  'authorityCohortAcceptance',
  'authorityCohortExecutionCli',
  'authorityFieldCalibrationBaseline',
  'fieldCalibrationComparison',
  'fieldCalibrationIsolation',
  'authorityCombatIntegrityParity',
  'p0BalanceRuleset',
  'starterBudget',
  'runeAssignment',
  'earlyTopCohort',
  'earlyTopAcceptance',
  'earlyTopAffordability',
  'earlyTopStarterSurvivability',
].map((name) => `tests/${name}.test.ts`);

export function publishedEngines(command, context) {
  return context.registry.versions
    .map((entry) => entry.engine.replace('run-engine-', ''))
    .filter((engine) => !command.supportedEngines || command.supportedEngines.includes(engine))
    .filter((engine) =>
      existsSync(path.join(context.root, 'config', `${command.artifact}-${engine}.json`)),
    );
}

export function buildBalancePlan(command, options, context) {
  if (options.check && options.output)
    throw Object.assign(new Error('--check and --output are mutually exclusive.'), {
      code: 'CLI_OPTION_CONFLICT',
    });
  if (
    options['baseline-engine'] &&
    !context.registry.versions.some((entry) => entry.engine === options['baseline-engine'])
  ) {
    throw Object.assign(
      new Error('Unknown baseline authority; use a full registered engine identity.'),
      { code: 'CLI_ENGINE_UNKNOWN' },
    );
  }
  if (command.path[0] === 'repro' && options.engine) {
    const engine = options.engine.startsWith('run-engine-')
      ? options.engine
      : `run-engine-${options.engine}`;
    if (engine !== `run-engine-${context.currentEngine}`)
      throw Object.assign(
        new Error(
          `Reproduction supports only the current authority run-engine-${context.currentEngine}.`,
        ),
        { code: 'CLI_ENGINE_UNSUPPORTED' },
      );
    options = { ...options, engine };
  }
  if (command.target.kind === 'balance-artifacts' || command.target.kind === 'balance-check') {
    const checks = [
      'baseline check',
      'early-top check',
      'combat matrix check',
      'map-economy check',
      'field-baseline check',
      'veigar check',
    ];
    const plan = checks.flatMap((name) => {
      const entry = commandCatalog.find(
        (candidate) => candidate.group === 'balance' && candidate.path.join(' ') === name,
      );
      if (!entry) throw new Error(`Missing balance command ${name}.`);
      return buildBalancePlan(entry, entry.options.all ? { all: true } : {}, context);
    });
    if (command.target.kind === 'balance-check')
      plan.push(
        toolCommand(context.root, 'vitest', ['run', '--no-file-parallelism', ...balanceTests]),
      );
    return plan;
  }
  if (options.all && options.engine)
    throw Object.assign(new Error('--all and --engine are mutually exclusive.'), {
      code: 'CLI_OPTION_CONFLICT',
    });
  if (command.options.engine && command.path[0] !== 'repro') {
    const engines = options.all
      ? publishedEngines(command, context)
      : [(options.engine ?? context.currentEngine).replace(/^run-engine-/, '')];
    if (!engines.length)
      throw Object.assign(new Error(`No published ${command.artifact} artifacts are registered.`), {
        code: 'CLI_ARTIFACT_MISSING',
      });
    for (const engine of engines) {
      if (!context.registry.versions.some((entry) => entry.engine === `run-engine-${engine}`)) {
        throw Object.assign(
          new Error('Unknown authority engine. Use a registered version such as v22 or 0.2.0.'),
          { code: 'CLI_ENGINE_UNKNOWN' },
        );
      }
      if (command.supportedEngines && !command.supportedEngines.includes(engine)) {
        throw Object.assign(
          new Error(
            `${command.path.join(' ')} does not support current/selected engine ${engine}. Choose --engine ${command.supportedEngines.join(' or --engine ')} explicitly.`,
          ),
          { code: 'CLI_ENGINE_UNSUPPORTED' },
        );
      }
    }
    return engines.flatMap((engine) =>
      targetPlan(command.target, context, [
        '--engine',
        engine,
        ...(options.check ? ['--check'] : []),
        ...(options.output ? ['--output', options.output] : []),
      ]),
    );
  }
  const forwarded = Object.entries(options).flatMap(([key, value]) =>
    value === false ? [] : value === true ? [`--${key}`] : [`--${key}`, String(value)],
  );
  return targetPlan(command.target, context, forwarded);
}
