import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describeArgument, isDirectExecution } from './lib/critical-command.mjs';
import { createLocalDatabaseTypesGenerator } from './lib/database-types.mjs';

/**
 * Generate and format before writing so a failed tool leaves tracked types intact.
 * @param {string[]} argv
 * @param {import('./lib/critical-command.mjs').LocalCommandDependencies} dependencies
 */
export function generateDatabaseTypes(argv = process.argv.slice(2), dependencies = {}) {
  const { stdout = process.stdout } = dependencies;
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    stdout.write(
      'Usage: npm run database -- types generate\nGenerate types from the local schema.\n',
    );
    return;
  }
  if (argv.length > 0)
    throw new Error(`Unknown database types generation option: ${describeArgument(argv[0])}`);
  const generator = createLocalDatabaseTypesGenerator(dependencies);
  const formattedSource = generator.generate() ?? '';
  if (!formattedSource.trim()) throw new Error('Formatting returned no database types.');
  writeFileSync(path.join(generator.root, 'src/types/database.ts'), formattedSource);
  stdout.write(`Database types generated from local ${generator.target}.\n`);
}

if (isDirectExecution(import.meta.url)) {
  try {
    generateDatabaseTypes();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error.exitCode ?? 1;
  }
}
