import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUPABASE_DB_URL;
const outputDirectory = path.resolve(process.env.BACKUP_DIRECTORY ?? 'database-backup');

if (!databaseUrl) {
  throw new Error('SUPABASE_DB_URL is required.');
}

await mkdir(outputDirectory, { recursive: true });

const dump = async (argumentsList) => {
  await execFileAsync(
    'npx',
    ['supabase', 'db', 'dump', '--db-url', databaseUrl, ...argumentsList],
    {
      env: { ...process.env, CI: 'true' },
      maxBuffer: 1024 * 1024 * 10,
    },
  );
};

await dump(['--role-only', '--file', path.join(outputDirectory, 'roles.sql')]);
await dump(['--file', path.join(outputDirectory, 'schema.sql')]);
await dump([
  '--data-only',
  '--use-copy',
  '--exclude',
  'storage.buckets_vectors',
  '--exclude',
  'storage.vector_indexes',
  '--file',
  path.join(outputDirectory, 'data.sql'),
]);

const fileNames = ['roles.sql', 'schema.sql', 'data.sql'];
const manifest = [];
for (const fileName of fileNames) {
  const filePath = path.join(outputDirectory, fileName);
  const fileStats = await stat(filePath);
  if (fileStats.size === 0) {
    throw new Error(`Backup file is empty: ${fileName}`);
  }
  const contents = await readFile(filePath);
  manifest.push({
    file: fileName,
    bytes: fileStats.size,
    sha256: createHash('sha256').update(contents).digest('hex'),
  });
}

const checksums = manifest.map(({ sha256, file }) => `${sha256}  ${file}`).join('\n') + '\n';
await writeFile(path.join(outputDirectory, 'SHA256SUMS'), checksums);
await writeFile(
  path.join(outputDirectory, 'backup-manifest.json'),
  `${JSON.stringify({ createdAt: new Date().toISOString(), files: manifest }, null, 2)}\n`,
);

console.log(`Database backup created in ${outputDirectory}.`);
