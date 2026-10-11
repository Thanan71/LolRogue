import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  describeArgument,
  isDirectExecution,
  localDatabaseTarget,
  repositoryRoot,
  requireNode24,
  requirePinnedCli,
  requireSuccessfulCommand,
} from './lib/critical-command.mjs';

/**
 * Generate and format in memory: a failing comparison never overwrites tracked types.
 * @param {string[]} argv
 * @param {import('./lib/critical-command.mjs').LocalCommandDependencies} dependencies
 */
export function checkDatabaseTypes(argv = process.argv.slice(2), dependencies = {}) {
  const {
    root = repositoryRoot,
    runCommand = spawnSync,
    requireTool = requirePinnedCli,
    assertNode = requireNode24,
    stdout = process.stdout,
    stderr = process.stderr,
  } = dependencies;
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    stdout.write(
      'Usage: db:types:check\nCompares the local schema with tracked types without writing files.\n',
    );
    return;
  }
  if (argv.length > 0)
    throw new Error(`Unknown database types check option: ${describeArgument(argv[0])}`);
  assertNode();
  const target = localDatabaseTarget(root);
  const supabase = requireTool('supabase', 'supabase', root);
  const biome = requireTool('biome', '@biomejs/biome', root);
  const expected = readFileSync(path.join(root, 'src/types/database.ts'), 'utf8');
  /** @type {import('node:child_process').SpawnSyncOptionsWithStringEncoding} */
  const options = {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  };
  const generated = runCommand(supabase, ['gen', 'types', 'typescript', '--local'], options);
  if (generated.stderr) stderr.write(generated.stderr);
  requireSuccessfulCommand('Supabase local types generation', generated);
  const generatedSource = generated.stdout?.toString('utf8') ?? '';
  if (!generatedSource.trim()) throw new Error('Supabase returned no database types.');
  const formatted = runCommand(biome, ['format', '--stdin-file-path=src/types/database.ts'], {
    ...options,
    input: generatedSource,
  });
  if (formatted.stderr) stderr.write(formatted.stderr);
  requireSuccessfulCommand('Database types formatting', formatted);
  if (formatted.stdout?.toString('utf8') !== expected) {
    throw new Error(
      'Database types differ from the local schema. Run npm run db:types to regenerate src/types/database.ts, then review the diff.',
    );
  }
  stdout.write(`Database types match local ${target}; tracked files were not modified.\n`);
}

if (isDirectExecution(import.meta.url)) {
  try {
    checkDatabaseTypes();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
