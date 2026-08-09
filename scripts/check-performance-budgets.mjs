import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
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
const minimumHeadroomRatio = budgets.headroom?.totalJavaScriptMinimumRatio;
if (
  typeof minimumHeadroomRatio !== 'number' ||
  minimumHeadroomRatio <= 0 ||
  minimumHeadroomRatio >= 1
) {
  throw new Error('totalJavaScriptMinimumRatio must be between 0 and 1.');
}
const totalJavaScriptHeadroomRatio =
  (budgets.bundle.totalJavaScriptGzipBytes - measured.totalJavaScriptGzipBytes) /
  budgets.bundle.totalJavaScriptGzipBytes;
if (totalJavaScriptHeadroomRatio < minimumHeadroomRatio) {
  failures.push(['totalJavaScriptHeadroomRatio', Number(totalJavaScriptHeadroomRatio.toFixed(4))]);
}
const chunks = [...sizes.entries()]
  .map(([file, size]) => ({
    file,
    rawBytes: size.raw,
    gzipBytes: size.gzip,
    totalGzipRatio: Number((size.gzip / measured.totalJavaScriptGzipBytes).toFixed(4)),
  }))
  .sort((left, right) => right.gzipBytes - left.gzipBytes || left.file.localeCompare(right.file));
const report = {
  schemaVersion: 1,
  commitSha: process.env.APP_COMMIT_SHA?.trim() || process.env.GITHUB_SHA?.trim() || 'local',
  budgets,
  measured: { ...measured, totalJavaScriptHeadroomRatio },
  authRouteManifestEntries: [...authDependencyKeys].sort(),
  chunks,
};
const reportDirectory = join(root, 'performance-report');
await mkdir(reportDirectory, { recursive: true });
await writeFile(
  join(reportDirectory, 'bundle-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.table(
  Object.fromEntries(
    Object.entries(measured).map(([name, value]) => [
      name,
      { measured: value, budget: budgets.bundle[name] },
    ]),
  ),
);
console.log(
  `Total JavaScript headroom: ${(totalJavaScriptHeadroomRatio * 100).toFixed(2)}% (minimum ${(minimumHeadroomRatio * 100).toFixed(0)}%).`,
);
console.table(chunks.slice(0, 10));
console.log('Chunk report written to performance-report/bundle-report.json.');
console.log(`Auth route isolation passed: ${authDependencyKeys.size} manifest entries.`);
if (process.argv.includes('--auth-route-only')) process.exit(0);
if (failures.length) {
  throw new Error(
    `Performance budget exceeded: ${failures.map(([name, value]) => `${name}=${value}`).join(', ')}`,
  );
}
