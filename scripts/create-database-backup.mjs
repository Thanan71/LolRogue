import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  CommandFailure,
  describeArgument,
  isDirectExecution,
  repositoryRoot,
  requireNode24,
  requirePinnedCli,
} from './lib/critical-command.mjs';
import { resolveBackupSource, supabaseEnvironment } from './lib/remote-operation.mjs';

const execFileAsync = promisify(execFile);

/** @param {string[]} argv @param {import('./lib/remote-operation.mjs').RemoteContext} dependencies */
export async function createDatabaseBackup(argv = process.argv.slice(2), dependencies = {}) {
  const root = dependencies.root ?? repositoryRoot;
  const env = dependencies.env ?? process.env;
  const seen = new Set();
  let projectRef;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (seen.has(argument))
      throw new Error('A database backup option was specified more than once.');
    seen.add(argument);
    if (argument === '--project-ref') {
      projectRef = argv[++index];
      if (!projectRef || projectRef.startsWith('-'))
        throw new Error('--project-ref requires a value.');
    } else if (!['--local', '--dry-run', '--help', '-h'].includes(argument))
      throw new Error(`Unknown database backup option: ${describeArgument(argument)}`);
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      'Usage: npm run release -- backup (--local | --project-ref <approved-ref>) [--dry-run]\nRequires SUPABASE_DB_URL. Dumps database files without changing the source database.',
    );
    return;
  }
  requireNode24();
  const supabase = requirePinnedCli('supabase', 'supabase', root);
  const databaseUrl = env.SUPABASE_DB_URL;
  const outputDirectory = path.resolve(root, env.BACKUP_DIRECTORY ?? 'database-backup');

  const local = argv.includes('--local');
  const validateTarget = () =>
    resolveBackupSource({ projectRef, local }, { ...dependencies, root, env });
  const source = validateTarget();
  if (argv.includes('--dry-run')) {
    console.log(
      `[backup:database] dry-run: read ${source.hostname}:${source.port || '5432'}; write roles.sql, schema.sql, data.sql and checksums in ${outputDirectory}.`,
    );
    return;
  }

  await mkdir(outputDirectory, { recursive: true });

  const dump = async (argumentsList) => {
    validateTarget();
    try {
      await execFileAsync(supabase, ['db', 'dump', '--db-url', databaseUrl, ...argumentsList], {
        cwd: root,
        env: { ...supabaseEnvironment(env), CI: 'true' },
        maxBuffer: 1024 * 1024 * 10,
      });
    } catch (error) {
      // execFile errors contain their full command, including database credentials.
      // Preserve failure status without exposing that command or raw CLI output.
      throw new CommandFailure('Database backup dump', {
        status: typeof error.code === 'number' ? error.code : 1,
        signal: error.signal,
      });
    }
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
}

if (isDirectExecution(import.meta.url)) {
  try {
    await createDatabaseBackup();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
