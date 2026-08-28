import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const artifactPath = 'config/authority-field-calibration-baseline-v1.json';
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-field-calibration-'));
const outputPath = path.join(temporaryRoot, 'authority-field-calibration.mjs');
const { values } = parseArgs({
  strict: true,
  options: {
    check: { type: 'boolean', default: false },
    output: { type: 'string' },
  },
});

if (values.check && values.output) throw new Error('--check and --output are mutually exclusive.');

function serializeBaseline(document) {
  const formatted = structuredClone(document);
  const replacements = new Map();
  for (const [index, entry] of Object.values(formatted.entries).entries()) {
    const token = `__LOLROGUE_FIELD_CALIBRATION_SEEDS_${index}__`;
    replacements.set(JSON.stringify(token), `[${entry.source.seeds.join(', ')}]`);
    entry.source.seeds = token;
  }
  let serialized = JSON.stringify(formatted, null, 2);
  for (const [token, seeds] of replacements) serialized = serialized.replace(token, seeds);
  return `${serialized}\n`;
}

async function resolveAuthorityBundle() {
  const registry = JSON.parse(
    await readFile(path.join(repositoryRoot, 'config/authority-versions.json'), 'utf8'),
  );
  const version = registry.versions.find((candidate) => candidate.engine === 'run-engine-v17');
  if (!version || typeof version.bundle !== 'string') {
    throw new Error('Authority registry does not retain run-engine-v17.');
  }
  return `./${version.bundle}`;
}

try {
  const authorityBundle = await resolveAuthorityBundle();
  await build({
    absWorkingDir: repositoryRoot,
    stdin: {
      contents: `
        import { getAuthorityVerifier } from ${JSON.stringify(authorityBundle)};
        import {
          FIELD_CALIBRATION_BASELINE_V1_IDENTITIES,
          generateAuthorityFieldCalibrationBaselineV1,
        } from './src/game/balance/authorityFieldCalibrationBaselineV1.ts';

        export function generateAuthorityFieldCalibrationBaseline() {
          const identity = FIELD_CALIBRATION_BASELINE_V1_IDENTITIES[0];
          const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
          if (!authority) throw new Error('The published v17 authority verifier is unavailable.');
          return generateAuthorityFieldCalibrationBaselineV1(authority);
        }
      `,
      resolveDir: repositoryRoot,
      sourcefile: 'authority-field-calibration-baseline-v1-entry.ts',
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
  const baseline = serializeBaseline(fixture.generateAuthorityFieldCalibrationBaseline());
  if (values.check) {
    const committed = await readFile(path.join(repositoryRoot, artifactPath), 'utf8');
    if (baseline !== committed) {
      throw new Error(`The field-calibration baseline is stale. Regenerate ${artifactPath}.`);
    }
    process.stdout.write('Authority field-calibration baseline v1 is reproducible.\n');
  } else if (values.output) {
    await writeFile(path.resolve(repositoryRoot, values.output), baseline);
  } else {
    await writeFile(path.join(repositoryRoot, artifactPath), baseline);
    process.stdout.write(`Wrote ${artifactPath}.\n`);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
