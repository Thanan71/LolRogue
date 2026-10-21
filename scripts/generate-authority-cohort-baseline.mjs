import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild-authority';
import { validateAuthorityVersionRegistry } from './lib/authority-version-registry.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const registry = validateAuthorityVersionRegistry(
  JSON.parse(await readFile(path.join(repositoryRoot, 'config/authority-versions.json'), 'utf8')),
);
const currentVersions = registry.versions.filter((entry) => entry.status === 'current');
if (currentVersions.length !== 1)
  throw new Error('Authority registry must contain one current engine.');
const currentEngine = currentVersions[0].engine.replace(/^run-engine-/, '');
const { values } = parseArgs({
  strict: true,
  options: {
    check: { type: 'boolean', default: false },
    engine: { type: 'string', default: currentEngine },
    output: { type: 'string' },
  },
});

async function resolveRegisteredAuthorityBundle(engineVersion) {
  const entry = registry.versions.find((candidate) => candidate.engine === engineVersion);
  if (!entry || typeof entry.bundle !== 'string') {
    throw new Error(`Authority registry does not retain ${engineVersion}.`);
  }
  return `./${entry.bundle}`;
}

const v22Bundle =
  values.engine === 'v22' ? await resolveRegisteredAuthorityBundle('run-engine-v22') : null;

async function registeredSemanticVersion(engine) {
  const engineVersion = `run-engine-${engine}`;
  const entry = registry.versions.find((candidate) => candidate.engine === engineVersion);
  const bundle = await resolveRegisteredAuthorityBundle(engineVersion);
  const identity = {
    engineVersion,
    contentHash: entry.contentHash,
    balanceModelVersion: 2,
    policy: { id: 'survival-greedy', version: 1 },
  };
  return {
    artifact: `config/authority-cohort-baselines-${engine}.json`,
    entrySource: `
      import { getAuthorityVerifier } from ${JSON.stringify(bundle)};
      import {
        generateAuthorityCohortBaselineForIdentity,
      } from './src/game/balance/authorityCohortCurrentBaselineFixture.ts';
      export function generateAuthorityCohortBaseline() {
        const identity = ${JSON.stringify(identity)};
        const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
        if (!authority) throw new Error('The registered ${engine} authority verifier is unavailable.');
        return generateAuthorityCohortBaselineForIdentity(authority, identity);
      }
    `,
  };
}

const semanticVersion = ['0.2.0', '0.2.5'].includes(values.engine)
  ? await registeredSemanticVersion(values.engine)
  : null;

const version = {
  v15: {
    artifact: 'config/authority-cohort-baselines-v15.json',
    entrySource: `
    import { getAuthorityVerifier } from './supabase/authority-archive/run-authority-v15.bundle.ts';
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
    import { getAuthorityVerifier } from './supabase/authority-archive/run-authority-v16.bundle.ts';
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
    import { getAuthorityVerifier } from './supabase/authority-archive/run-authority-v17.bundle.ts';
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
    import { getAuthorityVerifier } from './supabase/authority-archive/run-authority-v18.bundle.ts';
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
    import { getAuthorityVerifier } from './supabase/authority-archive/run-authority-v19.bundle.ts';
    import {
      AUTHORITY_COHORT_BASELINE_V19_IDENTITY,
      generateAuthorityCohortBaselineV19,
    } from './src/game/balance/authorityCohortBaselineV19Fixture.ts';

    export function generateAuthorityCohortBaseline() {
      const identity = AUTHORITY_COHORT_BASELINE_V19_IDENTITY;
      const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
      if (!authority) throw new Error('The archived v19 authority verifier is unavailable.');
      return generateAuthorityCohortBaselineV19(authority);
    }
  `,
  },
  v20: {
    artifact: 'config/authority-cohort-baselines-v20.json',
    entrySource: `
    import { getAuthorityVerifier } from './supabase/authority-archive/run-authority-v20.bundle.ts';
    import {
      AUTHORITY_COHORT_BASELINE_V20_IDENTITY,
      generateAuthorityCohortBaselineV20,
    } from './src/game/balance/authorityCohortBaselineV20Fixture.ts';

    export function generateAuthorityCohortBaseline() {
      const identity = AUTHORITY_COHORT_BASELINE_V20_IDENTITY;
      const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
      if (!authority) throw new Error('The archived v20 authority verifier is unavailable.');
      return generateAuthorityCohortBaselineV20(authority);
    }
  `,
  },
  v21: {
    artifact: 'config/authority-cohort-baselines-v21.json',
    entrySource: `
    import { getAuthorityVerifier } from './supabase/authority-archive/run-authority-v21.bundle.ts';
    import {
      AUTHORITY_COHORT_BASELINE_V21_IDENTITY,
      generateAuthorityCohortBaselineV21,
    } from './src/game/balance/authorityCohortBaselineV21Fixture.ts';
    export function generateAuthorityCohortBaseline() {
      const identity = AUTHORITY_COHORT_BASELINE_V21_IDENTITY;
      const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
      if (!authority) throw new Error('The archived v21 authority verifier is unavailable.');
      return generateAuthorityCohortBaselineV21(authority);
    }
  `,
  },
  v22: {
    artifact: 'config/authority-cohort-baselines-v22.json',
    entrySource: `
    import { getAuthorityVerifier } from ${JSON.stringify(v22Bundle)};
    import {
      AUTHORITY_COHORT_BASELINE_V22_IDENTITY,
      generateAuthorityCohortBaselineV22,
    } from './src/game/balance/authorityCohortBaselineV22Fixture.ts';
    export function generateAuthorityCohortBaseline() {
      const identity = AUTHORITY_COHORT_BASELINE_V22_IDENTITY;
      const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
      if (!authority) throw new Error('The registered v22 authority verifier is unavailable.');
      return generateAuthorityCohortBaselineV22(authority);
    }
  `,
  },
  '0.2.0': semanticVersion,
  '0.2.5': semanticVersion,
}[values.engine];

if (!version)
  throw new Error('--engine must be one of: v15, v16, v17, v18, v19, v20, v21, v22, 0.2.0, 0.2.5.');
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

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-cohort-baseline-'));
const outputPath = path.join(temporaryRoot, 'authority-cohort-baseline.mjs');

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
