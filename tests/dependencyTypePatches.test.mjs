import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDependencyTypePatches,
  dependencyTypePatches,
} from '../scripts/lib/dependency-type-patches.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'lolrogue-declaration-patches-'));
  directories.push(directory);
  const files = dependencyTypePatches.flatMap((patch) => {
    const installed = path.join(root, 'node_modules', patch.package);
    const targetDirectory = path.join(directory, 'node_modules', patch.package);
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(
      path.join(targetDirectory, 'package.json'),
      readFileSync(path.join(installed, 'package.json')),
    );
    return patch.targets.map((target) => {
      const original = readFileSync(path.join(installed, target), 'utf8').replaceAll(
        patch.after,
        patch.before,
      );
      const file = path.join(targetDirectory, target);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, original);
      return { file, original, patched: original.replaceAll(patch.before, patch.after) };
    });
  });
  return { directory, files };
}

describe('reviewed dependency declaration corrections', () => {
  it('preserves SDK credential serialization and corrects both React module formats idempotently', () => {
    const { directory, files } = fixture();
    expect(applyDependencyTypePatches(directory)).toBe(4);
    for (const file of files) expect(readFileSync(file.file, 'utf8')).toBe(file.patched);
    expect(applyDependencyTypePatches(directory)).toBe(0);
  });

  it.each(['content', 'version', 'missing'])(
    'rejects unexpected %s in the last package before writing the first',
    (condition) => {
      const { directory, files } = fixture();
      const last = files.at(-1);
      if (condition === 'content') writeFileSync(last.file, `${last.original}\n// changed\n`);
      if (condition === 'missing') rmSync(last.file);
      if (condition === 'version') {
        writeFileSync(
          path.join(directory, 'node_modules/@vercel/speed-insights/package.json'),
          JSON.stringify({ name: '@vercel/speed-insights', version: '2.0.1' }),
        );
      }
      expect(() => applyDependencyTypePatches(directory)).toThrow();
      expect(readFileSync(files[0].file, 'utf8')).toBe(files[0].original);
    },
  );
});
