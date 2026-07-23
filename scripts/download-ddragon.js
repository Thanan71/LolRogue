import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
const LANG = 'fr_FR';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'lol', 'data');

/**
 * Récupère la dernière version de Data Dragon
 */
async function getLatestVersion() {
  const response = await fetch(`${DDRAGON_BASE}/api/versions.json`);
  if (!response.ok) {
    throw new Error(`Failed to fetch versions: ${response.status} ${response.statusText}`);
  }
  const versions = await response.json();
  return versions[0];
}

/**
 * Télécharge un endpoint Data Dragon et sauvegarde en JSON
 */
async function downloadEndpoint(version, endpoint, filename) {
  const url = `${DDRAGON_BASE}/cdn/${version}/data/${LANG}/${endpoint}.json`;
  console.log(`Downloading ${endpoint} from ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const outputPath = path.join(OUTPUT_DIR, filename);

  await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✓ Saved ${filename}`);

  return data;
}

/**
 * Télécharge les détails individuels de chaque champion (spells, passive)
 */
async function downloadChampionDetails(version, championData) {
  const detailDir = path.join(OUTPUT_DIR, 'champions-detail');
  await fs.mkdir(detailDir, { recursive: true });

  const champions = Object.values(championData.data);
  console.log(`\n📋 Downloading ${champions.length} champion details (spells/passive)...`);

  let downloaded = 0;
  for (const champion of champions) {
    const url = `${DDRAGON_BASE}/cdn/${version}/data/${LANG}/champion/${champion.id}.json`;
    const outputPath = path.join(detailDir, `${champion.id}.json`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`  ⚠️  Failed to download ${champion.id}: ${response.status}`);
        continue;
      }
      const data = await response.json();
      await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf-8');
      downloaded++;
      if (downloaded % 20 === 0 || downloaded === champions.length) {
        console.log(`  📥 ${downloaded}/${champions.length} details downloaded`);
      }
    } catch (err) {
      console.warn(`  ⚠️  Error downloading ${champion.id}: ${err.message}`);
    }
  }

  console.log(`✓ Downloaded ${downloaded} champion details to champions-detail/`);
}

/**
 * Télécharge les icônes des champions (120x120)
 */
async function downloadChampionIcons(version, championData) {
  const iconsDir = path.join(OUTPUT_DIR, 'img', 'champions');
  await fs.mkdir(iconsDir, { recursive: true });

  const champions = Object.values(championData.data);
  console.log(`\n🖼️  Downloading ${champions.length} champion icons...`);

  let downloaded = 0;
  for (const champion of champions) {
    const iconFilename = champion.image.full;
    const url = `${DDRAGON_BASE}/cdn/${version}/img/champion/${iconFilename}`;
    const outputPath = path.join(iconsDir, iconFilename);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`  ⚠️  Failed to download ${iconFilename}: ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outputPath, buffer);
      downloaded++;
      if (downloaded % 20 === 0 || downloaded === champions.length) {
        console.log(`  📥 ${downloaded}/${champions.length} icons downloaded`);
      }
    } catch (err) {
      console.warn(`  ⚠️  Error downloading ${iconFilename}: ${err.message}`);
    }
  }

  console.log(`✓ Downloaded ${downloaded} champion icons to img/champions/`);
}

/**
 * Télécharge les icônes des items (64x64)
 */
async function downloadItemIcons(version, itemData) {
  const iconsDir = path.join(OUTPUT_DIR, 'img', 'items');
  await fs.mkdir(iconsDir, { recursive: true });

  const items = Object.entries(itemData.data);
  console.log(`\n🖼️  Downloading ${items.length} item icons...`);

  let downloaded = 0;
  for (const [, item] of items) {
    if (!item.image || !item.image.full) continue;
    const iconFilename = item.image.full;
    const url = `${DDRAGON_BASE}/cdn/${version}/img/item/${iconFilename}`;
    const outputPath = path.join(iconsDir, iconFilename);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`  ⚠️  Failed to download item ${iconFilename}: ${response.status}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(outputPath, buffer);
      downloaded++;
      if (downloaded % 50 === 0 || downloaded === items.length) {
        console.log(`  📥 ${downloaded}/${items.length} item icons downloaded`);
      }
    } catch (err) {
      console.warn(`  ⚠️  Error downloading item ${iconFilename}: ${err.message}`);
    }
  }

  console.log(`✓ Downloaded ${downloaded} item icons to img/items/`);
}

/**
 * Point d'entrée principal
 */
async function main() {
  try {
    console.log('🎮 Data Dragon Download Script');
    console.log('================================\n');

    // Créer le dossier de sortie s'il n'existe pas
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);

    // Récupérer la dernière version
    const version = await getLatestVersion();
    console.log(`📌 Latest version: ${version}\n`);

    // Télécharger chaque endpoint
    const endpoints = [
      { endpoint: 'champion', filename: 'champions.json' },
      { endpoint: 'item', filename: 'items.json' },
      { endpoint: 'runesReforged', filename: 'runes.json' },
      { endpoint: 'summoner', filename: 'summoner-spells.json' },
    ];

    const downloadedData = {};
    for (const { endpoint, filename } of endpoints) {
      downloadedData[filename] = await downloadEndpoint(version, endpoint, filename);
    }

    // Télécharger les détails des champions (spells, passive)
    if (downloadedData['champions.json']) {
      await downloadChampionDetails(version, downloadedData['champions.json']);
    }

    // Télécharger les icônes des champions
    if (downloadedData['champions.json']) {
      await downloadChampionIcons(version, downloadedData['champions.json']);
    }

    // Télécharger les icônes des items
    if (downloadedData['items.json']) {
      await downloadItemIcons(version, downloadedData['items.json']);
    }

    // Sauvegarder les métadonnées (version, date)
    const metadata = {
      version,
      language: LANG,
      downloadedAt: new Date().toISOString(),
      files: endpoints.map((e) => e.filename),
    };

    await fs.writeFile(
      path.join(OUTPUT_DIR, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8',
    );
    console.log('\n✓ Saved metadata.json');

    console.log('\n✅ Download complete!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
