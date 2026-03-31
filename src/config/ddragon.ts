/**
 * Data Dragon CDN configuration
 * Reference: https://developer.riotgames.com/docs/lol
 */

export const DDRAGON_CONFIG = {
  /** Base URL for Data Dragon CDN */
  baseUrl: 'https://ddragon.leagueoflegends.com',

  /** Default language */
  language: 'fr_FR' as const,

  /** Get the version API endpoint */
  get versionsUrl(): string {
    return `${this.baseUrl}/api/versions.json`;
  },

  /** Build a CDN URL for a given version */
  cdnUrl(version: string): string {
    return `${this.baseUrl}/cdn/${version}`;
  },

  /** Champion icon (120x120 square PNG) */
  championIconUrl(version: string, championId: string): string {
    return `${this.cdnUrl(version)}/img/champion/${championId}.png`;
  },

  /** Champion splash art (full resolution JPG) */
  championSplashUrl(championId: string, skinNum: number = 0): string {
    return `${this.baseUrl}/cdn/img/champion/splash/${championId}_${skinNum}.jpg`;
  },

  /** Champion loading screen art (medium resolution JPG) */
  championLoadingUrl(championId: string, skinNum: number = 0): string {
    return `${this.baseUrl}/cdn/img/champion/loading/${championId}_${skinNum}.jpg`;
  },

  /** Local path prefix for champion icons (served by Vite from public/) */
  localChampionIconPath: 'public/lol/data/img/champions',
} as const;

/** Latest version placeholder — will be resolved at runtime */
export let DDRAGON_VERSION = '16.6.1';

/** Update the cached version */
export function setDdragonVersion(version: string): void {
  DDRAGON_VERSION = version;
}

/**
 * Fetch the latest Data Dragon version from Riot's API.
 * Falls back to current known version on failure.
 */
export async function fetchLatestVersion(): Promise<string> {
  try {
    const response = await fetch(DDRAGON_CONFIG.versionsUrl);
    if (!response.ok) {
      console.warn(`[DDragon] Failed to fetch versions: ${response.status}`);
      return DDRAGON_VERSION;
    }
    const versions: string[] = await response.json();
    if (versions.length > 0) {
      setDdragonVersion(versions[0]);
      return versions[0];
    }
    return DDRAGON_VERSION;
  } catch (error) {
    console.warn('[DDragon] Error fetching version, using fallback:', error);
    return DDRAGON_VERSION;
  }
}
