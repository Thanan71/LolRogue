import { createTestOrderSeeds } from './lib/test-order-seeds.mjs';

try {
  if (process.argv.length > 3) throw new Error('Expected one optional comma-separated seed list.');
  process.stdout.write(`${JSON.stringify(createTestOrderSeeds(process.argv[2]))}\n`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
