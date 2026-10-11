import { implementedChampions } from '@/data/champion';
import { ECONOMY_V1_CHAMPION_IDS, ECONOMY_V2_CHAMPION_IDS } from '@/domain/championEconomy';
import {
  CURRENT_AUTHORITY_CHAMPION_CATALOG,
  CURRENT_AUTHORITY_ENGINE,
} from '@/game/authority/versionCapabilities.generated';
import {
  getAuthorityChampionCatalogVersion,
  hasAuthorityFeature,
} from '@/game/authority/versionRegistry';
import type { Champion } from '@/types/champion';

/** Keep a resumed run's passive hooks within its published gameplay capabilities. */
export function getRunChampionForEngine(champion: Champion, engineVersion?: string): Champion {
  if (
    hasAuthorityFeature(engineVersion ?? CURRENT_AUTHORITY_ENGINE, 'runProgressionAssists') ||
    !champion.passive.runProgression?.some((definition) => definition.onAssist?.length)
  ) {
    return champion;
  }
  return {
    ...champion,
    passive: {
      ...champion.passive,
      runProgression: champion.passive.runProgression.map((definition) => {
        const historical = { ...definition };
        delete historical.onAssist;
        return historical;
      }),
    },
  };
}

/** A maintained kit can join an encounter pool only through its published catalogue. */
export function getRunChampionCatalog(engineVersion?: string): readonly Champion[] {
  const version =
    engineVersion === undefined
      ? CURRENT_AUTHORITY_CHAMPION_CATALOG
      : getAuthorityChampionCatalogVersion(engineVersion);
  const ids =
    version === 1 ? ECONOMY_V1_CHAMPION_IDS : version === 2 ? ECONOMY_V2_CHAMPION_IDS : null;
  if (!ids) throw new Error('unsupported_run_champion_catalog');
  const allowed = new Set(ids);
  // Preserve the historical maintained-kit order: sorting would change weighted draws.
  return implementedChampions
    .filter((champion) => allowed.has(champion.id))
    .map((champion) => getRunChampionForEngine(champion, engineVersion));
}
