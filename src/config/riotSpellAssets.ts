import spellManifestJson from '@/data/generated/riot-spell-assets-client.json';

interface RiotSpellAssetManifest {
  dataDragonVersion: string;
  spells: Record<string, string[]>;
}

const spellManifest = spellManifestJson as RiotSpellAssetManifest;

export function riotSpellIconUrl(championId: string, filename: string): string | undefined {
  if (!spellManifest.spells[championId]?.includes(filename)) return undefined;
  return `/assets/riot/${spellManifest.dataDragonVersion}/spells/${filename}`;
}
