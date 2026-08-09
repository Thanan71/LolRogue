import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const contractPath = resolve(repositoryRoot, 'config/database-tests.json');

export function loadDatabaseTestContract() {
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  if (
    contract.version !== 1 ||
    typeof contract.root !== 'string' ||
    !contract.fileSuffix?.startsWith('.')
  ) {
    throw new Error('config/database-tests.json does not define a supported test convention.');
  }
  return contract;
}

function walkDatabaseTests(directory, fileSuffix) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return walkDatabaseTests(path, fileSuffix);
    return entry.isFile() && entry.name.endsWith(fileSuffix) ? [path] : [];
  });
}

export function discoverDatabaseTests(
  root = repositoryRoot,
  contract = loadDatabaseTestContract(),
) {
  const tests = walkDatabaseTests(resolve(root, contract.root), contract.fileSuffix)
    .map((path) => relative(root, path).split(sep).join('/'))
    .sort();
  if (tests.length === 0) {
    throw new Error(`No *${contract.fileSuffix} files were discovered under ${contract.root}.`);
  }
  return tests;
}
