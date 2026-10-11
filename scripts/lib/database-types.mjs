import { spawnSync } from 'node:child_process';
import {
  localDatabaseTarget,
  repositoryRoot,
  requireNode24,
  requirePinnedCli,
  requireSuccessfulCommand,
} from './critical-command.mjs';
import { assertLocalDatabaseEnvironment, supabaseEnvironment } from './remote-operation.mjs';

/**
 * Complete the local tool preflight before the caller reads or writes tracked types.
 * Generation and formatting stay in memory; only the caller decides whether to write.
 * @param {import('./critical-command.mjs').LocalCommandDependencies} dependencies
 */
export function createLocalDatabaseTypesGenerator(dependencies = {}) {
  const {
    root = repositoryRoot,
    runCommand = spawnSync,
    requireTool = requirePinnedCli,
    assertNode = requireNode24,
    stderr = process.stderr,
  } = dependencies;
  assertNode();
  assertLocalDatabaseEnvironment(process.env, root);
  const target = localDatabaseTarget(root);
  const supabase = requireTool('supabase', 'supabase', root);
  const biome = requireTool('biome', '@biomejs/biome', root);
  /** @type {import('node:child_process').SpawnSyncOptionsWithStringEncoding} */
  const options = {
    cwd: root,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    env: supabaseEnvironment(),
  };
  return {
    root,
    target,
    generate() {
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
      return formatted.stdout?.toString('utf8');
    },
  };
}
