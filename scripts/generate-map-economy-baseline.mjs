import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const artifactPath = path.join(repositoryRoot, 'config/map-economy-baseline-v19.json');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-map-economy-baseline-'));
const outputPath = path.join(temporaryRoot, 'map-economy-baseline.mjs');
const { values } = parseArgs({
  strict: true,
  options: {
    check: { type: 'boolean', default: false },
    output: { type: 'string' },
  },
});

if (values.check && values.output) throw new Error('--check and --output are mutually exclusive.');

try {
  await build({
    absWorkingDir: repositoryRoot,
    stdin: {
      contents: `
        export {
          createMapEconomyBaseline,
        } from './src/game/balance/mapEconomyBaseline.ts';
      `,
      resolveDir: repositoryRoot,
      sourcefile: 'map-economy-baseline-entry.ts',
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

  const { createMapEconomyBaseline } = await import(pathToFileURL(outputPath).href);
  const baseline = createMapEconomyBaseline();
  const serialized = `${JSON.stringify(baseline, null, 2)}\n`;

  if (values.check) {
    const committed = await readFile(artifactPath, 'utf8');
    if (serialized !== committed) {
      throw new Error(
        'The v19 map/economy baseline is stale. Run npm run balance:map-economy:generate.',
      );
    }
    process.stdout.write(
      `Map/economy baseline reproduced ${baseline.identity.seedCount} seeds for ${baseline.identity.engineVersion}.\n`,
    );
  } else {
    const destination = values.output ? path.resolve(repositoryRoot, values.output) : artifactPath;
    await writeFile(destination, serialized, 'utf8');
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
