import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { build } from 'esbuild-authority';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const artifactPath = 'config/authority-field-calibration-baseline-v1.json';
const conditionalArtifactPath = 'config/authority-field-calibration-conditionals-v1.json';
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'lolrogue-field-calibration-'));
const outputPath = path.join(temporaryRoot, 'authority-field-calibration.mjs');
const execFileAsync = promisify(execFile);
const { values } = parseArgs({
  strict: true,
  options: {
    check: { type: 'boolean', default: false },
    output: { type: 'string' },
  },
});

if (values.check && values.output) throw new Error('--check and --output are mutually exclusive.');

async function serializeJson(document, filename) {
  const temporaryArtifactPath = path.join(temporaryRoot, filename);
  await writeFile(temporaryArtifactPath, `${JSON.stringify(document, null, 2)}\n`);
  const biomeBinary = path.join(
    repositoryRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'biome.cmd' : 'biome',
  );
  await execFileAsync(biomeBinary, ['format', '--write', temporaryArtifactPath], {
    cwd: repositoryRoot,
  });
  return readFile(temporaryArtifactPath, 'utf8');
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
          createAuthorityFieldCalibrationBaselineV1,
          FIELD_CALIBRATION_BASELINE_V1_IDENTITIES,
        } from './src/game/balance/authorityFieldCalibrationBaselineV1.ts';
        import { createAuthorityFieldCalibrationConditionalsV1 } from './src/game/balance/authorityFieldCalibrationConditionalsV1.ts';

        export function generateAuthorityFieldCalibrationArtifacts() {
          const identity = FIELD_CALIBRATION_BASELINE_V1_IDENTITIES[0];
          const authority = getAuthorityVerifier(identity.engineVersion, identity.contentHash);
          if (!authority) throw new Error('The published v17 authority verifier is unavailable.');
          const fixture = createAuthorityFieldCalibrationBaselineV1(authority);
          return {
            baseline: fixture.document,
            conditionals: createAuthorityFieldCalibrationConditionalsV1(fixture),
          };
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
  const artifacts = fixture.generateAuthorityFieldCalibrationArtifacts();
  const baseline = await serializeJson(artifacts.baseline, path.basename(artifactPath));
  const conditionals = await serializeJson(
    artifacts.conditionals,
    path.basename(conditionalArtifactPath),
  );
  if (values.check) {
    const committed = await readFile(path.join(repositoryRoot, artifactPath), 'utf8');
    if (baseline !== committed) {
      throw new Error(`The field-calibration baseline is stale. Regenerate ${artifactPath}.`);
    }
    const committedConditionals = await readFile(
      path.join(repositoryRoot, conditionalArtifactPath),
      'utf8',
    );
    if (conditionals !== committedConditionals) {
      throw new Error(
        `The field-calibration conditional artifact is stale. Regenerate ${conditionalArtifactPath}.`,
      );
    }
    process.stdout.write(
      'Authority field-calibration baseline and conditionals v1 are reproducible.\n',
    );
  } else if (values.output) {
    await writeFile(path.resolve(repositoryRoot, values.output), baseline);
  } else {
    await writeFile(path.join(repositoryRoot, artifactPath), baseline);
    await writeFile(path.join(repositoryRoot, conditionalArtifactPath), conditionals);
    process.stdout.write(`Wrote ${artifactPath} and ${conditionalArtifactPath}.\n`);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
