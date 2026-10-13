import {
  accessOrder,
  type ChampionAccessFilter,
  type ChampionAccessSort,
  championMatchesAccess,
} from '@/features/champion-economy/application/championAccessView';
import type { Champion } from '@/types/champion';
import type { ChampionAccess } from '@/types/championEconomy';

export const STARTER_PAGE_SIZE = 12;

export function normalizeChampionSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .trim();
}

/** Keep the rendered roster bounded without losing choices from other pages. */
export function starterCatalogPage<T>(champions: readonly T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(champions.length / STARTER_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  return {
    page,
    pageCount,
    champions: champions.slice((page - 1) * STARTER_PAGE_SIZE, page * STARTER_PAGE_SIZE),
  };
}

export interface StarterCatalogFilters {
  search: string;
  roleFilter: string;
  accessFilter: ChampionAccessFilter;
  accessSort: ChampionAccessSort;
  economyRoster: boolean;
  getAccess: (championId: string) => ChampionAccess;
  localizeChampion: (champion: Champion) => Pick<Champion, 'name' | 'title'>;
  formatChampionTag: (tag: string) => string;
  locale: string;
}

/** Presentation filtering never changes the selected team or the canonical access policy. */
export function filterStarterCatalog(
  choices: readonly Champion[],
  filters: StarterCatalogFilters,
): Champion[] {
  const query = normalizeChampionSearch(filters.search);
  return choices
    .filter((champion) => {
      if (
        filters.economyRoster &&
        !championMatchesAccess(filters.getAccess(champion.id), filters.accessFilter)
      )
        return false;
      if (filters.roleFilter !== 'all' && !champion.tags.some((tag) => tag === filters.roleFilter))
        return false;
      const localized = filters.localizeChampion(champion);
      return (
        !query ||
        normalizeChampionSearch(
          [localized.name, localized.title, ...champion.tags.map(filters.formatChampionTag)].join(
            ' ',
          ),
        ).includes(query)
      );
    })
    .sort(
      (left, right) =>
        (filters.economyRoster && filters.accessSort === 'access'
          ? accessOrder[filters.getAccess(left.id)] - accessOrder[filters.getAccess(right.id)]
          : 0) ||
        filters
          .localizeChampion(left)
          .name.localeCompare(filters.localizeChampion(right).name, filters.locale),
    );
}
