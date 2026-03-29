/**
 * useChampionDB - React hook providing access to the Champion Database.
 *
 * The database is a singleton initialized once; this hook provides a stable
 * memoized API surface for use in React components.
 *
 * Usage:
 *   const { champions, getById, search, filter, query, tags, resourceTypes } = useChampionDB();
 */

import { useMemo } from 'react';
import { championDB } from '@/data/championDatabase';
import type { Champion, ChampionTag, ResourceType } from '@/types';
import type { ChampionFilter, SortOptions } from '@/data/championDatabase';

export interface UseChampionDBReturn {
  champions: Champion[];
  count: number;
  tags: ChampionTag[];
  resourceTypes: ResourceType[];
  tagCounts: Record<string, number>;
  getById: (id: string) => Champion | undefined;
  getByKey: (key: string) => Champion | undefined;
  getByTag: (tag: ChampionTag) => Champion[];
  getByResourceType: (type: ResourceType) => Champion[];
  search: (query: string) => Champion[];
  filter: (criteria: ChampionFilter) => Champion[];
  searchAndFilter: (query: string, criteria: ChampionFilter) => Champion[];
  query: (search?: string, criteria?: ChampionFilter, sort?: SortOptions) => Champion[];
  sort: (champions: Champion[], options: SortOptions) => Champion[];
}

export function useChampionDB(): UseChampionDBReturn {
  return useMemo<UseChampionDBReturn>(
    () => ({
      champions: championDB.getAll(),
      count: championDB.count(),
      tags: championDB.getAllTags(),
      resourceTypes: championDB.getAllResourceTypes(),
      tagCounts: championDB.getTagCounts(),
      getById: (id: string) => championDB.getById(id),
      getByKey: (key: string) => championDB.getByKey(key),
      getByTag: (tag: ChampionTag) => championDB.getByTag(tag),
      getByResourceType: (type: ResourceType) => championDB.getByResourceType(type),
      search: (query: string) => championDB.search(query),
      filter: (criteria: ChampionFilter) => championDB.filter(criteria),
      searchAndFilter: (query: string, criteria: ChampionFilter) =>
        championDB.searchAndFilter(query, criteria),
      query: (search = '', criteria = {}, sort?: SortOptions) =>
        championDB.query(search, criteria, sort),
      sort: (list: Champion[], options: SortOptions) => championDB.sort(list, options),
    }),
    []
  );
}
