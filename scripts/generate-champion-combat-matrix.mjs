import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const artifactPath = path.join(repositoryRoot, 'config/champion-combat-matrix-current.json');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-champion-matrix-'));
const outputPath = path.join(temporaryRoot, 'champion-combat-matrix.mjs');
const { values } = parseArgs({
  strict: true,
  options: {
    'baseline-engine': { type: 'string' },
    check: { type: 'boolean', default: false },
    output: { type: 'string' },
  },
});

if (values.check && values.output) throw new Error('--check and --output are mutually exclusive.');

function serializeComparison(comparison) {
  const formatted = structuredClone(comparison);
  const seedTokens = [
    '__LOLROGUE_CHAMPION_MATRIX_SEEDS_0__',
    '__LOLROGUE_CHAMPION_MATRIX_SEEDS_1__',
    '__LOLROGUE_CHAMPION_MATRIX_SEEDS_2__',
  ];
  formatted.methodology.pairedSeeds = seedTokens[0];
  formatted.baseline.pairedSeeds = seedTokens[1];
  formatted.candidate.pairedSeeds = seedTokens[2];
  formatted.p0Calibration.targetDecisiveWinRate = '__LOLROGUE_CHAMPION_MATRIX_P0__';
  const seeds = comparison.methodology.pairedSeeds;
  const serializedSeeds = `[
      ${seeds.slice(0, 26).join(', ')},
      ${seeds.slice(26).join(', ')}
    ]`;
  let serialized = JSON.stringify(formatted, null, 2);
  for (const token of seedTokens) {
    serialized = serialized.replace(JSON.stringify(token), serializedSeeds);
  }
  serialized = serialized.replace(
    JSON.stringify('__LOLROGUE_CHAMPION_MATRIX_P0__'),
    `[${comparison.p0Calibration.targetDecisiveWinRate.join(', ')}]`,
  );
  return `${serialized}\n`;
}

try {
  const registryDocument = JSON.parse(
    await readFile(path.join(repositoryRoot, 'config/authority-versions.json'), 'utf8'),
  );
  const versions = registryDocument.versions ?? registryDocument;
  const candidateVersion = versions.find((version) => version.status === 'current');
  if (!candidateVersion) throw new Error('The authority registry has no current version.');
  const baselineVersion = values['baseline-engine']
    ? versions.find((version) => version.engine === values['baseline-engine'])
    : versions
        .filter((version) => version.gameplay < candidateVersion.gameplay)
        .sort((left, right) => right.gameplay - left.gameplay)[0];
  if (!baselineVersion) {
    throw new Error('The authority registry has no baseline version for the combat matrix.');
  }

  await build({
    absWorkingDir: repositoryRoot,
    stdin: {
      contents: `
        export {
          createChampionCombatMatrixComparison,
          runChampionCombatMatrix,
        } from './src/game/balance/championCombatMatrix.ts';
        export {
          createSourceChampionCombatRuntime,
        } from './src/game/balance/championCombatSourceRuntime.ts';
        export {
          loadInstrumentedAuthorityCombatRuntime,
        } from './tests/helpers/instrumentedAuthorityCombatRuntime.ts';
      `,
      resolveDir: repositoryRoot,
      sourcefile: 'champion-combat-matrix-entry.ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    outfile: outputPath,
    legalComments: 'none',
    logLevel: 'silent',
    tsconfig: path.join(repositoryRoot, 'tsconfig.json'),
  });
  const matrix = await import(pathToFileURL(outputPath).href);
  const baselineRuntime = await matrix.loadInstrumentedAuthorityCombatRuntime(
    path.join(repositoryRoot, baselineVersion.bundle),
  );
  const candidateBundleRuntime = await matrix.loadInstrumentedAuthorityCombatRuntime(
    path.join(repositoryRoot, candidateVersion.bundle),
  );
  const candidateSourceRuntime = matrix.createSourceChampionCombatRuntime();
  if (
    candidateSourceRuntime.engineVersion !== candidateVersion.engine ||
    candidateSourceRuntime.contentHash !== candidateVersion.contentHash
  ) {
    throw new Error('The current source identity does not match the authority registry.');
  }
  const comparison = matrix.createChampionCombatMatrixComparison({
    baseline: matrix.runChampionCombatMatrix(baselineRuntime),
    candidateBundle: matrix.runChampionCombatMatrix(candidateBundleRuntime),
    candidateSource: matrix.runChampionCombatMatrix(candidateSourceRuntime),
  });
  const serialized = serializeComparison(comparison);

  if (values.check) {
    const committed = await readFile(artifactPath, 'utf8');
    if (serialized !== committed) {
      throw new Error(
        'The current champion combat matrix is stale. Run npm run balance:combat:matrix:generate.',
      );
    }
    process.stdout.write(
      `Champion combat matrix ${baselineVersion.engine} -> ${candidateVersion.engine} reproduced ${comparison.methodology.combatsPerRuntime} combats per runtime.\n`,
    );
  } else if (values.output) {
    await writeFile(path.resolve(repositoryRoot, values.output), serialized, 'utf8');
  } else {
    await writeFile(artifactPath, serialized, 'utf8');
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
