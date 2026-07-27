/**
 * Champion Database — a Pokedex-like indexed store for League of Legends champions.
 *
 * Indexes:
 *   - by id   (e.g. "Ahri")
 *   - by key  (e.g. "103")
 *   - by tag  (e.g. "Mage" -> Set of champion ids)
 *   - by resourceType (e.g. "Mana" -> Set of champion ids)
 *
 * Supports full-text search (name/title) and multi-criteria filtering.
 */

import type { Champion, ChampionTag, ResourceType } from '@/types';
import { implementedChampions } from './champion';
import championsRaw from './generated/champions-parsed.json';

// --- Filter Criteria ---------------------------------------------------------

export interface ChampionFilter {
  tags?: ChampionTag[];
  tagsAny?: ChampionTag[];
  resourceType?: ResourceType;
  resourceTypes?: ResourceType[];
  attackType?: 'melee' | 'ranged';
  minHp?: number;
  maxHp?: number;
  minAttackDamage?: number;
  maxAttackDamage?: number;
  minArmor?: number;
  maxArmor?: number;
}

// --- Sort Options ------------------------------------------------------------

export type SortField =
  | 'name'
  | 'hp'
  | 'attackDamage'
  | 'armor'
  | 'magicResist'
  | 'moveSpeed'
  | 'attackSpeed'
  | 'attackRange';

export interface SortOptions {
  field: SortField;
  direction: 'asc' | 'desc';
}

type TagIndex = Map<ChampionTag, Set<string>>;
type ResourceIndex = Map<ResourceType, Set<string>>;

// --- Database Class ----------------------------------------------------------

export class ChampionDatabase {
  private champions: Champion[];
  private byId: Map<string, Champion>;
  private byKey: Map<string, Champion>;
  private byTag: TagIndex;
  private byResource: ResourceIndex;

  constructor(rawData?: Champion[]) {
    const source = rawData ?? (championsRaw as Champion[]);
    const maintainedById = new Map(
      implementedChampions.map((champion) => [champion.id.toLowerCase(), champion]),
    );
    this.champions = rawData
      ? source
      : source.map((champion) => maintainedById.get(champion.id.toLowerCase()) ?? champion);
    this.byId = new Map();
    this.byKey = new Map();
    this.byTag = new Map() as TagIndex;
    this.byResource = new Map() as ResourceIndex;
    this.buildIndexes();
  }

  private buildIndexes(): void {
    for (const champ of this.champions) {
      this.byId.set(champ.id.toLowerCase(), champ);
      this.byKey.set(champ.key, champ);
      for (const tag of champ.tags) {
        if (!this.byTag.has(tag)) {
          this.byTag.set(tag, new Set());
        }
        this.byTag.get(tag)!.add(champ.id);
      }
      if (!this.byResource.has(champ.resourceType)) {
        this.byResource.set(champ.resourceType, new Set());
      }
      this.byResource.get(champ.resourceType)!.add(champ.id);
    }
  }

  getAll(): Champion[] {
    return [...this.champions];
  }

  count(): number {
    return this.champions.length;
  }

  getById(id: string): Champion | undefined {
    return this.byId.get(id.toLowerCase());
  }

  getByKey(key: string): Champion | undefined {
    return this.byKey.get(key);
  }

  getByTag(tag: ChampionTag): Champion[] {
    const ids = this.byTag.get(tag);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.getById(id)!)
      .filter(Boolean);
  }

  getByResourceType(type: ResourceType): Champion[] {
    const ids = this.byResource.get(type);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.getById(id)!)
      .filter(Boolean);
  }

  getAllTags(): ChampionTag[] {
    return Array.from(this.byTag.keys()).sort();
  }

  getAllResourceTypes(): ResourceType[] {
    return Array.from(this.byResource.keys()).sort();
  }

  getTagCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [tag, ids] of this.byTag) {
      counts[tag] = ids.size;
    }
    return counts;
  }

  // --- Search ---------------------------------------------------------------

  search(query: string): Champion[] {
    if (!query.trim()) return this.getAll();
    const lower = query.toLowerCase().trim();
    return this.champions.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.id.toLowerCase().includes(lower) ||
        c.title.toLowerCase().includes(lower),
    );
  }

  // --- Filtering ------------------------------------------------------------

  filter(criteria: ChampionFilter): Champion[] {
    return this.champions.filter((c) => this.matchesFilter(c, criteria));
  }

  searchAndFilter(query: string, criteria: ChampionFilter): Champion[] {
    return this.search(query).filter((c) => this.matchesFilter(c, criteria));
  }

  private matchesFilter(champ: Champion, criteria: ChampionFilter): boolean {
    const { stats } = champ;
    if (criteria.tags?.length) {
      if (!criteria.tags.every((t) => champ.tags.includes(t))) return false;
    }
    if (criteria.tagsAny?.length) {
      if (!criteria.tagsAny.some((t) => champ.tags.includes(t))) return false;
    }
    if (criteria.resourceType) {
      if (champ.resourceType !== criteria.resourceType) return false;
    }
    if (criteria.resourceTypes?.length) {
      if (!criteria.resourceTypes.includes(champ.resourceType)) return false;
    }
    if (criteria.attackType) {
      const isMelee = stats.attackRange <= 200;
      if (criteria.attackType === 'melee' && !isMelee) return false;
      if (criteria.attackType === 'ranged' && isMelee) return false;
    }
    if (criteria.minHp !== undefined && stats.hp < criteria.minHp) return false;
    if (criteria.maxHp !== undefined && stats.hp > criteria.maxHp) return false;
    if (criteria.minAttackDamage !== undefined && stats.attackDamage < criteria.minAttackDamage)
      return false;
    if (criteria.maxAttackDamage !== undefined && stats.attackDamage > criteria.maxAttackDamage)
      return false;
    if (criteria.minArmor !== undefined && stats.armor < criteria.minArmor) return false;
    if (criteria.maxArmor !== undefined && stats.armor > criteria.maxArmor) return false;
    return true;
  }

  // --- Sorting --------------------------------------------------------------

  sort(champions: Champion[], options: SortOptions): Champion[] {
    const { field, direction } = options;
    const dir = direction === 'asc' ? 1 : -1;
    return [...champions].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      if (field === 'name') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else {
        aVal = a.stats[field];
        bVal = b.stats[field];
      }
      if (aVal < bVal) return -1 * dir;
      if (aVal > bVal) return 1 * dir;
      return 0;
    });
  }

  // --- Full Pipeline: search + filter + sort --------------------------------

  query(
    searchQuery: string = '',
    criteria: ChampionFilter = {},
    sortOptions?: SortOptions,
  ): Champion[] {
    let results = this.searchAndFilter(searchQuery, criteria);
    if (sortOptions) {
      results = this.sort(results, sortOptions);
    }
    return results;
  }
}

// --- Singleton Instance ------------------------------------------------------

export const championDB = new ChampionDatabase();
