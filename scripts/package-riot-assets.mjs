import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClientChampionCatalog } from './lib/client-champion-catalog.mjs';
import { IMPLEMENTED_CHAMPION_IDS, RIOT_ITEM_ASSETS } from './riot-asset-catalog.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const versions = JSON.parse(
  await fs.readFile(path.join(scriptDir, 'ddragon-version.json'), 'utf8'),
);
const version = versions.dataDragon;
const publicRoot = path.join(rootDir, 'public');
const generatedRoot = path.join(rootDir, 'src', 'data', 'generated');
const legacyRoot = path.join(publicRoot, 'lol', 'data');

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  throw new Error('Invalid pinned Data Dragon version.');
}

async function readOrFetch(candidates, url) {
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function writeAsset(relativePath, sourceUrl, candidates) {
  const bytes = await readOrFetch(candidates, sourceUrl);
  const outputPath = path.join(publicRoot, relativePath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
  return {
    path: relativePath.split(path.sep).join('/'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    source: sourceUrl,
  };
}

const parsedCandidates = [
  path.join(generatedRoot, 'champions-parsed.json'),
  path.join(legacyRoot, 'champions-parsed.json'),
];
let parsedSource = null;
for (const candidate of parsedCandidates) {
  try {
    parsedSource = JSON.parse(await fs.readFile(candidate, 'utf8'));
    break;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
if (!Array.isArray(parsedSource)) {
  throw new Error('Run npm run ddragon:parse before packaging champion data.');
}
const shippedChampionIds = parsedSource.map((champion) => champion.id);
if (
  new Set(shippedChampionIds).size !== shippedChampionIds.length ||
  !IMPLEMENTED_CHAMPION_IDS.every((championId) => shippedChampionIds.includes(championId))
) {
  throw new Error('Parsed champion catalogue is incomplete or contains duplicate IDs.');
}

// This directory is fully generated from the pinned allowlists. Clearing this
// exact target prevents old versions or retired assets from leaking into a build.
await fs.rm(path.join(publicRoot, 'assets', 'riot'), { recursive: true, force: true });

const files = [];
for (const championId of shippedChampionIds) {
  const filename = `${championId}.png`;
  const source = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${filename}`;
  files.push(
    await writeAsset(path.join('assets', 'riot', version, 'champions', filename), source, [
      path.join(legacyRoot, 'img', 'champions', filename),
    ]),
  );
}

for (const item of RIOT_ITEM_ASSETS) {
  const filename = `${item.dataDragonId}.png`;
  const source = `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${filename}`;
  files.push(
    await writeAsset(path.join('assets', 'riot', version, 'items', filename), source, [
      path.join(legacyRoot, 'img', 'items', filename),
    ]),
  );
}

const parsedById = new Map(parsedSource.map((champion) => [champion.id, champion]));
const champions = shippedChampionIds.map((championId) => {
  const champion = parsedById.get(championId);
  if (!champion) throw new Error(`Missing parsed champion ${championId}.`);
  return {
    ...champion,
    iconUrl: `/assets/riot/${version}/champions/${championId}.png`,
  };
});
await fs.mkdir(generatedRoot, { recursive: true });
const championCatalogBytes = Buffer.from(`${JSON.stringify(champions, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(generatedRoot, 'champions-parsed.json'), championCatalogBytes);
const clientChampionCatalogBytes = Buffer.from(
  `${JSON.stringify(createClientChampionCatalog(champions))}\n`,
  'utf8',
);
await fs.writeFile(path.join(generatedRoot, 'champions-client.json'), clientChampionCatalogBytes);

files.sort((left, right) => left.path.localeCompare(right.path));
const manifest = {
  schemaVersion: 1,
  dataDragonVersion: version,
  communityDragonVersion: versions.communityDragon,
  locale: 'fr_FR',
  champions: shippedChampionIds,
  implementedChampions: IMPLEMENTED_CHAMPION_IDS,
  items: Object.fromEntries(
    RIOT_ITEM_ASSETS.map(({ appId, dataDragonId }) => [appId, dataDragonId]),
  ),
  championCatalog: {
    path: 'src/data/generated/champions-parsed.json',
    bytes: championCatalogBytes.length,
    sha256: createHash('sha256').update(championCatalogBytes).digest('hex'),
  },
  files,
};
await fs.writeFile(
  path.join(generatedRoot, 'riot-assets-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(`Packaged ${files.length} pinned Riot assets for Data Dragon ${version}.`);
