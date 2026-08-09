import { writeFile } from 'node:fs/promises';

const shaPattern = /^[0-9a-f]{40}$/;
const deploymentCommitSha =
  process.env.APP_COMMIT_SHA?.trim() || process.env.VERCEL_GIT_COMMIT_SHA?.trim() || 'local';

if (deploymentCommitSha !== 'local' && !shaPattern.test(deploymentCommitSha)) {
  throw new Error('APP_COMMIT_SHA or VERCEL_GIT_COMMIT_SHA must be a full lowercase Git SHA.');
}
if (process.env.VERCEL && deploymentCommitSha === 'local') {
  throw new Error('VERCEL_GIT_COMMIT_SHA must be exposed to identify the deployed commit.');
}

await writeFile(
  new URL('../dist/deployment-identity.json', import.meta.url),
  `${JSON.stringify({ commit: deploymentCommitSha })}\n`,
  'utf8',
);

console.log(`Wrote deployment identity for ${deploymentCommitSha}.`);
