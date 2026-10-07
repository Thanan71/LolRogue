import { spawnSync } from 'node:child_process';

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['scripts/check-authority-registry.mjs']);
run(['scripts/check-current-authority-source.mjs']);
run([
  'node_modules/vitest/vitest.mjs',
  'run',
  'tests/contentSupportGate.test.ts',
  'tests/combatContentSupport.test.ts',
  'tests/combatRules.test.ts',
  'tests/encounterResolver.test.ts',
  'tests/runAuthorityVersioning.test.ts',
  'tests/i18nCatalogContract.test.ts',
  'tests/championContent.test.ts',
  'tests/inventoryContent.test.ts',
  'tests/enhancementContent.test.ts',
  'tests/encounterSourceContract.test.ts',
]);
