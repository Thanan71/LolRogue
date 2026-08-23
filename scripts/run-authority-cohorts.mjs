import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-authority-cohorts-'));
const outputPath = path.join(temporaryRoot, 'authority-cohorts.mjs');

try {
  await build({
    absWorkingDir: repositoryRoot,
    entryPoints: ['src/game/balance/authorityCohortExecutionCli.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    outfile: outputPath,
    legalComments: 'none',
    logLevel: 'silent',
    tsconfig: path.join(repositoryRoot, 'tsconfig.json'),
  });
  const runner = await import(pathToFileURL(outputPath).href);
  await runner.runAuthorityCohortExecutionCli(process.argv.slice(2));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
