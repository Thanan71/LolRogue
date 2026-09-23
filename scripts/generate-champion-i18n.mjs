import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.join(scriptDirectory, '..');
const versionPath = path.join(scriptDirectory, 'ddragon-version.json');
const sourceCatalogPath = path.join(
  repositoryRoot,
  'src',
  'data',
  'generated',
  'champions-parsed.json',
);
const outputPath = path.join(
  repositoryRoot,
  'src',
  'data',
  'generated',
  'champion-content.en-US.json',
);
const locale = 'en_US';
const concurrency = 12;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   title: string,
 *   passive: { name: string, description: string },
 *   spells: Array<{ id: string, name: string, description: string }>
 * }} DataDragonChampion
 */

/**
 * @typedef {{ version?: string, data?: Record<string, DataDragonChampion> }} DataDragonPayload
 */

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing ${label}.`);
  }
  return value.trim();
}

function requireExactIds(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(
      `${label} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`,
    );
  }
}

async function fetchChampion(version, sourceChampion, summaryChampion) {
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion/${sourceChampion.id}.json`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${sourceChampion.id}: ${response.status} ${response.statusText}.`,
    );
  }

  const payload = /** @type {DataDragonPayload} */ (await response.json());
  if (payload.version !== version) {
    throw new Error(
      `${sourceChampion.id} resolved to Data Dragon ${payload.version}, expected ${version}.`,
    );
  }

  const champion = payload.data?.[sourceChampion.id];
  if (!champion || champion.id !== sourceChampion.id) {
    throw new Error(`Data Dragon did not return the exact champion id ${sourceChampion.id}.`);
  }
  if (!summaryChampion || champion.name !== summaryChampion.name) {
    throw new Error(
      `English champion name mismatch for ${sourceChampion.id}: expected ${summaryChampion?.name}, received ${champion.name}.`,
    );
  }
  if (!Array.isArray(champion.spells) || champion.spells.length !== 4) {
    throw new Error(`${sourceChampion.id} must expose exactly four Data Dragon spells.`);
  }

  const expectedSpellIds = sourceChampion.spells.map(({ id }) => id);
  requireExactIds(
    champion.spells.map(({ id }) => id),
    expectedSpellIds,
    `${sourceChampion.id} spell ids`,
  );

  return {
    id: champion.id,
    name: requireNonEmptyString(champion.name, `${champion.id} name`),
    title: requireNonEmptyString(champion.title, `${champion.id} title`),
    passive: {
      name: requireNonEmptyString(champion.passive?.name, `${champion.id} passive name`),
      description: requireNonEmptyString(
        champion.passive?.description,
        `${champion.id} passive description`,
      ),
    },
    spells: champion.spells.map((spell) => ({
      id: spell.id,
      name: requireNonEmptyString(spell.name, `${champion.id}/${spell.id} name`),
      description: requireNonEmptyString(
        spell.description,
        `${champion.id}/${spell.id} description`,
      ),
    })),
  };
}

async function main() {
  const [{ dataDragon: version }, sourceChampions] = await Promise.all([
    fs.readFile(versionPath, 'utf8').then(JSON.parse),
    fs.readFile(sourceCatalogPath, 'utf8').then(JSON.parse),
  ]);

  if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    throw new Error('Invalid pinned Data Dragon version.');
  }
  if (!Array.isArray(sourceChampions) || sourceChampions.length === 0) {
    throw new Error('The generated champion source catalog is empty.');
  }

  const summaryResponse = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`,
  );
  if (!summaryResponse.ok) {
    throw new Error(
      `Failed to fetch the English champion summary: ${summaryResponse.status} ${summaryResponse.statusText}.`,
    );
  }
  const summaryPayload = /** @type {DataDragonPayload} */ (await summaryResponse.json());
  if (summaryPayload.version !== version) {
    throw new Error(
      `English champion summary resolved to Data Dragon ${summaryPayload.version}, expected ${version}.`,
    );
  }
  const summaryById = summaryPayload.data ?? {};
  requireExactIds(
    Object.keys(summaryById).sort(),
    sourceChampions.map(({ id }) => id).sort(),
    'English summary champion ids',
  );

  const champions = [];
  for (let index = 0; index < sourceChampions.length; index += concurrency) {
    const batch = sourceChampions.slice(index, index + concurrency);
    champions.push(
      ...(await Promise.all(
        batch.map((champion) => fetchChampion(version, champion, summaryById[champion.id])),
      )),
    );
  }

  requireExactIds(
    champions.map(({ id }) => id),
    sourceChampions.map(({ id }) => id),
    'Champion ids',
  );

  const output = {
    schemaVersion: 1,
    dataDragonVersion: version,
    locale,
    source: `https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion/`,
    contentSha256: createHash('sha256').update(JSON.stringify(champions)).digest('hex'),
    champions,
  };
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Generated ${champions.length} English champion entries for Data Dragon ${version}.`);
}

await main();
