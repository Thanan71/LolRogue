import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { artifactPath, createArtifactSnapshot } from './artifact-snapshot.mjs';
import { checkAuthorityArtifacts } from './generated-authority-artifacts.mjs';
import { checkRiotArtifacts } from './generated-riot-artifacts.mjs';

export const GENERATED_ARTIFACT_CONTRACT = 'config/generated-artifacts.json';

function patternMatches(pattern, file) {
  artifactPath(pattern);
  const expression = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${expression}$`).test(file);
}

export function validateArtifactContract(contract) {
  if (
    contract?.schemaVersion !== 1 ||
    !Array.isArray(contract.scopes) ||
    !contract.scopes.length ||
    !Array.isArray(contract.families) ||
    !contract.families.length
  ) {
    throw new Error('Generated artifacts: invalid contract schema.');
  }
  const ids = new Set();
  for (const scope of contract.scopes) artifactPath(scope);
  for (const family of contract.families) {
    if (
      !family.id ||
      ids.has(family.id) ||
      !['tracked', 'manual-source'].includes(family.git) ||
      !Array.isArray(family.patterns) ||
      !family.patterns.length ||
      !Array.isArray(family.sources) ||
      !family.sources.length ||
      !Array.isArray(family.consumers) ||
      !family.consumers.length ||
      !Array.isArray(family.integrity) ||
      !family.integrity.length ||
      !family.retention ||
      !(family.generator === null || typeof family.generator === 'string') ||
      !family.reproduction
    ) {
      throw new Error(`Generated artifacts: invalid family: ${family.id ?? '(missing id)'}.`);
    }
    ids.add(family.id);
    for (const pattern of family.patterns) artifactPath(pattern);
    for (const source of family.sources) artifactPath(source);
    for (const consumer of family.consumers) artifactPath(consumer);
  }
  return contract;
}

function trackedFiles(root, runGit) {
  const result = runGit('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') {
    throw new Error('Generated artifacts: cannot inspect Git tracking; run from a Git checkout.');
  }
  return result.stdout.split('\0').filter(Boolean).sort();
}

function allowNewContract(root, runGit) {
  const history = runGit(
    'git',
    ['ls-tree', '--name-only', 'HEAD', '--', GENERATED_ARTIFACT_CONTRACT],
    { cwd: root, encoding: 'utf8' },
  );
  const ignored = runGit(
    'git',
    ['check-ignore', '--no-index', '-q', '--', GENERATED_ARTIFACT_CONTRACT],
    { cwd: root, encoding: 'utf8' },
  );
  if (history.error || history.status !== 0 || ignored.error || ![0, 1].includes(ignored.status)) {
    throw new Error('Generated artifacts: cannot inspect the new contract Git policy.');
  }
  return history.stdout.trim() === '' && ignored.status === 1;
}

/** Checks only. It has no filesystem-writing dependency or generation mode. */
async function checkArtifactSnapshot({ root, snapshot, runGit, authorityDependencies }) {
  const contract = validateArtifactContract(await snapshot.json(GENERATED_ARTIFACT_CONTRACT));
  const tracked = trackedFiles(root, runGit);
  const newContract =
    !tracked.includes(GENERATED_ARTIFACT_CONTRACT) && allowNewContract(root, runGit);
  const artifacts = new Set();
  const counts = new Map(contract.families.map(({ id }) => [id, 0]));
  for (const scope of contract.scopes) {
    for (const file of await snapshot.list(scope)) artifacts.add(file);
  }
  for (const file of await snapshot.list('supabase/functions/verify-run')) {
    if (/\.(?:bundle|generated)\.(?:js|ts)$/.test(file)) artifacts.add(file);
  }
  for (const file of [...artifacts].sort()) {
    const matches = contract.families.filter(({ patterns }) =>
      patterns.some((pattern) => patternMatches(pattern, file)),
    );
    if (matches.length !== 1) {
      throw new Error(
        `Generated artifacts: ${matches.length ? 'ambiguous' : 'unclassified'} artifact: ${file}. Update the reviewed contract.`,
      );
    }
    const family = matches[0];
    counts.set(family.id, counts.get(family.id) + 1);
    if (!tracked.includes(file) && !(file === GENERATED_ARTIFACT_CONTRACT && newContract)) {
      throw new Error(
        `Generated artifacts: required versioned output is not tracked by Git: ${file}.`,
      );
    }
    await snapshot.read(file);
    if (file.endsWith('.json')) await snapshot.json(file);
  }
  for (const family of contract.families) {
    if (!counts.get(family.id))
      throw new Error(`Generated artifacts: required family is missing: ${family.id}.`);
    for (const file of new Set([...family.sources, ...family.consumers])) await snapshot.read(file);
    for (const pattern of family.patterns.filter((value) => !value.includes('*'))) {
      if (!artifacts.has(pattern))
        throw new Error(`Generated artifacts: required artifact is missing: ${pattern}.`);
    }
  }
  const authorityVersions = await checkAuthorityArtifacts(
    snapshot,
    path.resolve(root),
    authorityDependencies,
  );
  const riotAssets = await checkRiotArtifacts(snapshot);
  if (JSON.stringify(tracked) !== JSON.stringify(trackedFiles(root, runGit))) {
    throw new Error(
      'Generated artifacts: Git tracking changed during check. Retry after staging finishes.',
    );
  }
  return {
    families: counts.size,
    artifacts: artifacts.size,
    authorityVersions,
    riotAssets,
    conditionalReproduction: contract.families
      .filter(({ reproduction }) => reproduction.startsWith('conditional:'))
      .map(({ id, reproduction }) => ({ id, reproduction })),
  };
}

export async function checkGeneratedArtifacts({
  root = process.cwd(),
  snapshot = createArtifactSnapshot(root),
  runGit = spawnSync,
  authorityDependencies = {},
} = {}) {
  try {
    return await checkArtifactSnapshot({ root, snapshot, runGit, authorityDependencies });
  } finally {
    // A failed comparison may itself be caused by a generator changing its inputs.
    // Recheck captured bytes and memberships on every exit, including errors.
    await snapshot.assertUnchanged();
  }
}
