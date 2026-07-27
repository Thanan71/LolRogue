import manifestJson from '@/data/generated/riot-assets-manifest.json';

interface RiotAssetManifest {
  dataDragonVersion: string;
  champions: string[];
  items: Record<string, string>;
}

const manifest = manifestJson as RiotAssetManifest;

export const RIOT_ASSET_VERSION = manifest.dataDragonVersion;
export const RIOT_CHAMPION_IDS = Object.freeze([...manifest.champions]);

export function riotChampionIconUrl(championId: string): string {
  return `/assets/riot/${RIOT_ASSET_VERSION}/champions/${championId}.png`;
}

export function riotItemIconUrl(itemId: string): string {
  const dataDragonId = manifest.items[itemId];
  if (!dataDragonId) throw new Error(`Missing Riot asset mapping for item "${itemId}".`);
  return `/assets/riot/${RIOT_ASSET_VERSION}/items/${dataDragonId}.png`;
}
