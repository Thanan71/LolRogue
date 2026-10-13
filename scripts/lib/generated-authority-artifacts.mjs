import { build } from 'esbuild-authority';
import {
  AUTHORITY_RESOLVER_PATH,
  CLIENT_CAPABILITIES_PATH,
  renderAuthorityResolver,
  renderClientCapabilities,
} from '../generate-authority-resolver.mjs';
import { artifactPath, sha256 } from './artifact-snapshot.mjs';
import { validateAuthorityVersionRegistry } from './authority-version-registry.mjs';

export async function checkAuthorityArtifacts(snapshot, root, { buildSource = build } = {}) {
  const registry = validateAuthorityVersionRegistry(
    await snapshot.json('config/authority-versions.json'),
  );
  const current = registry.versions.find(({ status }) => status === 'current');
  const actualBundles = [
    ...(await snapshot.list('supabase/functions/verify-run')),
    ...(await snapshot.list('supabase/authority-archive')),
  ]
    .filter((file) => /\.bundle\.(?:js|ts)$/.test(file))
    .sort();
  if (
    JSON.stringify(actualBundles) !==
    JSON.stringify(registry.versions.map(({ bundle }) => bundle).sort())
  ) {
    throw new Error(
      'Generated artifacts: authority bundle inventory differs from the registry. No archive may be deleted or silently added.',
    );
  }
  for (const [file, expected] of [
    [AUTHORITY_RESOLVER_PATH, renderAuthorityResolver(registry)],
    [CLIENT_CAPABILITIES_PATH, renderClientCapabilities(registry)],
  ]) {
    if ((await snapshot.read(file)).toString('utf8') !== expected) {
      throw new Error(`Generated artifacts: stale ${file}. Run npm run authority:generate.`);
    }
  }
  const recorded = (await snapshot.json('tests/fixtures/engine-refactor-contract.json')).bundles;
  const protectedByEngine = new Map(recorded.map((entry) => [entry.engine, entry]));
  if (protectedByEngine.size !== recorded.length) {
    throw new Error('Generated artifacts: duplicate historical authority baseline identity.');
  }
  for (const frozen of recorded) {
    if (!registry.versions.some(({ engine }) => engine === frozen.engine)) {
      throw new Error(
        `Generated artifacts: published historical engine is missing from the registry: ${frozen.engine}.`,
      );
    }
  }
  for (const version of registry.versions) {
    const bytes = await snapshot.read(artifactPath(version.bundle));
    const source = bytes.toString('utf8').replace(/^\/\/ @ts-nocheck\r?\n/, '');
    const declaration = source.match(/AUTHORITY_CONTENT_HASH\s*=\s*["']([a-f0-9]{64})["']/);
    if (
      declaration?.[1] !== version.contentHash ||
      sha256(source.replace(version.contentHash, '<AUTHORITY_CONTENT_HASH>')) !==
        version.contentHash
    ) {
      throw new Error(
        `Generated artifacts: authority content hash mismatch: ${version.engine}. Historical hashes must never be recalculated.`,
      );
    }
    if (version.status !== 'current') {
      const frozen = protectedByEngine.get(version.engine);
      if (
        !frozen ||
        frozen.contentHash !== version.contentHash ||
        frozen.bytes !== bytes.length ||
        frozen.sha256 !== sha256(bytes)
      ) {
        throw new Error(
          `Generated artifacts: frozen authority bytes changed or lack a reviewed baseline: ${version.engine}.`,
        );
      }
    }
    const migration = (await snapshot.read(artifactPath(version.migration))).toString('utf8');
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const metadata = new RegExp(
      `${version.gameplay},\\s*['"]${escape(version.rulesetCode)}['"],\\s*['"]${escape(version.engine)}['"],\\s*${version.command},\\s*['"]${version.contentHash}['"]`,
    );
    if (!metadata.test(migration)) {
      throw new Error(
        `Generated artifacts: published migration identity differs from the registry: ${version.engine}.`,
      );
    }
  }
  // Capture local inputs before compilation, including RNG/config dependencies
  // outside src/game. Reading only metafile inputs afterwards misses races.
  const inputs = await snapshot.list('src');
  for (const file of inputs) await snapshot.read(file);
  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json'])
    await snapshot.read(file);
  const result = await buildSource({
    absWorkingDir: root,
    entryPoints: ['src/game/authority/index.ts'],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
    minifyWhitespace: true,
    minifySyntax: true,
    minifyIdentifiers: false,
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
    metafile: true,
  });
  const expected = result.outputFiles[0].contents;
  if (sha256(expected) !== sha256(await snapshot.read(current.bundle))) {
    throw new Error(
      `Generated artifacts: current authority bundle is stale: ${current.engine}. Review source versioning before npm run release -- edge bundle.`,
    );
  }
  for (const input of Object.keys(result.metafile.inputs)) {
    artifactPath(input);
    await snapshot.read(input);
  }
  return registry.versions.length;
}
