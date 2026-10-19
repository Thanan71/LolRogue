import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describeArgument, isDirectExecution } from './lib/critical-command.mjs';
import { createLocalDatabaseTypesGenerator } from './lib/database-types.mjs';

/**
 * Generate and format in memory: a failing comparison never overwrites tracked types.
 * @param {string[]} argv
 * @param {import('./lib/critical-command.mjs').LocalCommandDependencies} dependencies
 */
export function checkDatabaseTypes(argv = process.argv.slice(2), dependencies = {}) {
  const { stdout = process.stdout } = dependencies;
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    stdout.write(
      'Usage: npm run database -- types check\nCompares the local schema with tracked types without writing files.\n',
    );
    return;
  }
  if (argv.length > 0)
    throw new Error(`Unknown database types check option: ${describeArgument(argv[0])}`);
  const generator = createLocalDatabaseTypesGenerator(dependencies);
  const expected = readFileSync(path.join(generator.root, 'src/types/database.ts'), 'utf8');
  if (generator.generate() !== expected) {
    throw new Error(
      'Database types differ from the local schema. Run npm run database -- types generate to regenerate src/types/database.ts, then review the diff.',
    );
  }
  stdout.write(
    `Database types match local ${generator.target}; tracked files were not modified.\n`,
  );
}

if (isDirectExecution(import.meta.url)) {
  try {
    checkDatabaseTypes();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
