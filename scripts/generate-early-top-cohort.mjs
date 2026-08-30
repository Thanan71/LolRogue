import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-early-top-cohort-'));
const outputPath = path.join(temporaryRoot, 'early-top-cohort.mjs');
const { values } = parseArgs({
  strict: true,
  options: {
    check: { type: 'boolean', default: false },
    engine: { type: 'string', default: 'v18' },
    output: { type: 'string' },
  },
});

const versions = {
  v17: {
    artifact: 'config/early-top-cohort-v17.json',
    entrySource: `
      import { getAuthorityVerifier } from './supabase/functions/verify-run/run-authority-v17.bundle.ts';
      import { generateEarlyTopCohortDocument } from './src/game/balance/earlyTopCohort.ts';

      export function generate() {
        const authority = getAuthorityVerifier(
          'run-engine-v17',
          '83d6be646ff23a633d81fcde8df28fa642d2d1a2fc261be05aabc4aa8938dc19',
        );
        if (!authority) throw new Error('The v17 authority verifier is unavailable.');
        return generateEarlyTopCohortDocument(authority);
      }
    `,
  },
  v18: {
    artifact: 'config/early-top-cohort-v18.json',
    entrySource: `
      import { getAuthorityVerifier } from './supabase/functions/verify-run/run-authority.bundle.js';
      import { generateEarlyTopCohortDocument } from './src/game/balance/earlyTopCohort.ts';

      export function generate() {
        const authority = getAuthorityVerifier(
          'run-engine-v18',
          '9abe5b2f3b54559a0dc8449d24b817d8787d48bc1b7a78e43992fe243f7ccc17',
        );
        if (!authority) throw new Error('The v18 authority verifier is unavailable.');
        return generateEarlyTopCohortDocument(authority);
      }
    `,
  },
};
const version = versions[values.engine];
if (!version) throw new Error('--engine must be v17 or v18.');
if (values.check && values.output) throw new Error('--check and --output are mutually exclusive.');
if (values.check && !version.artifact) {
  throw new Error('--check is only available for a published cohort artifact.');
}

function formatArray(values, indentation, lineWidth = 100) {
  const prefix = ' '.repeat(indentation);
  const closing = ' '.repeat(indentation - 2);
  const lines = [];
  let line = prefix;
  for (const value of values.map((entry) => JSON.stringify(entry))) {
    const candidate = line === prefix ? `${line}${value}` : `${line}, ${value}`;
    if (candidate.length <= lineWidth) {
      line = candidate;
    } else {
      lines.push(`${line},`);
      line = `${prefix}${value}`;
    }
  }
  lines.push(line);
  return `[\n${lines.join('\n')}\n${closing}]`;
}

function serialize(document) {
  const formatted = structuredClone(document);
  const seedsToken = '__LOLROGUE_EARLY_TOP_SEEDS__';
  const difficultiesToken = '__LOLROGUE_EARLY_TOP_DIFFICULTIES__';
  const seeds = formatted.source.seeds;
  const difficulties = formatted.source.difficulties;
  formatted.source.seeds = seedsToken;
  formatted.source.difficulties = difficultiesToken;
  return `${JSON.stringify(formatted, null, 2)
    .replace(JSON.stringify(seedsToken), formatArray(seeds, 6))
    .replace(
      JSON.stringify(difficultiesToken),
      `[${difficulties.map((difficulty) => JSON.stringify(difficulty)).join(', ')}]`,
    )}\n`;
}

try {
  await build({
    absWorkingDir: repositoryRoot,
    stdin: {
      contents: version.entrySource,
      resolveDir: repositoryRoot,
      sourcefile: `early-top-cohort-${values.engine}-entry.ts`,
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
  const serialized = serialize(runner.generate());
  if (values.check) {
    const committed = await readFile(path.join(repositoryRoot, version.artifact), 'utf8');
    if (serialized !== committed) {
      throw new Error(`The ${values.engine} early Top cohort artifact is stale.`);
    }
    process.stdout.write(`Early Top cohort ${values.engine} is reproducible.\n`);
  } else if (values.output) {
    await writeFile(path.resolve(repositoryRoot, values.output), serialized);
  } else {
    process.stdout.write(serialized);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
