import { IMPLEMENTED_CHAMPION_IDS, RIOT_ITEM_ASSETS } from '../riot-asset-catalog.mjs';
import { artifactPath, sha256 } from './artifact-snapshot.mjs';
import {
  createChampionContentCatalog,
  createClientChampionCatalog,
} from './client-champion-catalog.mjs';

const generated = 'src/data/generated/';
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function requireMatch(condition, message) {
  if (!condition) throw new Error(`Generated artifacts: ${message}`);
}

export async function checkRiotArtifacts(snapshot) {
  const [versions, manifest, spells, compact, champions, english] = await Promise.all([
    snapshot.json('scripts/ddragon-version.json'),
    snapshot.json(`${generated}riot-assets-manifest.json`),
    snapshot.json(`${generated}riot-spell-assets-manifest.json`),
    snapshot.json(`${generated}riot-spell-assets-client.json`),
    snapshot.json(`${generated}champions-parsed.json`),
    snapshot.json(`${generated}champion-content.en-US.json`),
  ]);
  requireMatch(
    manifest.schemaVersion === 1 && spells.schemaVersion === 1,
    'unsupported Riot manifest schema.',
  );
  requireMatch(
    manifest.dataDragonVersion === versions.dataDragon &&
      spells.dataDragonVersion === versions.dataDragon &&
      manifest.communityDragonVersion === versions.communityDragon,
    'pinned Riot source versions differ from manifests.',
  );
  requireMatch(
    same(manifest.implementedChampions, IMPLEMENTED_CHAMPION_IDS) &&
      same(spells.implementedChampions, IMPLEMENTED_CHAMPION_IDS),
    'implemented champion source differs from manifests.',
  );
  requireMatch(
    same(Object.keys(spells.spells ?? {}), IMPLEMENTED_CHAMPION_IDS) &&
      Object.values(spells.spells).every(
        (files) => Array.isArray(files) && files.length === 4 && new Set(files).size === 4,
      ),
    'spell allowlist is stale or invalid.',
  );
  requireMatch(
    same(
      manifest.items,
      Object.fromEntries(RIOT_ITEM_ASSETS.map(({ appId, dataDragonId }) => [appId, dataDragonId])),
    ),
    'item source differs from manifest.',
  );
  requireMatch(
    same(
      champions.map(({ id }) => id),
      manifest.champions,
    ),
    'parsed champion ids differ from manifest.',
  );

  for (const [file, expected] of [
    ['champions-client.json', `${JSON.stringify(createClientChampionCatalog(champions))}\n`],
    [
      'champion-content.fr-FR.json',
      `${JSON.stringify(createChampionContentCatalog(champions), null, 2)}\n`,
    ],
    [
      'riot-spell-assets-client.json',
      `${JSON.stringify({ dataDragonVersion: spells.dataDragonVersion, spells: spells.spells })}\n`,
    ],
  ]) {
    requireMatch(
      (await snapshot.read(`${generated}${file}`)).toString('utf8') === expected,
      `deterministic projection is stale: ${generated}${file}. Run npm run assets -- package.`,
    );
  }
  requireMatch(same(compact.spells, spells.spells), 'compact spell projection differs.');
  requireMatch(
    manifest.championCatalog?.path === `${generated}champions-parsed.json`,
    'Riot manifest catalogue path must reference the canonical parsed input.',
  );
  const catalogBytes = await snapshot.read(`${generated}champions-parsed.json`);
  requireMatch(
    catalogBytes.length === manifest.championCatalog.bytes &&
      sha256(catalogBytes) === manifest.championCatalog.sha256,
    'parsed catalogue differs from Riot manifest integrity.',
  );

  requireMatch(
    english.schemaVersion === 1 &&
      english.locale === 'en_US' &&
      english.dataDragonVersion === versions.dataDragon &&
      english.source ===
        `https://ddragon.leagueoflegends.com/cdn/${versions.dataDragon}/data/en_US/champion/`,
    'English catalogue source identity is stale.',
  );
  requireMatch(
    sha256(JSON.stringify(english.champions)) === english.contentSha256 &&
      same(
        english.champions.map(({ id }) => id),
        champions.map(({ id }) => id),
      ),
    'English catalogue integrity or champion ids differ.',
  );

  const assets = new Set();
  for (const file of [...manifest.files, ...spells.files]) {
    const relative = artifactPath(file.path);
    requireMatch(
      relative.startsWith(`assets/riot/${versions.dataDragon}/`) &&
        /^[a-f0-9]{64}$/.test(file.sha256) &&
        Number.isSafeInteger(file.bytes) &&
        file.bytes > 0,
      'invalid Riot asset entry.',
    );
    requireMatch(!assets.has(`public/${relative}`), `duplicate Riot asset: ${relative}.`);
    assets.add(`public/${relative}`);
    const bytes = await snapshot.read(`public/${relative}`);
    requireMatch(
      bytes.length === file.bytes &&
        sha256(bytes) === file.sha256 &&
        bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
      `Riot asset integrity failure: ${relative}.`,
    );
  }
  requireMatch(
    same(await snapshot.list('public/assets/riot'), [...assets].sort()),
    'Riot asset package contains missing or unmanifested files.',
  );
  for (const champion of champions) {
    requireMatch(
      typeof champion.iconUrl === 'string' &&
        champion.iconUrl.startsWith('/') &&
        assets.has(`public${champion.iconUrl}`),
      `Champion ${champion.id} references an unmanifested icon.`,
    );
    const filenames = spells.spells[champion.id] ?? [];
    if (IMPLEMENTED_CHAMPION_IDS.includes(champion.id)) {
      requireMatch(
        same(
          filenames,
          champion.spells.map(({ image }) => image),
        ),
        `Champion ${champion.id} spell source differs from manifest.`,
      );
    }
    for (const filename of filenames) {
      requireMatch(
        assets.has(`public/assets/riot/${versions.dataDragon}/spells/${filename}`),
        `Champion ${champion.id} references an unmanifested spell.`,
      );
    }
  }
  return assets.size;
}
