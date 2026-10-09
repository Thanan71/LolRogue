import { execFileSync } from 'node:child_process';
import { appendFile, cp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { packageBuildArtifact, verifyBuildArtifact } from './lib/ci-build-artifact.mjs';

const root = resolve(import.meta.dirname, '..');
const artifactRoot = join(root, 'ci-build');
const command = process.argv[2];
const identity = {
  commit: process.env.GITHUB_SHA,
  repository: process.env.GITHUB_REPOSITORY,
  runId: process.env.GITHUB_RUN_ID,
  runAttempt:
    command === 'restore'
      ? process.env.CI_BUILD_PRODUCER_RUN_ATTEMPT
      : process.env.GITHUB_RUN_ATTEMPT,
  profile: 'production',
};
const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (checkoutSha !== identity.commit)
  throw new Error('Checkout SHA differs from expected workflow SHA.');

if (command === 'pack') {
  execFileSync('git', ['diff', '--quiet', 'HEAD'], { cwd: root });
  const publicKey = await packageBuildArtifact(join(root, 'dist'), artifactRoot, identity);
  if (!process.env.GITHUB_OUTPUT)
    throw new Error('Packing a CI build requires the producer output channel.');
  await appendFile(process.env.GITHUB_OUTPUT, `public-key=${publicKey}\n`);
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `producer-run-attempt=${identity.runAttempt}\n`,
  );
  console.log(`Signed production build for ${identity.commit}.`);
} else if (command === 'restore') {
  await verifyBuildArtifact(artifactRoot, identity, process.env.CI_BUILD_PUBLIC_KEY);
  await rm(join(root, 'dist'), { recursive: true, force: true });
  await cp(join(artifactRoot, 'dist'), join(root, 'dist'), { recursive: true });
  console.log(`Verified and restored production build for ${identity.commit}.`);
} else throw new Error('Usage: node scripts/ci-build-artifact.mjs pack|restore');
