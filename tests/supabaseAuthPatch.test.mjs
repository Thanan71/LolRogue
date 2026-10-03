import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { applySupabaseAuthPatch } from '../scripts/apply-supabase-auth-patch.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const patchName = '@supabase+auth-js+2.117.2.patch';
const patch = readFileSync(path.join(root, 'patches', patchName), 'utf8');
const temporaryRoots = [];

afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'lolrogue-auth-patch-'));
  temporaryRoots.push(directory);
  const auth = path.join(directory, 'node_modules', '@supabase', 'auth-js');
  mkdirSync(auth, { recursive: true });
  const manifest = path.join(auth, 'package.json');
  writeFileSync(manifest, JSON.stringify({ name: '@supabase/auth-js', version: '2.117.2' }));
  mkdirSync(path.join(directory, 'patches'));
  const patchFile = path.join(directory, 'patches', patchName);
  writeFileSync(patchFile, patch);

  // Synthetic SDK files use the reviewed diff as fixtures, surrounded by unrelated bytes.
  const files = patch
    .trimEnd()
    .split(/^diff --git /m)
    .slice(1)
    .map((section) => {
      const lines = section.trimEnd().split('\n');
      const file = path.join(directory, lines[3].slice('+++ b/'.length));
      const body = lines.slice(5);
      const before = body.filter((line) => line[0] !== '+').map((line) => line.slice(1));
      const after = body.filter((line) => line[0] !== '-').map((line) => line.slice(1));
      const original = `// untouched prefix\n${before.join('\n')}\n// untouched suffix\n`;
      const expected = `// untouched prefix\n${after.join('\n')}\n// untouched suffix\n`;
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, original);
      return { file, original, expected };
    });
  return { directory, files, manifest, patchFile };
}

describe('Supabase Auth postinstall patch', () => {
  it('applies both reviewed hunks exactly and is idempotent', () => {
    const { directory, files } = fixture();
    expect(applySupabaseAuthPatch(directory)).toBe(2);
    for (const { file, expected } of files) expect(readFileSync(file, 'utf8')).toBe(expected);
    expect(applySupabaseAuthPatch(directory)).toBe(0);
    for (const { file, expected } of files) expect(readFileSync(file, 'utf8')).toBe(expected);
  });

  it('completes an installation with one already patched distribution', () => {
    const { directory, files } = fixture();
    writeFileSync(files[0].file, files[0].expected);
    expect(applySupabaseAuthPatch(directory)).toBe(1);
    for (const { file, expected } of files) expect(readFileSync(file, 'utf8')).toBe(expected);
  });

  it('rejects another SDK version before writing either distribution', () => {
    const { directory, files, manifest } = fixture();
    writeFileSync(manifest, JSON.stringify({ name: '@supabase/auth-js', version: '2.117.3' }));
    expect(() => applySupabaseAuthPatch(directory)).toThrow('requires @supabase/auth-js@2.117.2');
    for (const { file, original } of files) expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it.each(['missing', 'divergent', 'duplicate', 'mixed'])(
    'rejects a %s second distribution before changing the first',
    (condition) => {
      const { directory, files } = fixture();
      const { file, original, expected } = files[1];
      if (condition === 'missing') rmSync(file);
      if (condition === 'divergent') writeFileSync(file, original.replace('debug:', 'changed:'));
      if (condition === 'duplicate') writeFileSync(file, original + original);
      if (condition === 'mixed') writeFileSync(file, original + expected);
      expect(() => applySupabaseAuthPatch(directory)).toThrow();
      expect(readFileSync(files[0].file, 'utf8')).toBe(files[0].original);
    },
  );

  it.each([
    ['unexpected path', (content) => content.replaceAll('dist/module/lib/locks.js', '../other.js')],
    ['extra file', (content) => content + content],
    ['incorrect counts', (content) => content.replace('@@ -21,10 +21,17 @@', '@@ -21,9 +21,17 @@')],
    ['extra hunk', (content) => content.replace('+    debug:', '@@ -1,1 +1,1 @@\n+    debug:')],
  ])('rejects a patch with %s before writing files', (_name, mutate) => {
    const { directory, files, patchFile } = fixture();
    writeFileSync(patchFile, mutate(patch));
    expect(() => applySupabaseAuthPatch(directory)).toThrow();
    for (const { file, original } of files) expect(readFileSync(file, 'utf8')).toBe(original);
  });

  it('returns a failing CLI exit status for a missing target', () => {
    const { directory, files } = fixture();
    const scripts = path.join(directory, 'scripts');
    mkdirSync(scripts);
    const script = path.join(scripts, 'apply-supabase-auth-patch.mjs');
    copyFileSync(path.join(root, 'scripts', 'apply-supabase-auth-patch.mjs'), script);
    rmSync(files[1].file);
    const result = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ENOENT');
    expect(readFileSync(files[0].file, 'utf8')).toBe(files[0].original);
  });
});
