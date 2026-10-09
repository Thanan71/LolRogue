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
