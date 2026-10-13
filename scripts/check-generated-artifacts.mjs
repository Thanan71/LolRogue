import { describeArgument, isDirectExecution, requireNode24 } from './lib/critical-command.mjs';
import { checkGeneratedArtifacts } from './lib/generated-artifacts.mjs';

export async function runGeneratedArtifactCheck(argv = process.argv.slice(2), dependencies = {}) {
  const {
    stdout = process.stdout,
    assertNode = requireNode24,
    check = checkGeneratedArtifacts,
  } = dependencies;
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    stdout.write(
      'Usage: npm run release -- artifacts check\nChecks generated artefacts in memory, without writing or downloading files.\n',
    );
    return;
  }
  if (argv.length) throw new Error(`Unknown artifact check option: ${describeArgument(argv[0])}`);
  assertNode();
  const result = await check();
  stdout.write(
    `Generated artifacts match their contract (${result.families} families, ${result.artifacts} files, ${result.authorityVersions} authority versions, ${result.riotAssets} Riot assets); no files written.\n`,
  );
  for (const { id, reproduction } of result.conditionalReproduction)
    stdout.write(`${id}: ${reproduction}\n`);
}

if (isDirectExecution(import.meta.url)) {
  try {
    await runGeneratedArtifactCheck();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
