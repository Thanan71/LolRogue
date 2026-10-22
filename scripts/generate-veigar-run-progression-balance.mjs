import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const registry = JSON.parse(
  await readFile(path.join(repositoryRoot, 'config/authority-versions.json'), 'utf8'),
);
const currentEngine = registry.versions
  .find((version) => version.status === 'current')
  .engine.replace(/^run-engine-/, '');
const { values } = parseArgs({
  strict: true,
  options: {
    check: { type: 'boolean', default: false },
    engine: { type: 'string', default: currentEngine },
    output: { type: 'string' },
  },
});
const entry = registry.versions.find((version) => version.engine === `run-engine-${values.engine}`);
if (!entry) throw new Error(`Unknown registered authority ${values.engine}.`);
if (!entry.features.runProgression)
  throw new Error('Veigar balance requires an authority with the runProgression capability.');
const isCurrent = entry.status === 'current';
const bundleBytes = await readFile(path.join(repositoryRoot, entry.bundle));
const bundleSource = bundleBytes.toString('utf8').replace(/^\/\/ @ts-nocheck\r?\n/, '');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
if (
  bundleSource.match(/AUTHORITY_CONTENT_HASH\s*=\s*["']([a-f0-9]{64})["']/)?.[1] !==
    entry.contentHash ||
  sha256(bundleSource.replace(entry.contentHash, '<AUTHORITY_CONTENT_HASH>')) !== entry.contentHash
) {
  throw new Error(`The registered Veigar authority content hash does not match ${entry.engine}.`);
}
if (!isCurrent) {
  const frozen = JSON.parse(
    await readFile(
      path.join(repositoryRoot, 'tests/fixtures/engine-refactor-contract.json'),
      'utf8',
    ),
  ).bundles.find((version) => version.engine === entry.engine);
  if (
    !frozen ||
    frozen.contentHash !== entry.contentHash ||
    frozen.bytes !== bundleBytes.length ||
    frozen.sha256 !== sha256(bundleBytes)
  ) {
    throw new Error(`The frozen Veigar authority bytes do not match ${entry.engine}.`);
  }
}
const artifactPath = path.join(
  repositoryRoot,
  `config/veigar-run-progression-balance-${values.engine}.json`,
);
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
          const sourceAuthority = ${
            !isCurrent
              ? `edge.getAuthorityVerifier(${JSON.stringify(entry.engine)}, ${JSON.stringify(entry.contentHash)})`
              : 'getAuthorityVerifier(AUTHORITY_ENGINE_VERSION, AUTHORITY_CONTENT_HASH)'
          };
          const edgeAuthority = edge.getAuthorityVerifier(${JSON.stringify(entry.engine)}, ${JSON.stringify(entry.contentHash)});
          if (!sourceAuthority || !edgeAuthority) throw new Error('The source or exact registered Edge verifier is unavailable. Run npm run release -- edge bundle first.');
          return generateVeigarRunProgressionBalanceDocument({
            sourceAuthority, edgeAuthority,
            sourceClasses: ${!isCurrent ? 'edge' : '{ championDB, BattleManager, ChampionInstance }'}, edgeClasses: edge,
            registeredAuthority: ${JSON.stringify({ engine: entry.engine, contentHash: entry.contentHash, features: { runProgression: entry.features.runProgression } })},
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
  const document = await runner.generate(path.join(repositoryRoot, entry.bundle));
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
      throw new Error(`The Veigar ${values.engine} balance artifact is stale.`);
    process.stdout.write(
      `Veigar ${values.engine}: 180 paired runs, source/Edge parity and safety probes are reproducible.\n`,
    );
  } else {
    await writeFile(
      values.output ? path.resolve(repositoryRoot, values.output) : artifactPath,
      serialized,
    );
    process.stdout.write(
      `Veigar ${values.engine} balance artifact generated: ${values.output ?? path.relative(repositoryRoot, artifactPath)}.\n`,
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
