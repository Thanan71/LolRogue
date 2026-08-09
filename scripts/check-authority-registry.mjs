import { readFile } from 'node:fs/promises';
import {
  AUTHORITY_RESOLVER_PATH,
  CLIENT_CAPABILITIES_PATH,
  renderAuthorityResolver,
  renderClientCapabilities,
} from './generate-authority-resolver.mjs';
import { readAuthorityVersionRegistry } from './lib/authority-version-registry.mjs';

const registry = await readAuthorityVersionRegistry();
const generated = await readFile(AUTHORITY_RESOLVER_PATH, 'utf8').catch(() => '');
const expected = renderAuthorityResolver(registry);
const generatedClientCapabilities = await readFile(CLIENT_CAPABILITIES_PATH, 'utf8').catch(
  () => '',
);
const expectedClientCapabilities = renderClientCapabilities(registry);

if (generated !== expected || generatedClientCapabilities !== expectedClientCapabilities) {
  throw new Error(
    'The generated authority resolver is stale. Run `npm run authority:generate` and commit it.',
  );
}

const current = registry.versions.find((version) => version.status === 'current');
const engine = await readFile('src/game/authority/AuthorityRunEngine.ts', 'utf8');
if (
  !engine.includes(`AUTHORITY_ENGINE_VERSION = '${current.engine}'`) ||
  !engine.includes(`'${current.contentHash}'`)
) {
  throw new Error('The current authority engine declarations do not match the registry.');
}

console.log(
  `Authority registry is valid (${registry.versions.length} versions, current ${current.engine}).`,
);
