import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkScriptInventory,
  generateScriptInventory,
  writeScriptInventory,
} from './lib/script-inventory.mjs';

export async function runScriptInventory({
  root = process.cwd(),
  args = process.argv.slice(2),
} = {}) {
  if (args.includes('--help')) {
    console.log(
      'Usage: node scripts/generate-scripts-inventory.mjs [--check]\nGenerate deterministic npm inventory and compatibility table. --check reads without writing.',
    );
    return 0;
  }
  if (args.some((argument) => argument !== '--check') || args.length > 1) {
    console.error('Script inventory: unknown/duplicate option. Use --help or --check.');
    return 2;
  }
  try {
    const catalogPath = resolve(root, 'scripts/lib/command-catalog.mjs');
    const catalog = existsSync(catalogPath)
      ? (await import(pathToFileURL(catalogPath).href)).commandCatalog
      : [];
    const { inventory, outputs, fingerprint } = generateScriptInventory(root, { catalog });
    const stale = checkScriptInventory(root, outputs);
    if (args.includes('--check')) {
      if (stale.length) {
        console.error(
          `Script inventory is stale: ${stale.join(', ')}. Run node scripts/generate-scripts-inventory.mjs.`,
        );
        return 1;
      }
      console.log(
        `Script inventory is current (${inventory.initialCount} initial aliases, ${inventory.currentCount} current scripts).`,
      );
      return 0;
    }
    writeScriptInventory(root, outputs, { expectedFingerprint: fingerprint });
    console.log(
      `Generated script inventory (${inventory.initialCount} initial aliases, ${inventory.currentCount} current scripts).`,
    );
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runScriptInventory();
}
