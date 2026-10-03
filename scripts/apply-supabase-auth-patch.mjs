import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const authVersion = '2.117.2';
const authPath = 'node_modules/@supabase/auth-js';
const targets = ['dist/main/lib/locks.js', 'dist/module/lib/locks.js'];

/** Read only the two single-hunk patches reviewed for this exact SDK version. */
function readChanges(root) {
  const patch = readFileSync(
    path.join(root, 'patches', `@supabase+auth-js+${authVersion}.patch`),
    'utf8',
  );
  const [preamble, ...sections] = patch.trimEnd().split(/^diff --git /m);
  if (preamble !== '' || sections.length !== targets.length) {
    throw new Error('Supabase Auth patch must contain exactly the two reviewed lock files.');
  }

  return sections.map((section, index) => {
    const target = `${authPath}/${targets[index]}`;
    const [header, hash, beforePath, afterPath, hunk, ...lines] = section.trimEnd().split('\n');
    const counts = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@.*$/.exec(hunk);
    if (
      header !== `a/${target} b/${target}` ||
      !/^index [\da-f]+\.\.[\da-f]+ 100644$/.test(hash) ||
      beforePath !== `--- a/${target}` ||
      afterPath !== `+++ b/${target}` ||
      !counts ||
      counts[1] !== counts[3] ||
      !lines.every((line) => /^[ +\-]/.test(line)) ||
      !lines.some((line) => line.startsWith('-')) ||
      !lines.some((line) => line.startsWith('+'))
    ) {
      throw new Error(`Unsupported Supabase Auth patch format for ${target}.`);
    }

    const before = lines.filter((line) => !line.startsWith('+')).map((line) => line.slice(1));
    const after = lines.filter((line) => !line.startsWith('-')).map((line) => line.slice(1));
    if (before.length !== Number(counts[2]) || after.length !== Number(counts[4])) {
      throw new Error(`Supabase Auth patch line counts do not match for ${target}.`);
    }
    return { target, before: `${before.join('\n')}\n`, after: `${after.join('\n')}\n` };
  });
}

/** Validate both files before writing either; reapplying an intact patch is safe. */
export function applySupabaseAuthPatch(root) {
  const manifest = JSON.parse(readFileSync(path.join(root, authPath, 'package.json'), 'utf8'));
  if (manifest.name !== '@supabase/auth-js' || manifest.version !== authVersion) {
    throw new Error(`Supabase Auth patch requires @supabase/auth-js@${authVersion}.`);
  }

  const changes = readChanges(root).map(({ target, before, after }) => {
    const file = path.join(root, target);
    const source = readFileSync(file, 'utf8');
    const beforeCount = source.split(before).length - 1;
    const afterCount = source.split(after).length - 1;
    if (beforeCount === 0 && afterCount === 1) return { file, source, changed: false };
    if (beforeCount !== 1 || afterCount !== 0) {
      throw new Error(
        `Supabase Auth patch content is missing, divergent, or ambiguous: ${target}.`,
      );
    }
    return { file, source: source.replace(before, after), changed: true };
  });

  for (const { file, source, changed } of changes) {
    if (changed) writeFileSync(file, source);
  }
  return changes.filter(({ changed }) => changed).length;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const changed = applySupabaseAuthPatch(root);
  console.log(`Supabase Auth ${authVersion} storage patch verified (${changed} files updated).`);
}
