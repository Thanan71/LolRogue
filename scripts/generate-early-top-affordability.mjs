import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-early-top-affordability-'));
const outputPath = path.join(temporaryRoot, 'early-top-affordability.mjs');
const { values } = parseArgs({
  strict: true,
  options: {
    engine: { type: 'string', default: 'v18' },
    output: { type: 'string' },
  },
});

const entrySources = {
  v17: `
    import { getAuthorityVerifier } from './supabase/functions/verify-run/run-authority-v17.bundle.ts';
    import { measureEarlyTopAffordability } from './src/game/balance/earlyTopAffordability.ts';

    export function generate() {
      const authority = getAuthorityVerifier(
        'run-engine-v17',
        '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
      );
      if (!authority) throw new Error('The v17 authority verifier is unavailable.');
      return measureEarlyTopAffordability(authority);
    }
  `,
  v18: `
    import { getAuthorityVerifier } from './supabase/functions/verify-run/run-authority-v18.bundle.ts';
    import { measureEarlyTopAffordability } from './src/game/balance/earlyTopAffordability.ts';

    export function generate() {
      const authority = getAuthorityVerifier(
        'run-engine-v18',
        '9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17',
      );
      if (!authority) throw new Error('The v18 authority verifier is unavailable.');
      return measureEarlyTopAffordability(authority);
    }
  `,
};

const entrySource = entrySources[values.engine];
if (!entrySource) throw new Error('--engine must be v17 or v18.');

try {
  await build({
    absWorkingDir: repositoryRoot,
    stdin: {
      contents: entrySource,
      resolveDir: repositoryRoot,
      sourcefile: `early-top-affordability-${values.engine}-entry.ts`,
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
  const runner = await import(pathToFileURL(outputPath).href);
  const serialized = `${JSON.stringify(runner.generate(), null, 2)}\n`;
  if (values.output) {
    await writeFile(path.resolve(repositoryRoot, values.output), serialized);
  } else {
    process.stdout.write(serialized);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
