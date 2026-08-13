import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClientChampionCatalog } from './lib/client-champion-catalog.mjs';
import { IMPLEMENTED_CHAMPION_IDS, RIOT_ITEM_ASSETS } from './riot-asset-catalog.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const isDist = process.argv.includes('--dist');
const staticRoot = path.join(rootDir, isDist ? 'dist' : 'public');
const generatedRoot = path.join(rootDir, 'src', 'data', 'generated');
const manifest = JSON.parse(
  await fs.readFile(path.join(generatedRoot, 'riot-assets-manifest.json'), 'utf8'),
);
const spellManifest = JSON.parse(
  await fs.readFile(path.join(generatedRoot, 'riot-spell-assets-manifest.json'), 'utf8'),
);
const spellClientManifest = JSON.parse(
  await fs.readFile(path.join(generatedRoot, 'riot-spell-assets-client.json'), 'utf8'),
);
const versions = JSON.parse(
  await fs.readFile(path.join(scriptDir, 'ddragon-version.json'), 'utf8'),
);

function equalValues(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(entryPath)));
    else files.push(entryPath);
  }
  return files;
}

if (manifest.dataDragonVersion !== versions.dataDragon) {
  throw new Error('Riot manifest and pinned Data Dragon versions differ.');
}
if (spellManifest.dataDragonVersion !== versions.dataDragon) {
  throw new Error('Spell manifest and pinned Data Dragon versions differ.');
}
if (
  !equalValues(spellClientManifest, {
    dataDragonVersion: spellManifest.dataDragonVersion,
    spells: spellManifest.spells,
  })
) {
  throw new Error('Client spell manifest is not the deterministic compact projection.');
}
if (manifest.communityDragonVersion !== versions.communityDragon) {
  throw new Error('Riot manifest and pinned Community Dragon versions differ.');
}
if (!equalValues(manifest.implementedChampions, IMPLEMENTED_CHAMPION_IDS)) {
  throw new Error('Riot manifest implemented champion allowlist is stale.');
}
if (
  !Array.isArray(manifest.champions) ||
  manifest.champions.length === 0 ||
  new Set(manifest.champions).size !== manifest.champions.length ||
  !IMPLEMENTED_CHAMPION_IDS.every((championId) => manifest.champions.includes(championId))
) {
  throw new Error('Riot manifest shipped champion catalogue is invalid.');
}
const expectedItems = Object.fromEntries(
  RIOT_ITEM_ASSETS.map(({ appId, dataDragonId }) => [appId, dataDragonId]),
);
if (!equalValues(manifest.items, expectedItems)) {
  throw new Error('Riot manifest item allowlist is stale.');
}
if (!equalValues(spellManifest.implementedChampions, IMPLEMENTED_CHAMPION_IDS)) {
  throw new Error('Spell manifest implemented champion allowlist is stale.');
}
if (
  !spellManifest.spells ||
  !equalValues(Object.keys(spellManifest.spells), IMPLEMENTED_CHAMPION_IDS) ||
  !Object.values(spellManifest.spells).every(
    (filenames) =>
      Array.isArray(filenames) && filenames.length === 4 && new Set(filenames).size === 4,
  )
) {
  throw new Error('Riot manifest spell allowlist is stale or invalid.');
}

const expectedPaths = new Set();
const manifestedFiles = [...manifest.files, ...spellManifest.files];
for (const file of manifestedFiles) {
  if (
    typeof file.path !== 'string' ||
    file.path.startsWith('/') ||
    file.path.includes('..') ||
    !/^[a-f0-9]{64}$/.test(file.sha256)
  ) {
    throw new Error(`Unsafe or invalid manifest entry: ${JSON.stringify(file)}`);
  }
  if (expectedPaths.has(file.path)) throw new Error(`Duplicate asset path: ${file.path}`);
  expectedPaths.add(file.path);
  const bytes = await fs.readFile(path.join(staticRoot, file.path));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== file.sha256 || bytes.length !== file.bytes) {
    throw new Error(`Integrity failure for ${file.path}`);
  }
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error(`Expected a PNG asset: ${file.path}`);
  }
}
const versionedAssetRoot = path.join(staticRoot, 'assets', 'riot', manifest.dataDragonVersion);
const shippedVersions = await fs.readdir(path.join(staticRoot, 'assets', 'riot'));
if (!equalValues(shippedVersions.sort(), [manifest.dataDragonVersion])) {
  throw new Error('Riot asset package contains an unpinned Data Dragon version.');
}
const actualPaths = (await listFiles(versionedAssetRoot))
  .map((file) => path.relative(staticRoot, file).split(path.sep).join('/'))
  .sort();
const manifestedPaths = [...expectedPaths].sort();
if (!equalValues(actualPaths, manifestedPaths)) {
  throw new Error('Versioned Riot asset directory contains missing or unmanifested files.');
}

if (!isDist) {
  const championCatalogBytes = await fs.readFile(path.join(generatedRoot, 'champions-parsed.json'));
  if (
    championCatalogBytes.length !== manifest.championCatalog?.bytes ||
    createHash('sha256').update(championCatalogBytes).digest('hex') !==
      manifest.championCatalog?.sha256
  ) {
    throw new Error('Generated champion catalogue integrity failure.');
  }
  const champions = JSON.parse(championCatalogBytes.toString('utf8'));
  if (
    !equalValues(
      champions.map(({ id }) => id),
      manifest.champions,
    )
  ) {
    throw new Error('Generated and manifested champion catalogues differ.');
  }
  for (const champion of champions) {
    const assetPath = champion.iconUrl.replace(/^\//, '');
    if (!expectedPaths.has(assetPath)) {
      throw new Error(`Champion ${champion.id} references an unmanifested icon.`);
    }
    const expectedSpellFilenames = champion.spells?.map((spell) => spell.image) ?? [];
    const packagedSpellFilenames = spellManifest.spells[champion.id] ?? [];
    if (
      IMPLEMENTED_CHAMPION_IDS.includes(champion.id) &&
      !equalValues(packagedSpellFilenames, expectedSpellFilenames)
    ) {
      throw new Error(`Champion ${champion.id} spell manifest differs from its catalogue.`);
    }
    for (const filename of packagedSpellFilenames) {
      const spellAssetPath = `assets/riot/${manifest.dataDragonVersion}/spells/${filename}`;
      if (!expectedPaths.has(spellAssetPath)) {
        throw new Error(`Champion ${champion.id} references an unmanifested spell icon.`);
      }
    }
  }
  const clientCatalogBytes = await fs.readFile(path.join(generatedRoot, 'champions-client.json'));
  const clientChampions = JSON.parse(clientCatalogBytes.toString('utf8'));
  if (!equalValues(clientChampions, createClientChampionCatalog(champions))) {
    throw new Error('Client champion catalogue is not the deterministic compact projection.');
  }
}

console.log(
  `Verified ${manifestedFiles.length} Riot assets in ${isDist ? 'dist' : 'public'} (${manifest.dataDragonVersion}).`,
);
