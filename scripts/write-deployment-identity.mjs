import { writeFile } from 'node:fs/promises';
import { resolveDeploymentCommitSha } from './lib/environment-config.mjs';

const deploymentCommitSha = resolveDeploymentCommitSha();

await writeFile(
  new URL('../dist/deployment-identity.json', import.meta.url),
  `${JSON.stringify({ commit: deploymentCommitSha })}\n`,
  'utf8',
);

console.log(`Wrote deployment identity for ${deploymentCommitSha}.`);
