import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDirectExecution } from './lib/critical-command.mjs';
import { formatWithPinnedBiome } from './lib/pinned-biome-format.mjs';
import {
  checkScriptInventory,
  EQUIVALENCE_PATH,
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
    outputs[EQUIVALENCE_PATH] = await formatWithPinnedBiome({
      root: resolve(import.meta.dirname, '..'),
      source: outputs[EQUIVALENCE_PATH],
      stdinFilePath: EQUIVALENCE_PATH,
      label: 'Script inventory',
    });
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

if (isDirectExecution(import.meta.url)) {
  process.exitCode = await runScriptInventory();
}
