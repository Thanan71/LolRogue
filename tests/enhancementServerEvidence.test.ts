import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import {
  canUnlockNode,
  ENHANCEMENT_TREES_BY_ROLE,
  getEnhancementTreeForRole,
} from '@/data/enhancementTrees';
import {
  compareEnhancementServerNode,
  ENHANCEMENT_SERVER_SOURCES,
  extractEnhancementServerCatalog,
  getEnhancementServerLockReason,
  readEnhancementServerCatalog,
} from '../tooling/enhancements/serverEvidence';

const directory = join(process.cwd(), 'supabase/migrations');
const migrations = readdirSync(directory)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({
    path: `supabase/migrations/${name}`,
    sql: readFileSync(join(directory, name), 'utf8'),
  }));
const catalog = readEnhancementServerCatalog(process.cwd());
const nodes = Object.values(ENHANCEMENT_TREES_BY_ROLE).flatMap((tree) => [
  ...tree.coreNodes,
  ...tree.branches.flatMap((branch) => branch.nodes),
]);
const serverById = new Map(catalog.nodes.map((node) => [node.id, node]));

describe('enhancement SQL catalog audit', () => {
  it('extracts all 72 canonical nodes from the seed and validates the two unchanged copies', () => {
    expect(catalog.evidence).toBe('repository-migrations');
    expect(catalog.rulesetVersion).toBe(3);
    expect(catalog.nodes).toHaveLength(72);
    expect(new Set(catalog.nodes.map((node) => node.id)).size).toBe(72);
    expect([...new Set(catalog.nodes.map((node) => node.role))].sort()).toEqual([
      'assassin',
      'fighter',
      'mage',
      'marksman',
      'support',
      'tank',
    ]);
    expect(catalog.nodes.every((node) => node.active && node.maxRanks === 1)).toBe(true);
    expect(catalog.sources).toHaveLength(6);
    expect(catalog.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
  });

  it('finds exact client/server purchase fields for every visible node', () => {
    expect(nodes).toHaveLength(72);
    expect(nodes.map((node) => node.id).sort()).toEqual(
      catalog.nodes.map((node) => node.id).sort(),
    );
    for (const node of nodes)
      expect(compareEnhancementServerNode(node, serverById.get(node.id))).toEqual([]);
    expect(Math.max(...catalog.nodes.map((node) => node.requiredMasteryLevel))).toBe(3);
  });

  it('keeps the provider primary tag and server primary role aligned for every maintained champion', () => {
    for (const champion of implementedChampions) {
      const serverChampion = catalog.champions.find((entry) => entry.championId === champion.id);
      expect(serverChampion, champion.id).toBeDefined();
      expect(getEnhancementTreeForRole(champion.tags[0]).primaryRole).toBe(champion.tags[0]);
      expect(champion.tags[0].toLowerCase(), champion.id).toBe(serverChampion?.primaryRole);
    }
    const garen = implementedChampions.find((champion) => champion.id === 'Garen')!;
    expect(garen.tags).toEqual(['Fighter', 'Tank']);
    expect(getEnhancementTreeForRole(garen.tags[0]).primaryRole).toBe('Fighter');
    expect(getEnhancementTreeForRole('unknown-role').primaryRole).toBe('Fighter');
  });

  it('compares the entire visible champion database including presentation-only kits and secondary tags', () => {
    const champions = championDB.getAll();
    expect(champions.length).toBe(catalog.champions.length);
    for (const champion of champions) {
      const server = catalog.champions.find((entry) => entry.championId === champion.id);
      expect(server, champion.id).toBeDefined();
      expect(
        getEnhancementTreeForRole(champion.tags[0]).primaryRole.toLowerCase(),
        champion.id,
      ).toBe(server?.primaryRole);
    }
  });

  it('exposes the availability gate absent from the server catalog instead of silently treating it as SQL parity', () => {
    const unavailable: string[] = [];
    for (const node of nodes) {
      const prerequisites = Object.fromEntries(node.prerequisites.map((id) => [id, 1]));
      expect(
        getEnhancementServerLockReason(serverById.get(node.id)!, prerequisites, 4, 100_000),
      ).toBeNull();
      if (!canUnlockNode(node, prerequisites, 4, 100_000)) unavailable.push(node.id);
    }
    expect(unavailable.sort()).toEqual(
      [
        'assassin_mobility_1',
        'assassin_mobility_2',
        'assassin_mobility_3',
        'fighter_duelist_1',
        'mage_burst_3',
        'marksman_survival_3',
        'support_tanky_3',
        'support_utility_1',
        'support_utility_2',
        'support_utility_3',
        'tank_support_1',
        'tank_support_3',
      ].sort(),
    );
  });

  it('reports missing, inactive or changed server values by field', () => {
    const client = nodes[0];
    const server = serverById.get(client.id)!;
    expect(compareEnhancementServerNode(client, undefined)).toEqual(['missing_server_node']);
    expect(
      compareEnhancementServerNode(client, {
        ...server,
        candyCost: server.candyCost + 1,
        maxRanks: 2,
        requiredMasteryLevel: 4,
        prerequisites: ['missing'],
        active: false,
      }),
    ).toEqual([
      'candyCost',
      'maxRanks',
      'requiredMasteryLevel',
      'prerequisites',
      'inactive_server_node',
    ]);
  });

  it('models mastery, funds, rank and prerequisite refusals without declaring unsupported effects available in the UI', () => {
    const node = serverById.get('fighter_core_2')!;
    expect(getEnhancementServerLockReason(node, {}, 0, 100)).toBe('mastery_level_required');
    expect(getEnhancementServerLockReason(node, {}, 4, 0)).toBe('insufficient_candies');
    expect(getEnhancementServerLockReason(node, {}, 4, 100)).toBe(
      'enhancement_prerequisite_required:fighter_core_1',
    );
    expect(getEnhancementServerLockReason(node, { fighter_core_1: 1 }, 4, 100)).toBeNull();
    expect(getEnhancementServerLockReason(node, { fighter_core_2: 1 }, 4, 100, 0)).toBe(
      'enhancement_rank_conflict',
    );
    expect(getEnhancementServerLockReason(node, { fighter_core_2: 1 }, 4, 100, 1)).toBe(
      'enhancement_max_rank',
    );
  });

  it('fails closed when a later migration changes the catalog or the active progression version', () => {
    expect(() =>
      extractEnhancementServerCatalog([
        ...migrations,
        {
          path: 'supabase/migrations/99999999999999_future.sql',
          sql: 'UPDATE public.enhancement_node_catalog SET candy_cost=1;',
        },
      ]),
    ).toThrow('unreviewed catalog mutation');
    expect(() =>
      extractEnhancementServerCatalog([
        ...migrations,
        {
          path: 'supabase/migrations/99999999999999_future.sql',
          sql: 'UPDATE public.progression_rulesets SET is_active = TRUE WHERE version = 4;',
        },
      ]),
    ).toThrow('active progression ruleset must be re-audited');
  });

  it('rejects a missing row, duplicate ID and unreviewed copy mapping', () => {
    const mutate = (path: string, change: (sql: string) => string) =>
      migrations.map((migration) =>
        migration.path === path ? { ...migration, sql: change(migration.sql) } : migration,
      );
    expect(() =>
      extractEnhancementServerCatalog(
        mutate(ENHANCEMENT_SERVER_SOURCES.seed, (sql) =>
          sql.replace("('assassin_core_1', 'assassin', 20, 1, 0, ARRAY[]::TEXT[]),", ''),
        ),
      ),
    ).toThrow('72 fully parsed');
    expect(() =>
      extractEnhancementServerCatalog(
        mutate(ENHANCEMENT_SERVER_SOURCES.seed, (sql) =>
          sql.replace("('assassin_core_2'", "('assassin_core_1'"),
        ),
      ),
    ).toThrow('duplicate server node ID');
    expect(() =>
      extractEnhancementServerCatalog(
        mutate(ENHANCEMENT_SERVER_SOURCES.copyV3, (sql) =>
          sql.replace(
            '3, node_id, champion_role, candy_cost, max_rank,',
            '3, node_id, champion_role, candy_cost + 1, max_rank,',
          ),
        ),
      ),
    ).toThrow('unsupported enhancement_node_catalog copy');
  });
});
