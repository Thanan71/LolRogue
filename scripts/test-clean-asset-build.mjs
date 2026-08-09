import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lolrogue-clean-assets-'));
const projectDir = path.join(tempRoot, 'project');

const rootFiles = new Set([
  'biome.json',
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vercel.json',
  'vite.config.ts',
]);
const includedDirectories = [
  'config/',
  'src/',
  'public/',
  'scripts/',
  'supabase/authority-archive/',
  'supabase/functions/verify-run/',
  'supabase/migrations/',
];

try {
  await fs.mkdir(projectDir, { recursive: true });
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: rootDir },
  );
  const files = output
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter(
      (file) =>
        rootFiles.has(file) || includedDirectories.some((directory) => file.startsWith(directory)),
    )
    .filter((file) => !file.startsWith('public/lol/data/'));

  for (const file of files) {
    const source = path.join(rootDir, file);
    const destination = path.join(projectDir, file);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
  await fs.symlink(path.join(rootDir, 'node_modules'), path.join(projectDir, 'node_modules'));

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: projectDir,
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
  });
  if (build.status !== 0) {
    process.stdout.write(build.stdout);
    process.stderr.write(build.stderr);
    throw new Error(`Clean asset build failed with exit code ${build.status}.`);
  }
  console.log(`Clean asset build passed with ${files.length} repository files.`);
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
