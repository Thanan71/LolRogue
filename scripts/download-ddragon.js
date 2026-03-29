import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
const LANG = 'fr_FR';
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'lol');

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

    for (const { endpoint, filename } of endpoints) {
      await downloadEndpoint(version, endpoint, filename);
    }

    // Sauvegarder les métadonnées (version, date)
    const metadata = {
      version,
      language: LANG,
      downloadedAt: new Date().toISOString(),
      files: endpoints.map(e => e.filename),
    };
    
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
    console.log('\n✓ Saved metadata.json');

    console.log('\n✅ Download complete!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
