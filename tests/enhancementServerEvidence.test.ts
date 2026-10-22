import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { implementedChampions } from '@/data/champion';
import { championDB } from '@/data/championDatabase';
import { CHAMPION_ENHANCEMENT_SPECIALIZATIONS } from '@/data/enhancementSpecializations';
import {
  canUnlockNode,
  ENHANCEMENT_TREES_BY_ROLE,
  getEnhancementTreeForRole,
} from '@/data/enhancementTrees';
import {
  compareEnhancementServerNode,
  ENHANCEMENT_SERVER_SOURCES,
  extractEnhancementServerCatalog,
  getEnhancementServerLockReason as projectServerLockReason,
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

const getEnhancementServerLockReason = (
  node: (typeof catalog.nodes)[number],
  ranks: Readonly<Record<string, number>>,
  mastery: number,
  candies: number,
  expectedRank?: number,
) => projectServerLockReason(node, ranks, mastery, candies, expectedRank, { nodes: catalog.nodes });
const ancestors = (id: string, ranks: Record<string, number> = {}): Record<string, number> => {
  for (const parent of serverById.get(id)?.prerequisites ?? []) {
    ranks[parent] = 1;
    ancestors(parent, ranks);
  }
  return ranks;
};

describe('enhancement SQL catalog audit', () => {
  it('extracts 72 shared nodes plus the 16 SQL-expanded extensions and validates all copies', () => {
    expect(catalog.evidence).toBe('repository-migrations');
    expect(extractEnhancementServerCatalog([...migrations].reverse())).toEqual(catalog);
    expect(() => extractEnhancementServerCatalog([...migrations, migrations[0]])).toThrow(
      'duplicate migration path',
    );
    expect(catalog.rulesetVersion).toBe(4);
    expect(catalog.nodes).toHaveLength(88);
    expect(new Set(catalog.nodes.map((node) => node.id)).size).toBe(88);
    expect([...new Set(catalog.nodes.map((node) => node.role))].sort()).toEqual([
      'assassin',
      'fighter',
      'mage',
      'marksman',
      'support',
      'tank',
    ]);
    expect(catalog.nodes.filter((node) => !node.active)).toHaveLength(12);
    expect(catalog.nodes.filter((node) => node.championId === null)).toHaveLength(72);
    expect(catalog.nodes.filter((node) => node.championId !== null)).toHaveLength(16);
    expect(catalog.nodes.every((node) => node.maxRanks === 1)).toBe(true);
    expect(catalog.settings).toEqual({
      championSpecializationsEnabled: false,
      repeatResetFeeBasisPoints: 0,
    });
    expect(catalog.sources).toHaveLength(10);
    expect(catalog.sources.map((source) => source.path)).toContain(
      ENHANCEMENT_SERVER_SOURCES.snapshotV25,
    );
    expect(catalog.sources.every((source) => /^[a-f0-9]{64}$/.test(source.sha256))).toBe(true);
  });

  it('finds exact client/server purchase fields for every visible node', () => {
    expect(nodes).toHaveLength(72);
    expect(nodes.map((node) => node.id).sort()).toEqual(
      catalog.nodes
        .filter((node) => node.championId === null)
        .map((node) => node.id)
        .sort(),
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

  it('keeps all fifteen unsupported or inherited role paths closed on both sides, including already-owned disabled parents', () => {
    const unavailable: string[] = [];
    for (const node of nodes) {
      const owned = ancestors(node.id);
      const serverAllowed =
        getEnhancementServerLockReason(serverById.get(node.id)!, owned, 4, 100_000) === null;
      expect(canUnlockNode(node, owned, 4, 100_000), node.id).toBe(serverAllowed);
      if (!serverAllowed) unavailable.push(node.id);
    }
    expect(unavailable.sort()).toEqual(
      [
        'assassin_mobility_1',
        'assassin_mobility_2',
        'assassin_mobility_3',
        'fighter_duelist_1',
        'fighter_duelist_2',
        'fighter_duelist_3',
        'mage_burst_3',
        'marksman_survival_3',
        'support_tanky_3',
        'support_utility_1',
        'support_utility_2',
        'support_utility_3',
        'tank_support_1',
        'tank_support_2',
        'tank_support_3',
      ].sort(),
    );
    expect(
      getEnhancementServerLockReason(
        serverById.get('fighter_duelist_2')!,
        { fighter_duelist_1: 1 },
        4,
        100_000,
      ),
    ).toBe('enhancement_requirement_required');
  });

  it('projects the exact authored champion scope, gate and mutually exclusive specialization paths', () => {
    for (const extension of Object.values(CHAMPION_ENHANCEMENT_SPECIALIZATIONS)) {
      for (const node of extension.branches.flatMap((branch) => branch.nodes)) {
        const server = serverById.get(node.id)!;
        expect(compareEnhancementServerNode(node, server), node.id).toEqual([]);
        expect(server.championId).toBe(extension.championId);
        const owned = ancestors(node.id);
        const context = { nodes: catalog.nodes, championId: extension.championId };
        expect(projectServerLockReason(server, owned, 4, 1000, undefined, context)).toBe(
          'enhancement_feature_disabled',
        );
        expect(
          projectServerLockReason(server, owned, 4, 1000, undefined, {
            ...context,
            enabledGates: ['champion_specializations'],
          }),
        ).toBeNull();
        expect(
          projectServerLockReason(server, owned, 4, 1000, undefined, {
            ...context,
            championId: 'wrong',
            enabledGates: ['champion_specializations'],
          }),
        ).toBe('enhancement_not_in_champion_catalog');
        expect(
          projectServerLockReason(
            server,
            { ...owned, [server.eligibility.exclusiveWith[0]]: 1 },
            4,
            1000,
            undefined,
            { ...context, enabledGates: ['champion_specializations'] },
          ),
        ).toBe(
          node.prerequisites.length
            ? 'enhancement_requirement_required'
            : 'enhancement_exclusive_conflict',
        );
      }
    }
  });

  it('models AND/OR, minimum owned ranks, ancestry and actual historical budget spend independently of the client validator', () => {
    const parent = { ...serverById.get('fighter_core_1')!, maxRanks: 2 };
    const node = {
      ...serverById.get('fighter_core_2')!,
      prerequisites: [],
      eligibility: {
        schemaVersion: 1 as const,
        exclusiveWith: [],
        budget: 100,
        requirement: {
          kind: 'or' as const,
          conditions: [
            { kind: 'node' as const, nodeId: parent.id, minRank: 2 },
            { kind: 'and' as const, conditions: [{ kind: 'node' as const, nodeId: 'missing' }] },
          ],
        },
      },
    };
    const context = { nodes: [parent, node], totalCandiesSpent: 100 - node.candyCost };
    expect(projectServerLockReason(node, { [parent.id]: 1 }, 4, 1000, undefined, context)).toBe(
      'enhancement_requirement_required',
    );
    expect(
      projectServerLockReason(node, { [parent.id]: 2 }, 4, 1000, undefined, context),
    ).toBeNull();
    expect(projectServerLockReason(node, { [parent.id]: 3 }, 4, 1000, undefined, context)).toBe(
      'enhancement_requirement_required',
    );
    expect(
      projectServerLockReason(node, { [parent.id]: 2 }, 4, 1000, undefined, {
        ...context,
        totalCandiesSpent: context.totalCandiesSpent + 1,
      }),
    ).toBe('enhancement_budget_exceeded');
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
      'active',
      'requirement',
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
          sql: 'UPDATE public.progression_rulesets SET is_active = TRUE WHERE version = 5;',
        },
      ]),
    ).toThrow('active progression ruleset must be re-audited');
  });

  it('fails closed for a changed v4 mapping or a newly opened private gate', () => {
    const mutate = (change: (sql: string) => string) =>
      migrations.map((entry) =>
        entry.path === ENHANCEMENT_SERVER_SOURCES.contractV4
          ? { ...entry, sql: change(entry.sql) }
          : entry,
      );
    expect(() =>
      extractEnhancementServerCatalog(
        mutate((sql) =>
          sql.replace(
            "'exclusiveWith',jsonb_build_array",
            "'exclusiveWithChanged',jsonb_build_array",
          ),
        ),
      ),
    ).toThrow('unreviewed specialization mapping');
    expect(() =>
      extractEnhancementServerCatalog(
        mutate((sql) => sql.replace('THEN FALSE ELSE active END', 'THEN TRUE ELSE active END')),
      ),
    ).toThrow('unsupported catalog copy 3->4');
    expect(() =>
      extractEnhancementServerCatalog(
        mutate((sql) => sql.replace('DEFAULT FALSE', 'DEFAULT TRUE')),
      ),
    ).toThrow('settings must be re-audited');
    expect(() =>
      extractEnhancementServerCatalog([
        ...migrations,
        {
          path: 'supabase/migrations/99999999999999_future.sql',
          sql: 'UPDATE private.enhancement_contract_settings SET champion_specializations_enabled=TRUE;',
        },
      ]),
    ).toThrow('unreviewed contract settings mutation');
    const changed = extractEnhancementServerCatalog(
      mutate((sql) => sql.replace('rank=1 THEN 80 ELSE 120', 'rank=1 THEN 81 ELSE 121')),
    );
    expect(changed.nodes.find((node) => node.id === 'garen_durability_1')?.candyCost).toBe(81);
    expect(changed.nodes.find((node) => node.id === 'garen_durability_2')?.candyCost).toBe(121);
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
