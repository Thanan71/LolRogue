import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENHANCEMENT_SERVER_SOURCES = {
  seed: 'supabase/migrations/20260723090000_server_authoritative_progression.sql',
  copyV2: 'supabase/migrations/20260730220000_progression_v2_late_run_completion.sql',
  copyV3: 'supabase/migrations/20260831152608_gameplay_ruleset_v20_map_economy.sql',
  ledger: 'supabase/migrations/20261017042727_admin_metrics_candy_ledger.sql',
  snapshot: 'supabase/migrations/20260724090000_verified_run_attempts.sql',
  quarantine: 'supabase/migrations/20260724190000_harden_verified_attempt_contract.sql',
} as const;

export interface EnhancementServerNode {
  id: string;
  role: string;
  candyCost: number;
  maxRanks: number;
  requiredMasteryLevel: number;
  prerequisites: string[];
  active: boolean;
  rulesetVersion: number;
}

export interface EnhancementServerChampion {
  championId: string;
  primaryRole: string;
  active: boolean;
}

export interface EnhancementServerCatalog {
  rulesetVersion: number;
  nodes: EnhancementServerNode[];
  champions: EnhancementServerChampion[];
  sources: { path: string; sha256: string }[];
  evidence: 'repository-migrations';
}

export interface EnhancementAuditMigration {
  path: string;
  sql: string;
}

const knownCatalogWriters = new Set<string>([
  ENHANCEMENT_SERVER_SOURCES.seed,
  ENHANCEMENT_SERVER_SOURCES.copyV2,
  ENHANCEMENT_SERVER_SOURCES.copyV3,
]);
const sqlWithoutComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const compactSql = (sql: string) => sqlWithoutComments(sql).replace(/\s+/g, ' ').trim();

function requireMigration(migrations: EnhancementAuditMigration[], path: string): string {
  const found = migrations.find((migration) => migration.path === path);
  if (!found) throw new Error(`Enhancement audit: missing migration ${path}`);
  return found.sql;
}

function seedValues(sql: string, table: string, columns: string): string {
  const insertion = compactSql(sql).match(
    new RegExp(`INSERT INTO public\\.${table} \\(([^)]+)\\) VALUES (.*?);`, 'i'),
  );
  if (!insertion || insertion[1].replace(/\s+/g, '') !== columns) {
    throw new Error(`Enhancement audit: unsupported ${table} seed shape`);
  }
  return insertion[2];
}

function verifyCopy(sql: string, table: string, columns: string[], from: number, to: number) {
  const normalized = compactSql(sql);
  const selected = `${to}, ${columns.join(', ')}`;
  const expected = `SELECT ${selected} FROM public.${table} WHERE ruleset_version = ${from}`;
  if (!normalized.includes(expected)) {
    throw new Error(`Enhancement audit: unsupported ${table} copy ${from}->${to}`);
  }
}

/**
 * A deliberately narrow extractor, not a SQL interpreter. New catalog writes or
 * unsupported copy forms fail closed instead of silently reporting the old seed.
 * The database audit separately compares this projection to the active catalog.
 */
export function extractEnhancementServerCatalog(
  migrations: EnhancementAuditMigration[],
): EnhancementServerCatalog {
  for (const migration of migrations) {
    if (
      /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+public\.(?:enhancement_node_catalog|progression_champion_catalog)\b/i.test(
        sqlWithoutComments(migration.sql),
      ) &&
      !knownCatalogWriters.has(migration.path)
    ) {
      throw new Error(`Enhancement audit: unreviewed catalog mutation in ${migration.path}`);
    }
  }
  const seed = requireMigration(migrations, ENHANCEMENT_SERVER_SOURCES.seed);
  const nodeValues = seedValues(
    seed,
    'enhancement_node_catalog',
    'node_id,champion_role,candy_cost,max_rank,required_mastery_level,prerequisite_node_ids',
  );
  const row =
    /\('([a-z0-9_]+)',\s*'(assassin|fighter|mage|marksman|support|tank)',\s*(\d+),\s*(\d+),\s*(\d+),\s*ARRAY\[([^\]]*)\]::TEXT\[\]\)/g;
  const nodes = [...nodeValues.matchAll(row)].map((match) => {
    const parents = [...match[6].matchAll(/'([a-z0-9_]+)'/g)].map((parent) => parent[1]);
    if (match[6].replace(/'([a-z0-9_]+)'/g, '').replace(/[,\s]/g, '')) {
      throw new Error(`Enhancement audit: unsupported prerequisites for ${match[1]}`);
    }
    return {
      id: match[1],
      role: match[2],
      candyCost: Number(match[3]),
      maxRanks: Number(match[4]),
      requiredMasteryLevel: Number(match[5]),
      prerequisites: parents,
      active: true,
      rulesetVersion: 3,
    };
  });
  if (nodes.length !== 72 || nodeValues.replace(row, '').replace(/[,\s]/g, '')) {
    throw new Error('Enhancement audit: expected exactly 72 fully parsed server nodes');
  }
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) {
    throw new Error('Enhancement audit: duplicate server node ID');
  }
  const championValues = seedValues(
    seed,
    'progression_champion_catalog',
    'champion_id,primary_role',
  );
  const championRow = /\('([A-Za-z0-9]+)',\s*'(assassin|fighter|mage|marksman|support|tank)'\)/g;
  const champions = [...championValues.matchAll(championRow)].map((match) => ({
    championId: match[1],
    primaryRole: match[2],
    active: true,
  }));
  if (
    champions.length === 0 ||
    championValues.replace(championRow, '').replace(/[,\s]/g, '') ||
    new Set(champions.map((champion) => champion.championId)).size !== champions.length
  ) {
    throw new Error('Enhancement audit: incomplete or duplicated server champion seed');
  }
  for (const [path, from, to] of [
    [ENHANCEMENT_SERVER_SOURCES.copyV2, 1, 2],
    [ENHANCEMENT_SERVER_SOURCES.copyV3, 2, 3],
  ] as const) {
    const sql = requireMigration(migrations, path);
    verifyCopy(
      sql,
      'enhancement_node_catalog',
      [
        'node_id',
        'champion_role',
        'candy_cost',
        'max_rank',
        'required_mastery_level',
        'prerequisite_node_ids',
        'active',
      ],
      from,
      to,
    );
    verifyCopy(
      sql,
      'progression_champion_catalog',
      ['champion_id', 'primary_role', 'active'],
      from,
      to,
    );
  }
  const activations = migrations.flatMap(({ sql }) => [
    ...sqlWithoutComments(sql).matchAll(
      /UPDATE\s+public\.progression_rulesets\s+SET\s+is_active\s*=\s*TRUE\s+WHERE\s+version\s*=\s*(\d+)/gi,
    ),
  ]);
  if (activations[activations.length - 1]?.[1] !== '3') {
    throw new Error('Enhancement audit: active progression ruleset must be re-audited');
  }
  return {
    rulesetVersion: 3,
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id, 'en')),
    champions: champions.sort((left, right) =>
      left.championId.localeCompare(right.championId, 'en'),
    ),
    sources: Object.values(ENHANCEMENT_SERVER_SOURCES).map((path) => ({
      path,
      sha256: createHash('sha256').update(requireMigration(migrations, path)).digest('hex'),
    })),
    evidence: 'repository-migrations',
  };
}

export function readEnhancementServerCatalog(rootDir: string): EnhancementServerCatalog {
  const directory = join(rootDir, 'supabase/migrations');
  return extractEnhancementServerCatalog(
    readdirSync(directory)
      .filter((name) => name.endsWith('.sql'))
      .sort()
      .map((name) => ({
        path: `supabase/migrations/${name}`,
        sql: readFileSync(join(directory, name), 'utf8'),
      })),
  );
}

export function compareEnhancementServerNode(
  client: Pick<
    EnhancementServerNode,
    'id' | 'candyCost' | 'requiredMasteryLevel' | 'prerequisites'
  > & { maxRanks?: number },
  server: EnhancementServerNode | undefined,
): string[] {
  if (!server) return ['missing_server_node'];
  const differences: string[] = [];
  if (client.id !== server.id) differences.push('id');
  if (client.candyCost !== server.candyCost) differences.push('candyCost');
  if ((client.maxRanks || 1) !== server.maxRanks) differences.push('maxRanks');
  if (client.requiredMasteryLevel !== server.requiredMasteryLevel)
    differences.push('requiredMasteryLevel');
  if (
    JSON.stringify([...client.prerequisites].sort()) !==
    JSON.stringify([...server.prerequisites].sort())
  )
    differences.push('prerequisites');
  if (!server.active) differences.push('inactive_server_node');
  return differences;
}

/** Purchase fields only; this model does not assert runtime support or execute SQL. */
export function getEnhancementServerLockReason(
  node: EnhancementServerNode,
  unlockedNodes: Readonly<Record<string, number>>,
  masteryLevel: number,
  candies: number,
  expectedRank = unlockedNodes[node.id] ?? 0,
): string | null {
  if (!node.active) return 'enhancement_not_in_champion_catalog';
  if (masteryLevel < node.requiredMasteryLevel) return 'mastery_level_required';
  if (candies < node.candyCost) return 'insufficient_candies';
  const currentRank = unlockedNodes[node.id] ?? 0;
  if (currentRank !== expectedRank) return 'enhancement_rank_conflict';
  if (currentRank >= node.maxRanks) return 'enhancement_max_rank';
  const missing = node.prerequisites.find((id) => (unlockedNodes[id] ?? 0) < 1);
  return missing ? `enhancement_prerequisite_required:${missing}` : null;
}

export const ENHANCEMENT_SERVER_CONTRACT = {
  evidence: 'source-audit; actual SQL assertions live in tests/enhancementAudit.database.test.ts',
  purchaseFunction: 'public.unlock_champion_enhancement(text,text,integer,uuid)',
  implementation: 'private.unlock_champion_enhancement_pre_candy_ledger(text,text,integer,uuid)',
  authorization: {
    apiAnon: 'No EXECUTE grant or catalog SELECT grant.',
    localGuest: 'No server spending: enhancementStore checks isGuest before repository mutation.',
    authenticatedOwner:
      'auth.uid() chooses the player and enhancement owner; no user ID parameter.',
    authenticatedOther: 'Cannot read or directly mutate another owner enhancement row through RLS.',
    administrator: 'Same purchase rules and own-row restrictions; no purchase override.',
    serviceRole:
      'No EXECUTE grant on the public purchase wrapper since the Candy ledger migration.',
    authAnonymousSession:
      'No explicit is_anonymous check in purchase SQL; not equivalent to API anon or the local guest. The repository config does not opt into anonymous sign-ins; this is a conditional contract to review if enabled later.',
  },
  validationOrder: [
    'authentication_required',
    'invalid_enhancement_request',
    'player_not_found',
    'idempotency_key_reused/command_in_progress or replay',
    'active_progression_ruleset_not_found',
    'enhancement_not_in_champion_catalog',
    'mastery_level_required',
    'insufficient_candies',
    'enhancement_rank_conflict',
    'enhancement_max_rank',
    'enhancement_prerequisite_required:<id>',
  ],
  roleSelection:
    'UI/provider: champion.tags[0], exact supported tag, otherwise Fighter fallback. SQL: active progression_champion_catalog.primary_role; no secondary-tag choice.',
  maxMasteryLevel: 4,
  rankCost: 'Constant candy_cost per rank; prerequisite means rank >= 1, not maximum rank.',
  budgetCap: null,
  missingServerAttributes: [
    'localized names/descriptions',
    'branch or core membership',
    'node type',
    'effect payload/stat bonuses',
    'runtime availability/unsupported effects',
    'exclusive branch or aggregate enhancement budget',
  ],
  otherEligibility:
    'No champion-ownership or active-gameplay-kit check in this purchase RPC; active progression catalog membership is checked.',
  concurrency: [
    'Player FOR UPDATE serializes purchases, then enhancement row FOR UPDATE.',
    'expected rank rejects stale writes; one distinct command succeeds for an initial single-rank node.',
    'A repeated command with the same payload returns its original response with replayed=true.',
    'A reused command with another payload is rejected; exceptions roll back the claimed command and debit.',
    'Ledger wrapper records one negative spent entry only for a new command; replay does not spend again.',
  ],
  snapshot:
    'Run start freezes direct championId -> nodeId/rank maps; later account purchases do not mutate the attempt snapshot. Official Daily has its own neutral-loadout contract.',
  historicalRanks:
    'The 20260724190000 migration quarantines unattested ranks, preserving the original JSON in a private security baseline. TREE-01 changes none of these records or historical authority bundles.',
} as const;

export function buildEnhancementServerEvidence(rootDir: string) {
  return { catalog: readEnhancementServerCatalog(rootDir), contract: ENHANCEMENT_SERVER_CONTRACT };
}
