import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-cohort-baseline-'));
const outputPath = path.join(temporaryRoot, 'authority-cohort-baseline.mjs');

try {
  await build({
    absWorkingDir: repositoryRoot,
    entryPoints: ['src/game/balance/authorityCohortBaselineV15Fixture.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    outfile: outputPath,
    legalComments: 'none',
    logLevel: 'silent',
    tsconfig: path.join(repositoryRoot, 'tsconfig.json'),
  });
  const fixture = await import(pathToFileURL(outputPath).href);
  process.stdout.write(
    `${JSON.stringify(fixture.generateAuthorityCohortBaselineV15(), null, 2)}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
