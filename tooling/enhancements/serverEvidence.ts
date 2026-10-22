import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENHANCEMENT_SERVER_SOURCES = {
  seed: 'supabase/migrations/20260723090000_server_authoritative_progression.sql',
  copyV2: 'supabase/migrations/20260730220000_progression_v2_late_run_completion.sql',
  copyV3: 'supabase/migrations/20260831152608_gameplay_ruleset_v20_map_economy.sql',
  ledger: 'supabase/migrations/20261017042727_admin_metrics_candy_ledger.sql',
  contractV4: 'supabase/migrations/20261022161216_enhancement_contract_v4_purchases.sql',
  reset: 'supabase/migrations/20261022162313_enhancement_atomic_resets.sql',
  analytics: 'supabase/migrations/20261022164033_admin_enhancement_analytics.sql',
  snapshot: 'supabase/migrations/20260724090000_verified_run_attempts.sql',
  snapshotV25: 'supabase/migrations/20261022164730_gameplay_ruleset_0_3_0_enhancement_trees.sql',
  quarantine: 'supabase/migrations/20260724190000_harden_verified_attempt_contract.sql',
} as const;

export type ServerEnhancementRequirement =
  | { kind: 'node'; nodeId: string; minRank?: number }
  | { kind: 'and' | 'or'; conditions: ServerEnhancementRequirement[] };
export interface EnhancementServerEligibility {
  schemaVersion: 1;
  requirement?: ServerEnhancementRequirement;
  exclusiveWith: string[];
  budget: number | null;
  gate?: 'champion_specializations';
}
export interface EnhancementServerNode {
  id: string;
  role: string;
  candyCost: number;
  maxRanks: number;
  requiredMasteryLevel: number;
  prerequisites: string[];
  active: boolean;
  rulesetVersion: number;
  championId: string | null;
  disabledReason: string | null;
  eligibility: EnhancementServerEligibility;
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
  settings: { championSpecializationsEnabled: boolean; repeatResetFeeBasisPoints: number };
}

export interface EnhancementAuditMigration {
  path: string;
  sql: string;
}

const knownCatalogWriters = new Set<string>([
  ENHANCEMENT_SERVER_SOURCES.seed,
  ENHANCEMENT_SERVER_SOURCES.copyV2,
  ENHANCEMENT_SERVER_SOURCES.copyV3,
  ENHANCEMENT_SERVER_SOURCES.contractV4,
]);
const sqlWithoutComments = (sql: string) => sql.replace(/--[^\n]*/g, '');
const tokenSql = (sql: string) => sqlWithoutComments(sql).replace(/\s+/g, '');
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

/** Project only the reviewed copy + VALUES expansion, never a second 88-node seed. */
function projectCatalogV4(sql: string, nodes: EnhancementServerNode[]): EnhancementServerNode[] {
  const normalized = tokenSql(sql);
  const statements =
    normalized.match(
      /INSERTINTOpublic\.(?:enhancement_node_catalog|progression_champion_catalog)\([^;]+;/g,
    ) ?? [];
  const championCopy =
    'INSERTINTOpublic.progression_champion_catalog(ruleset_version,champion_id,primary_role,active)SELECT4,champion_id,primary_role,activeFROMpublic.progression_champion_catalogWHEREruleset_version=3;';
  const copy = statements.find((statement) => statement.includes('SELECT4,node_id,'));
  const match = copy?.match(
    /^INSERTINTOpublic\.enhancement_node_catalog\(ruleset_version,node_id,champion_role,candy_cost,max_rank,required_mastery_level,prerequisite_node_ids,active,champion_id,disabled_reason,eligibility\)SELECT4,node_id,champion_role,candy_cost,max_rank,required_mastery_level,prerequisite_node_ids,CASEWHENnode_id=ANY\(ARRAY\[([^\]]+)\]\)THENFALSEELSEactiveEND,NULL,CASEWHENnode_id=ANY\(ARRAY\[([^\]]+)\]\)THEN'([^']+)'ELSENULLEND,eligibilityFROMpublic\.enhancement_node_catalogWHEREruleset_version=3;$/,
  );
  if (
    statements.length !== 3 ||
    !statements.includes(championCopy) ||
    !match ||
    match[1] !== match[2]
  ) {
    throw new Error('Enhancement audit: unsupported catalog copy 3->4');
  }
  const disabledIds = [...match[1].matchAll(/'([a-z0-9_]+)'/g)].map((row) => row[1]);
  if (
    match[1].replace(/'[a-z0-9_]+'/g, '').replace(/,/g, '') ||
    new Set(disabledIds).size !== disabledIds.length ||
    disabledIds.some((id) => !nodes.some((node) => node.id === id))
  ) {
    throw new Error('Enhancement audit: invalid v4 disabled IDs');
  }
  const extension = statements.find((statement) => statement.includes("lower(champion)||'_'"));
  const costs = extension?.match(
    /CASEWHENrank=1THEN(\d+)ELSE(\d+)END,1,CASEWHENrank=1THEN(\d+)ELSE(\d+)END,/,
  );
  const paths = extension?.match(
    /FROM\(VALUES(.+)\)ASpaths\(champion,role,path,other_path\)CROSSJOINgenerate_series\(1,2\)ASranks\(rank\);$/,
  );
  if (!costs || !paths) throw new Error('Enhancement audit: unsupported specialization expansion');
  const expected = `INSERT INTO public.enhancement_node_catalog(ruleset_version,node_id,champion_role,champion_id,
    candy_cost,max_rank,required_mastery_level,prerequisite_node_ids,eligibility)
    SELECT 4,lower(champion)||'_'||path||'_'||rank,role,champion,
    CASE WHEN rank=1 THEN ${costs[1]} ELSE ${costs[2]} END,1,CASE WHEN rank=1 THEN ${costs[3]} ELSE ${costs[4]} END,
    CASE WHEN rank=1 THEN ARRAY[]::text[] ELSE ARRAY[lower(champion)||'_'||path||'_1'] END,
    jsonb_build_object('schemaVersion',1,'gate','champion_specializations','budget',NULL,
    'exclusiveWith',jsonb_build_array(lower(champion)||'_'||other_path||'_1',lower(champion)||'_'||other_path||'_2'))
    FROM (VALUES ${paths[1]}) AS paths(champion,role,path,other_path) CROSS JOIN generate_series(1,2) AS ranks(rank);`;
  if (tokenSql(expected) !== extension)
    throw new Error('Enhancement audit: unreviewed specialization mapping');
  const pathRow =
    /\('([A-Za-z0-9]+)','(assassin|fighter|mage|marksman|support|tank)','([a-z0-9]+)','([a-z0-9]+)'\)/g;
  const rows = [...paths[1].matchAll(pathRow)];
  if (!rows.length || paths[1].replace(pathRow, '').replace(/,/g, ''))
    throw new Error('Enhancement audit: invalid specialization paths');
  const result = nodes.map((node) => ({
    ...node,
    rulesetVersion: 4,
    active: !disabledIds.includes(node.id),
    disabledReason: disabledIds.includes(node.id) ? match[3] : null,
  }));
  for (const row of rows)
    for (const rank of [1, 2]) {
      const prefix = `${row[1].toLowerCase()}_${row[3]}`;
      result.push({
        id: `${prefix}_${rank}`,
        role: row[2],
        championId: row[1],
        candyCost: Number(costs[rank]),
        maxRanks: 1,
        requiredMasteryLevel: Number(costs[rank + 2]),
        prerequisites: rank === 1 ? [] : [`${prefix}_1`],
        active: true,
        disabledReason: null,
        rulesetVersion: 4,
        eligibility: {
          schemaVersion: 1,
          gate: 'champion_specializations',
          budget: null,
          exclusiveWith: [1, 2].map(
            (otherRank) => `${row[1].toLowerCase()}_${row[4]}_${otherRank}`,
          ),
        },
      });
    }
  if (new Set(result.map((node) => node.id)).size !== result.length)
    throw new Error('Enhancement audit: duplicate server node ID');
  return result;
}

/**
 * A deliberately narrow extractor, not a SQL interpreter. New catalog writes or
 * unsupported copy forms fail closed instead of silently reporting the old seed.
 * The database audit separately compares this projection to the active catalog.
 */
export function extractEnhancementServerCatalog(
  migrations: EnhancementAuditMigration[],
): EnhancementServerCatalog {
  if (new Set(migrations.map((migration) => migration.path)).size !== migrations.length) {
    throw new Error('Enhancement audit: duplicate migration path');
  }
  migrations = [...migrations].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
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
  let nodes: EnhancementServerNode[] = [...nodeValues.matchAll(row)].map((match) => {
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
      championId: null,
      disabledReason: null,
      eligibility: { schemaVersion: 1, exclusiveWith: [], budget: null },
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
  const settingsWrites = migrations.flatMap(({ path, sql }) =>
    [
      ...tokenSql(sql).matchAll(
        /(?:INSERTINTO|UPDATE|DELETEFROM|TRUNCATE(?:TABLE)?)private\.enhancement_contract_settings[^;]*;/g,
      ),
    ].map(([statement]) => ({ path, statement })),
  );
  if (
    settingsWrites.length !== 1 ||
    settingsWrites[0].path !== ENHANCEMENT_SERVER_SOURCES.contractV4 ||
    settingsWrites[0].statement !== 'INSERTINTOprivate.enhancement_contract_settingsDEFAULTVALUES;'
  ) {
    throw new Error('Enhancement audit: unreviewed contract settings mutation');
  }
  const contractV4 = requireMigration(migrations, ENHANCEMENT_SERVER_SOURCES.contractV4);
  nodes = projectCatalogV4(contractV4, nodes);
  if (
    !tokenSql(contractV4).includes('champion_specializations_enabledBOOLEANNOTNULLDEFAULTFALSE') ||
    !tokenSql(contractV4).includes('repeat_reset_fee_basis_pointsINTEGERNOTNULLDEFAULT0')
  ) {
    throw new Error('Enhancement audit: feature/reset settings must be re-audited');
  }
  const activations = migrations.flatMap(({ sql }) => [
    ...sqlWithoutComments(sql).matchAll(
      /UPDATE\s+public\.progression_rulesets\s+SET\s+is_active\s*=\s*TRUE\s+WHERE\s+version\s*=\s*(\d+)/gi,
    ),
  ]);
  if (activations[activations.length - 1]?.[1] !== '4') {
    throw new Error('Enhancement audit: active progression ruleset must be re-audited');
  }
  return {
    rulesetVersion: 4,
    settings: { championSpecializationsEnabled: false, repeatResetFeeBasisPoints: 0 },
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
  > & {
    maxRanks?: number;
    enabled?: boolean;
    exclusiveWith?: readonly string[];
    requirement?: ServerEnhancementRequirement;
    gate?: 'champion_specializations';
  },
  server: EnhancementServerNode | undefined,
): string[] {
  if (!server) return ['missing_server_node'];
  const differences: string[] = [];
  if (client.id !== server.id) differences.push('id');
  if (client.candyCost !== server.candyCost) differences.push('candyCost');
  if ((client.maxRanks ?? 1) !== server.maxRanks) differences.push('maxRanks');
  if (client.requiredMasteryLevel !== server.requiredMasteryLevel)
    differences.push('requiredMasteryLevel');
  const same = (a: readonly string[], b: readonly string[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (!same(client.prerequisites, server.prerequisites)) differences.push('prerequisites');
  if ((client.enabled ?? true) !== server.active) differences.push('active');
  if (!same(client.exclusiveWith ?? [], server.eligibility.exclusiveWith))
    differences.push('exclusiveWith');
  if (client.gate !== server.eligibility.gate) differences.push('gate');
  const requirement = (entry: {
    requirement?: ServerEnhancementRequirement;
    prerequisites: string[];
  }) =>
    entry.requirement ?? {
      kind: 'and',
      conditions: entry.prerequisites.map((nodeId) => ({ kind: 'node', nodeId, minRank: 1 })),
    };
  if (
    JSON.stringify(requirement(client)) !==
    JSON.stringify(requirement({ ...server, ...server.eligibility }))
  )
    differences.push('requirement');
  return differences;
}

/** Independent SQL-source projection, not a database execution or client-validator alias. */
export function getEnhancementServerLockReason(
  node: EnhancementServerNode,
  unlockedNodes: Readonly<Record<string, number>>,
  masteryLevel: number,
  candies: number,
  expectedRank = unlockedNodes[node.id] ?? 0,
  context: {
    nodes?: readonly EnhancementServerNode[];
    championId?: string;
    enabledGates?: readonly string[];
    totalCandiesSpent?: number;
  } = {},
): string | null {
  if (!node.active || (node.championId !== null && node.championId !== context.championId))
    return 'enhancement_not_in_champion_catalog';
  if (node.eligibility.gate && !context.enabledGates?.includes(node.eligibility.gate))
    return 'enhancement_feature_disabled';
  if (masteryLevel < node.requiredMasteryLevel) return 'mastery_level_required';
  if (candies < node.candyCost) return 'insufficient_candies';
  const currentRank = unlockedNodes[node.id] ?? 0;
  if (currentRank !== expectedRank) return 'enhancement_rank_conflict';
  if (currentRank >= node.maxRanks) return 'enhancement_max_rank';
  const requirementFor = (entry: EnhancementServerNode): ServerEnhancementRequirement =>
    entry.eligibility.requirement ?? {
      kind: 'and',
      conditions: entry.prerequisites.map((nodeId) => ({ kind: 'node', nodeId, minRank: 1 })),
    };
  const requirementSatisfied = (
    requirement: ServerEnhancementRequirement,
    seen: string[],
  ): boolean => {
    if (seen.length > 64) return false;
    if (requirement.kind !== 'node')
      return requirement.kind === 'and'
        ? requirement.conditions.every((condition) => requirementSatisfied(condition, seen))
        : requirement.conditions.some((condition) => requirementSatisfied(condition, seen));
    const parent = context.nodes?.find((entry) => entry.id === requirement.nodeId);
    // A missing catalog cannot establish whether an owned parent is still legal.
    if (
      !parent ||
      seen.includes(parent.id) ||
      !parent.active ||
      parent.role !== node.role ||
      (parent.championId !== null && parent.championId !== context.championId) ||
      masteryLevel < parent.requiredMasteryLevel
    )
      return false;
    const rank = unlockedNodes[parent.id];
    if (
      !Number.isSafeInteger(rank) ||
      rank < (requirement.minRank ?? 1) ||
      rank > parent.maxRanks ||
      parent.eligibility.exclusiveWith.some((id) => (unlockedNodes[id] ?? 0) > 0)
    )
      return false;
    // Purchase gates are deliberately not rechecked on previously attested parents.
    return requirementSatisfied(requirementFor(parent), [...seen, parent.id]);
  };
  if (!requirementSatisfied(requirementFor(node), [node.id])) {
    const missing = node.prerequisites.find((id) => (unlockedNodes[id] ?? 0) < 1);
    return missing
      ? `enhancement_prerequisite_required:${missing}`
      : 'enhancement_requirement_required';
  }
  if (node.eligibility.exclusiveWith.some((id) => (unlockedNodes[id] ?? 0) > 0))
    return 'enhancement_exclusive_conflict';
  if (
    node.eligibility.budget !== null &&
    (context.totalCandiesSpent ?? 0) + node.candyCost > node.eligibility.budget
  )
    return 'enhancement_budget_exceeded';
  return null;
}

export const ENHANCEMENT_SERVER_CONTRACT = {
  evidence:
    'repository source projection; database assertions require the disposable local SQL suite',
  catalogVersion: 4,
  contractSchemaVersion: 1,
  purchaseFunction: 'public.unlock_champion_enhancement_v2(text,text,integer,integer,uuid,integer)',
  legacyPurchaseFunction: 'public.unlock_champion_enhancement(text,text,integer,uuid)',
  implementation: 'private.purchase_enhancement_v4(text,text,integer,integer,uuid)',
  authorization: {
    apiAnon: 'No EXECUTE grant on contract, purchase, reset preview or reset RPCs.',
    localGuest: 'No server wallet spending; the store and UI expose exploration only.',
    authenticatedOwner: 'auth.uid() chooses the owner; no user ID parameter.',
    authenticatedOther: 'Owner RLS and no direct authenticated table writes.',
    administrator: 'Same purchase and reset conditions, with no administrator bypass.',
    serviceRole: 'No EXECUTE grant on the public purchase/reset RPCs or private implementations.',
    authAnonymousSession:
      'private.enhancement_require_account explicitly rejects auth.users.is_anonymous.',
  },
  validationOrder: [
    'authentication_required / registered_account_required',
    'invalid_enhancement_request',
    'player_not_found',
    'idempotency_key_reused / command_in_progress or replay',
    'enhancement_catalog_conflict (v2 wrapper)',
    'active_progression_ruleset_not_found',
    'enhancement_not_in_champion_catalog',
    'enhancement_feature_disabled',
    'mastery_level_required',
    'insufficient_candies',
    'enhancement_revision_conflict (v2)',
    'enhancement_rank_conflict',
    'enhancement_max_rank',
    'enhancement_prerequisite_required:<id> / enhancement_requirement_required',
    'enhancement_exclusive_conflict',
    'enhancement_budget_exceeded',
  ],
  roleSelection:
    'First tag selects the shared role, unknown tags fall back to Fighter; extensions require the authored champion AND role. SQL independently checks active canonical primary_role and champion_id.',
  maxMasteryLevel: 4,
  rankCost:
    'Constant candy_cost per rank; declarative AND/OR and minimum parent ranks; parents must themselves remain active and legally owned.',
  budgetCap: null,
  budgetAccounting:
    'Optional eligibility.budget compares actual total_candies_spent + candy_cost, not a recomputed current catalogue price.',
  purchaseGate:
    'The private champion_specializations_enabled setting defaults to FALSE. Closing purchases does not revoke attested owned bonuses or frozen run snapshots.',
  missingServerAttributes: [
    'localized descriptions',
    'branch/core presentation',
    'stat and effect payloads',
  ],
  otherEligibility:
    'Active progression catalogue membership is checked; this RPC does not additionally check permanent champion ownership or a maintained gameplay kit.',
  concurrency: [
    'Player FOR UPDATE serializes wallet changes before locking the enhancement row.',
    'V2 requires expected rank, revision and catalogue; the active catalogue row stays locked through commit.',
    'A repeated command returns its original response with replayed=true; altered payload reuse fails.',
    'One spent ledger entry accompanies a new debit; transaction rollback prevents partial purchases.',
    'Legacy four-parameter callers use the same private rules, but have no expected revision argument.',
  ],
  reset: {
    previewFunction: 'public.get_enhancement_reset_preview(text)',
    mutationFunction: 'public.reset_champion_enhancements(text,integer,uuid,integer)',
    actualSpend:
      'Contiguous rank receipts from completed commands in the current reset generation; post-ledger purchases must also match their exact negative ledger debit.',
    refund:
      'Actual attested spend minus the quoted repeat fee; current repeat fee is zero, including subsequent resets.',
    errors: [
      'history_unavailable',
      'tree_empty',
      'balance_limit',
      'enhancement_revision_conflict',
      'enhancement_reset_policy_conflict',
    ],
    preserved: ['mastery', 'Shards', 'champion ownership', 'frozen run snapshots'],
    concurrency:
      'One atomic refund ledger entry, wallet credit, cleared ranks/spend and incremented revision/reset_count; idempotent response retained.',
  },
  analytics: {
    function: 'private.admin_balance_tree_data',
    scope:
      'Aggregate purchases, refunds and verified frozen run cohorts; no account identifiers. Builds are grouped by frozen snapshot and exact authority context.',
    limitation:
      'Frozen cohort associations are descriptive, not causal evidence that an enhancement improves victory probability.',
  },
  snapshot:
    'private.active_enhancement_snapshot and freeze_run_attempt_enhancements_v25 freeze legal championId -> nodeId/rank maps using the actual mastery snapshot. Later purchase/reset/gate changes must not rewrite an existing attempt; official Daily retains its neutral loadout.',
  historicalRanks:
    'Unsupported purchased IDs remain owned for historical evidence and attested refund. Active bonuses filter illegal ancestry. Historical authority bundles are separate immutable artifacts; this offline report does not certify their replay or an Edge deployment.',
} as const;

export function buildEnhancementServerEvidence(rootDir: string) {
  return { catalog: readEnhancementServerCatalog(rootDir), contract: ENHANCEMENT_SERVER_CONTRACT };
}
