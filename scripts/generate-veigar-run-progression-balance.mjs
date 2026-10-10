import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const artifactPath = path.join(repositoryRoot, 'config/veigar-run-progression-balance-v22.json');
const { values } = parseArgs({
  strict: true,
  options: {
    check: { type: 'boolean', default: false },
    output: { type: 'string' },
  },
});
if (values.check && values.output) throw new Error('--check and --output are mutually exclusive.');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-veigar-balance-'));
const runnerPath = path.join(temporaryRoot, 'veigar-balance.mjs');
try {
  await build({
    absWorkingDir: repositoryRoot,
    stdin: {
      contents: `
        import { championDB } from './src/data/championDatabase.ts';
        import { BattleManager } from './src/game/battle/BattleManager.ts';
        import { ChampionInstance } from './src/game/ChampionInstance.ts';
        import { AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH, getAuthorityVerifier } from './src/game/authority/index.ts';
        import { generateVeigarRunProgressionBalanceDocument } from './src/game/balance/veigarRunProgressionBalance.ts';
        import { importInstrumentedAuthorityBundle } from './tests/helpers/instrumentedAuthorityCombatRuntime.ts';
        export async function generate(bundlePath) {
          const edge = await importInstrumentedAuthorityBundle(bundlePath);
          const sourceAuthority = getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
          const edgeAuthority = edge.getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH);
          if (!sourceAuthority || !edgeAuthority) throw new Error('The source or exact current Edge verifier is unavailable. Run npm run edge:bundle first.');
          return generateVeigarRunProgressionBalanceDocument({
            sourceAuthority, edgeAuthority,
            sourceClasses: { championDB, BattleManager, ChampionInstance }, edgeClasses: edge,
          });
        }
      `,
      resolveDir: repositoryRoot,
      sourcefile: 'veigar-run-progression-balance-entry.ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    outfile: runnerPath,
    legalComments: 'none',
    logLevel: 'silent',
    tsconfig: path.join(repositoryRoot, 'tsconfig.json'),
  });
  const runner = await import(pathToFileURL(runnerPath).href);
  const document = await runner.generate(
    path.join(repositoryRoot, 'supabase/functions/verify-run/run-authority.bundle.js'),
  );
  const formatting = spawnSync(
    path.join(repositoryRoot, 'node_modules/.bin/biome'),
    ['format', '--stdin-file-path', artifactPath],
    { cwd: repositoryRoot, input: `${JSON.stringify(document, null, 2)}\n`, encoding: 'utf8' },
  );
  if (formatting.status !== 0)
    throw new Error(`Cannot format balance artifact: ${formatting.stderr}`);
  const serialized = formatting.stdout;
  if (values.check) {
    if ((await readFile(artifactPath, 'utf8')) !== serialized)
      throw new Error('The Veigar v22 balance artifact is stale.');
    process.stdout.write(
      'Veigar v22: 180 paired runs, source/Edge parity and safety probes are reproducible.\n',
    );
  } else {
    await writeFile(
      values.output ? path.resolve(repositoryRoot, values.output) : artifactPath,
      serialized,
    );
    process.stdout.write(
      `Veigar v22 balance artifact generated: ${values.output ?? path.relative(repositoryRoot, artifactPath)}.\n`,
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
