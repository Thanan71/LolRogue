import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-cohort-baseline-'));
const outputPath = path.join(temporaryRoot, 'authority-cohort-baseline.mjs');
const { values } = parseArgs({
  strict: true,
  options: {
    check: { type: 'boolean', default: false },
    engine: { type: 'string', default: 'v19' },
    output: { type: 'string' },
  },
});

const version = {
  v15: {
    artifact: 'config/authority-cohort-baselines-v15.json',
    entrySource: `
    import { getAuthorityVerifier } from './supabase/functions/verify-run/run-authority-v15.bundle.ts';
    import {
      AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
      generateAuthorityCohortBaselineV15,
    } from './src/game/balance/authorityCohortBaselineV15Fixture.ts';

    export function generateAuthorityCohortBaseline() {
      const identity = AUTHORITY_COHORT_BASELINE_V15_IDENTITY;
      const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
      if (!authority) throw new Error('The archived v15 authority verifier is unavailable.');
      return generateAuthorityCohortBaselineV15(authority);
    }
  `,
  },
  v16: {
    artifact: 'config/authority-cohort-baselines-v16.json',
    entrySource: `
    import { getAuthorityVerifier } from './supabase/functions/verify-run/run-authority-v16.bundle.ts';
    import {
      AUTHORITY_COHORT_BASELINE_V16_IDENTITY,
      generateAuthorityCohortBaselineV16,
    } from './src/game/balance/authorityCohortBaselineV16Fixture.ts';

    export function generateAuthorityCohortBaseline() {
      const identity = AUTHORITY_COHORT_BASELINE_V16_IDENTITY;
      const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
      if (!authority) throw new Error('The archived v16 authority verifier is unavailable.');
      return generateAuthorityCohortBaselineV16(authority);
    }
  `,
  },
  v17: {
    artifact: 'config/authority-cohort-baselines-v17.json',
    entrySource: `
    import { getAuthorityVerifier } from './supabase/functions/verify-run/run-authority-v17.bundle.ts';
    import {
      AUTHORITY_COHORT_BASELINE_V17_IDENTITY,
      generateAuthorityCohortBaselineV17,
    } from './src/game/balance/authorityCohortBaselineV17Fixture.ts';

    export function generateAuthorityCohortBaseline() {
      const identity = AUTHORITY_COHORT_BASELINE_V17_IDENTITY;
      const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
      if (!authority) throw new Error('The archived v17 authority verifier is unavailable.');
      return generateAuthorityCohortBaselineV17(authority);
    }
  `,
  },
  v18: {
    artifact: 'config/authority-cohort-baselines-v18.json',
    entrySource: `
    import { getAuthorityVerifier } from './supabase/functions/verify-run/run-authority-v18.bundle.ts';
    import {
      AUTHORITY_COHORT_BASELINE_V18_IDENTITY,
      generateAuthorityCohortBaselineV18,
    } from './src/game/balance/authorityCohortBaselineV18Fixture.ts';

    export function generateAuthorityCohortBaseline() {
      const identity = AUTHORITY_COHORT_BASELINE_V18_IDENTITY;
      const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
      if (!authority) throw new Error('The archived v18 authority verifier is unavailable.');
      return generateAuthorityCohortBaselineV18(authority);
    }
  `,
  },
  v19: {
    artifact: 'config/authority-cohort-baselines-v19.json',
    entrySource: `
    export {
      generateAuthorityCohortBaselineV19 as generateAuthorityCohortBaseline,
    } from './src/game/balance/authorityCohortBaselineV19Fixture.ts';
  `,
  },
}[values.engine];

if (!version) throw new Error('--engine must be one of: v15, v16, v17, v18, v19.');
if (values.check && values.output) throw new Error('--check and --output are mutually exclusive.');

function serializeBaseline(document) {
  const formatted = structuredClone(document);
  const replacements = new Map();
  for (const [index, entry] of Object.values(formatted.entries).entries()) {
    const token = `__LOLROGUE_BASELINE_SEEDS_${index}__`;
    replacements.set(JSON.stringify(token), `[${entry.source.seeds.join(', ')}]`);
    entry.source.seeds = token;
  }
  let serialized = JSON.stringify(formatted, null, 2);
  for (const [token, seeds] of replacements) serialized = serialized.replace(token, seeds);
  return `${serialized}\n`;
}

try {
  await build({
    absWorkingDir: repositoryRoot,
    stdin: {
      contents: version.entrySource,
      resolveDir: repositoryRoot,
      sourcefile: `authority-cohort-baseline-${values.engine}-entry.ts`,
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
  const fixture = await import(pathToFileURL(outputPath).href);
  const baseline = serializeBaseline(fixture.generateAuthorityCohortBaseline());
  if (values.check) {
    const committed = await readFile(path.join(repositoryRoot, version.artifact), 'utf8');
    if (baseline !== committed) {
      throw new Error(
        `The ${values.engine} authority cohort baseline is stale. Regenerate ${version.artifact}.`,
      );
    }
    process.stdout.write(`Authority cohort baseline ${values.engine} is reproducible.\n`);
  } else if (values.output) {
    await writeFile(path.resolve(repositoryRoot, values.output), baseline);
  } else {
    process.stdout.write(baseline);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
