import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertNodeVersionContract } from './lib/node-version-contract.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
const packageJson = readJson('package.json');
const packageLock = readJson('package-lock.json');
const workflowsDirectory = resolve(repositoryRoot, '.github/workflows');
const workflows = readdirSync(workflowsDirectory)
  .filter((path) => /\.ya?ml$/.test(path))
  .map((path) => ({
    path: `.github/workflows/${path}`,
    content: readFileSync(resolve(workflowsDirectory, path), 'utf8'),
  }));

const { runtimeMajor, workflowCount } = assertNodeVersionContract({
  nvmrc: readFileSync(resolve(repositoryRoot, '.nvmrc'), 'utf8'),
  nodeEngine: packageJson.engines?.node,
  nodeTypes: packageJson.devDependencies?.['@types/node'],
  lockedNodeTypes: packageLock.packages?.['node_modules/@types/node']?.version,
  workflows,
});

process.stdout.write(
  `Node version contract verified on major ${runtimeMajor} across runtime, types and ${workflowCount} workflow declarations.\n`,
);
