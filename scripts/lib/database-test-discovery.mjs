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
  const missingRequiredFiles = (contract.requiredFiles ?? []).filter(
    (path) => !tests.includes(path),
  );
  if (missingRequiredFiles.length > 0) {
    throw new Error(
      `Required database tests were not discovered: ${missingRequiredFiles.join(', ')}`,
    );
  }
  return tests;
}

const skippedTestPattern =
  /\b(?:describe|it|test)\.(?:skip|skipIf|todo|todoIf)\b|\b(?:xdescribe|xit|xtest)\s*\(/;

function skipKey(file, expression) {
  return `${file}\0${expression}`;
}

export function assertDatabaseTestSkipPolicy(
  root = repositoryRoot,
  tests = discoverDatabaseTests(root),
  contract = loadDatabaseTestContract(),
) {
  const allowlist = contract.skipAllowlist ?? [];
  const allowed = new Set(
    allowlist.map(({ file, expression, reason }) => {
      if (!file || !expression || !reason) {
        throw new Error(
          'Every database test skip allowlist entry needs file, expression and reason.',
        );
      }
      return skipKey(file, expression);
    }),
  );
  if (allowed.size !== allowlist.length) {
    throw new Error('The database test skip allowlist contains duplicate entries.');
  }

  const observed = new Set();
  const unexpected = [];
  for (const file of tests) {
    for (const [index, sourceLine] of readFileSync(resolve(root, file), 'utf8')
      .split('\n')
      .entries()) {
      const expression = sourceLine.trim();
      if (!skippedTestPattern.test(expression)) continue;
      const key = skipKey(file, expression);
      observed.add(key);
      if (!allowed.has(key)) unexpected.push(`${file}:${index + 1}: ${expression}`);
    }
  }

  const stale = allowlist.filter(
    ({ file, expression }) => !observed.has(skipKey(file, expression)),
  );
  if (unexpected.length > 0 || stale.length > 0) {
    const details = [
      ...unexpected.map((entry) => `Unallowlisted skipped DB test: ${entry}`),
      ...stale.map(
        ({ file, expression }) => `Stale skipped DB test allowlist entry: ${file}: ${expression}`,
      ),
    ];
    throw new Error(details.join('\n'));
  }
}
