import { readFile, readdir, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const budgets = JSON.parse(await readFile(join(root, 'config/performance-budgets.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(dist, '.vite/manifest.json'), 'utf8'));

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(target)));
    else result.push(target);
  }
  return result;
}

const allFiles = await files(dist);
const jsFiles = allFiles.filter((file) => extname(file) === '.js');
const sizes = new Map();
for (const file of jsFiles) {
  const bytes = await readFile(file);
  sizes.set(relative(dist, file), { raw: bytes.length, gzip: gzipSync(bytes).length });
}

function dependencyFiles(key, seen = new Set()) {
  if (!key || seen.has(key)) return seen;
  seen.add(key);
  for (const imported of manifest[key]?.imports ?? []) dependencyFiles(imported, seen);
  return seen;
}

function gzipForManifestEntries(keys) {
  const files = new Set();
  for (const key of keys) {
    for (const dependency of dependencyFiles(key)) {
      const file = manifest[dependency]?.file;
      if (file?.endsWith('.js')) files.add(file);
    }
  }
  return [...files].reduce((total, file) => total + (sizes.get(file)?.gzip ?? 0), 0);
}

const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
const authKey = Object.keys(manifest).find((key) => key.endsWith('/AuthPage.tsx'));
const authDependencyKeys = new Set([...dependencyFiles(entryKey), ...dependencyFiles(authKey)]);
const forbiddenAuthDependencies = [
  '/AdminPage.tsx',
  '/DatabasePage.tsx',
  '/LegalPage.tsx',
  '/champions-parsed.json',
  '/champions-client.json',
];
const authLeaks = [...authDependencyKeys].filter((key) =>
  forbiddenAuthDependencies.some((dependency) => key.endsWith(dependency)),
);
if (authLeaks.length) {
  throw new Error(`Auth route imports deferred application code: ${authLeaks.join(', ')}`);
}

const measured = {
  totalJavaScriptGzipBytes: [...sizes.values()].reduce((sum, size) => sum + size.gzip, 0),
  largestJavaScriptRawBytes: Math.max(...[...sizes.values()].map((size) => size.raw)),
  initialJavaScriptGzipBytes: gzipForManifestEntries([entryKey]),
  authRouteJavaScriptGzipBytes: gzipForManifestEntries([entryKey, authKey]),
  deployableAssetBytes: (await Promise.all(allFiles.map((file) => stat(file)))).reduce(
    (sum, metadata) => sum + metadata.size,
    0,
  ),
};

const failures = Object.entries(measured).filter(([name, value]) => value > budgets.bundle[name]);
console.table(
  Object.fromEntries(
    Object.entries(measured).map(([name, value]) => [
      name,
      { measured: value, budget: budgets.bundle[name] },
    ]),
  ),
);
console.log(`Auth route isolation passed: ${authDependencyKeys.size} manifest entries.`);
if (process.argv.includes('--auth-route-only')) process.exit(0);
if (failures.length) {
  throw new Error(
    `Performance budget exceeded: ${failures.map(([name, value]) => `${name}=${value}`).join(', ')}`,
  );
}
