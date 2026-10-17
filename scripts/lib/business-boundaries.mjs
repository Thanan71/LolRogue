import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parse } from '@babel/parser';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.json'];
const PURE_REPLAY_SERVICES = new Set([
  'src/services/enhancementService.ts',
  'src/services/masteryService.ts',
  'src/services/championEconomyRunContract.ts',
]);
const EXISTING_STORE_CYCLE = new Set([
  'src/stores/authStore.ts',
  'src/stores/enhancementStore.ts',
  'src/stores/runLifecycleDependencies.ts',
  'src/stores/runStore.ts',
  'src/stores/runStoreLifecycleSlice.ts',
  'src/stores/runStoreMapSlice.ts',
]);
const FORBIDDEN_PACKAGES =
  /^(?:react(?:-dom)?(?:\/|$)|zustand(?:\/|$)|@supabase\/|react-router(?:-dom)?(?:\/|$)|@tanstack\/react-)/;

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

export function dependencyLayer(path) {
  if (!path.startsWith('src/')) return path.startsWith('data/') ? 'data' : 'external';
  if (path.startsWith('src/services/interfaces/')) return 'interfaces';
  if (path.startsWith('src/services/repositories/')) return 'repositories';
  if (path.startsWith('src/services/container/')) return 'container';
  if (path === 'src/infrastructure/repositories/applicationRepositories.ts') return 'container';
  if (path.startsWith('src/infrastructure/repositories/')) return 'repositories';
  if (path === 'src/services/supabaseClient.ts' || path === 'src/services/supabaseAuthStorage.ts') {
    return 'transport';
  }
  const layer = path.split('/')[1];
  return layer === 'domain' ? 'domain' : layer;
}

function isTypeOnlyDeclaration(node) {
  if (node.type === 'TSImportType') return true;
  if (node.importKind === 'type' || node.exportKind === 'type') return true;
  return (
    node.specifiers?.length > 0 &&
    node.specifiers.every((item) => item.importKind === 'type' || item.exportKind === 'type')
  );
}

function walkAst(node, visit) {
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'extra', 'comments', 'tokens'].includes(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) if (child?.type) walkAst(child, visit);
    } else if (value?.type) walkAst(value, visit);
  }
}

// The Node replay CLI locates the checked-in Edge verifier; no browser-facing dynamic locator is allowed.
function replayResolverLocator(path, file) {
  if (path !== 'src/game/balance/balanceReproCli.ts') return null;
  const declarations = [];
  walkAst(file, (node) => {
    if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.id.name === 'resolverUrl'
    ) {
      declarations.push(node.init);
    }
  });
  if (declarations.length !== 1) return null;
  const member = declarations[0];
  const url = member?.object;
  const call = url?.arguments?.[0];
  const cwd = call?.arguments?.[0];
  const literal = call?.arguments?.[1];
  if (
    member?.type !== 'MemberExpression' ||
    member.computed ||
    member.property.name !== 'href' ||
    url?.type !== 'CallExpression' ||
    url.callee.name !== 'pathToFileURL' ||
    url.arguments.length !== 1 ||
    call?.type !== 'CallExpression' ||
    call.callee.name !== 'resolve' ||
    call.arguments.length !== 2 ||
    cwd?.type !== 'CallExpression' ||
    cwd.arguments.length !== 0 ||
    cwd.callee.type !== 'MemberExpression' ||
    cwd.callee.object.name !== 'process' ||
    cwd.callee.property.name !== 'cwd' ||
    cwd.callee.computed ||
    literal?.type !== 'StringLiteral' ||
    literal.value !== 'supabase/functions/verify-run/authority-version-resolver.generated.ts'
  )
    return null;
  return literal.value;
}

/** Parse declarations, re-exports, import types and literal dynamic imports, without executing code. */
export function extractImportEvidence(path, source) {
  const file = parse(source, {
    sourceType: 'unambiguous',
    plugins: path.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'],
    createImportExpressions: true,
  });
  const evidence = [];
  const replayLocator = replayResolverLocator(normalizePath(path), file);
  function add(node, literal, kind) {
    const replayImport =
      kind === 'dynamic-import' && literal?.type === 'Identifier' && literal.name === 'resolverUrl'
        ? replayLocator
        : null;
    evidence.push({
      source: normalizePath(path),
      specifier: literal?.type === 'StringLiteral' ? literal.value : replayImport,
      replayLocator: replayImport !== null,
      kind,
      typeOnly: isTypeOnlyDeclaration(node),
      names: (node.specifiers ?? []).map(
        (item) => item.imported?.name ?? item.exported?.name ?? item.local?.name,
      ),
      line: node.loc.start.line,
    });
  }
  function visit(node) {
    if (node.type === 'ImportDeclaration') add(node, node.source, 'import');
    else if (
      ['ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) &&
      node.source
    ) {
      add(node, node.source, 'export');
    } else if (node.type === 'TSImportType') add(node, node.source ?? node.argument, 'import-type');
    else if (
      node.type === 'TSImportEqualsDeclaration' &&
      node.moduleReference.type === 'TSExternalModuleReference'
    ) {
      add(node, node.moduleReference.expression, 'import-equals');
    } else if (node.type === 'ImportExpression') add(node, node.source, 'dynamic-import');
    else if (
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'require'
    ) {
      add(node, node.arguments[0], 'require');
    }
  }
  walkAst(file, visit);
  return evidence;
}

/**
 * @param {string} source
 * @param {string} specifier
 * @param {Set<string>} paths
 * @param {Record<string, string[]>} [aliases]
 * @param {string} [root]
 */
function resolveInMemory(
  source,
  specifier,
  paths,
  aliases = {
    '@/*': ['./src/*'],
    '@data/*': ['./data/*'],
    '@assets/*': ['./assets/*'],
  },
  root,
) {
  let base;
  if (specifier.startsWith('.'))
    base = normalizePath(relative('/', resolve('/', dirname(source), specifier)));
  else {
    for (const [pattern, replacements] of Object.entries(aliases)) {
      const [prefix, suffix = ''] = pattern.split('*');
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
      const part = specifier.slice(prefix.length, suffix ? -suffix.length : undefined);
      for (const replacement of replacements) {
        const expanded = normalizePath(relative('/', resolve('/', replacement.replace('*', part))));
        const resolved = resolveInMemory(source, `/${expanded}`, paths, {}, root);
        if (paths.has(resolved) || (root && existsSync(resolve(root, resolved)))) return resolved;
        base ??= expanded;
      }
    }
    if (specifier.startsWith('/')) base = specifier.slice(1);
    if (!base) return specifier;
  }
  const withoutExtension = base.replace(/\.(?:js|mjs|ts|tsx)$/, '');
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((ext) => `${withoutExtension}${ext}`),
    ...SOURCE_EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
  return (
    candidates.find(
      (candidate) =>
        paths.has(candidate) ||
        (root &&
          existsSync(resolve(root, candidate)) &&
          statSync(resolve(root, candidate)).isFile()),
    ) ?? base
  );
}

/** The in-memory form also supports isolated, reversible fault-injection tests. */
export function buildImportGraph(files, resolveImport) {
  const paths = new Set(files.map((file) => normalizePath(file.path)));
  const nodes = [...paths].sort();
  const edges = files
    .flatMap((file) =>
      extractImportEvidence(file.path, file.source).map((edge) => {
        const target =
          edge.specifier === null
            ? null
            : normalizePath(
                resolveImport?.(edge.source, edge.specifier) ??
                  resolveInMemory(edge.source, edge.specifier, paths),
              );
        return { ...edge, target, internal: target !== null && paths.has(target) };
      }),
    )
    .sort((a, b) => a.source.localeCompare(b.source) || a.line - b.line);
  return { nodes, edges };
}

/** Resolve exactly the configured TypeScript aliases; generated files remain read-only. */
export function readBusinessImportGraph(root) {
  const files = [];
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = resolve(directory, item.name);
      if (item.isDirectory()) walk(path);
      else if (/\.(?:ts|tsx|mjs|js)$/.test(path)) {
        files.push({
          path: normalizePath(relative(root, path)),
          source: readFileSync(path, 'utf8'),
        });
      }
    }
  }
  walk(resolve(root, 'src'));
  if (existsSync(resolve(root, 'data'))) walk(resolve(root, 'data'));
  const config = JSON.parse(readFileSync(resolve(root, 'tsconfig.json'), 'utf8'));
  const paths = new Set(files.map((file) => file.path));
  return buildImportGraph(files, (source, specifier) =>
    resolveInMemory(source, specifier, paths, config.compilerOptions.paths, root),
  );
}

function forbiddenTarget(edge) {
  if (edge.target === null) return 'computed-import';
  if (FORBIDDEN_PACKAGES.test(edge.specifier ?? '') || FORBIDDEN_PACKAGES.test(edge.target))
    return 'ui-or-transport';
  const layer = dependencyLayer(edge.target);
  if (
    [
      'pages',
      'components',
      'hooks',
      'stores',
      'audio',
      'auth',
      'patchNotes',
      'legal',
      'transport',
      'repositories',
      'container',
      'features',
      'shared',
      'infrastructure',
    ].includes(layer)
  ) {
    return 'ui-or-transport';
  }
  if (layer === 'services' && !PURE_REPLAY_SERVICES.has(edge.target)) return 'service';
  if (layer === 'interfaces' && !edge.typeOnly) return 'repository-value';
  if (
    (edge.specifier?.startsWith('@/') ||
      edge.specifier?.startsWith('@data/') ||
      edge.specifier?.startsWith('@assets/') ||
      edge.specifier?.startsWith('.')) &&
    !edge.internal &&
    !/\.(?:json|css|svg|png|jpe?g|webp)$/.test(edge.target)
  )
    return 'unresolved-internal';
  return null;
}

function replacementFor(reason) {
  if (reason === 'computed-import')
    return 'Use a literal import of a pure src/game or src/domain module so CI can resolve it.';
  if (reason === 'unresolved-internal')
    return 'Use an existing explicit src/game, src/domain or src/types entry; fix the missing module.';
  return 'Keep rules in src/game or src/domain and pass data through src/types; inject UI/store/repository effects from the outer orchestration layer.';
}

function findReachableImports(graph, roots, predicate, { includeTypes = true } = {}) {
  const outgoing = new Map(graph.nodes.map((node) => [node, []]));
  for (const edge of graph.edges) outgoing.get(edge.source)?.push(edge);
  const queue = roots.map((node) => ({ node, chain: [node] }));
  const visited = new Set(roots);
  const forbidden = [];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const edge of outgoing.get(current.node) ?? []) {
      if (!includeTypes && edge.typeOnly) continue;
      const reason = predicate(edge);
      const chain = [...current.chain, edge.target ?? '<computed import>'];
      if (reason) forbidden.push({ edge, reason, chain });
      else if (edge.internal && edge.target && !visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push({ node: edge.target, chain });
      }
    }
  }
  return forbidden;
}

/** Follow shared data/types/replay helpers too: an allowed helper cannot conceal a React or DB dependency. */
export function checkBusinessBoundaries(graph) {
  const violations = [];
  for (const edge of graph.edges) {
    if (
      edge.source.startsWith('src/features/') &&
      (edge.target?.startsWith('src/components/CombatUI/') ||
        edge.target?.startsWith('src/components/ui/') ||
        edge.target?.startsWith('src/pages/combat/') ||
        edge.target?.startsWith('src/pages/starter/') ||
        [
          'src/pages/CombatPage.tsx',
          'src/pages/StarterSelectPage.tsx',
          'src/pages/DailyRunPage.tsx',
          'src/components/DailyLeaderboard.tsx',
          'src/hooks/useBattleManager.ts',
        ].includes(edge.target))
    ) {
      violations.push({
        ...edge,
        rule: 'feature-compatibility-direction',
        chain: [edge.source, edge.target],
        message: `${edge.source}:${edge.line} imports compatibility entry ${edge.specifier}. Import the explicit src/features implementation or src/shared/ui component; compatibility entries may depend on features, never the reverse.`,
      });
    }
    if (edge.target === 'src/services/index.ts') {
      violations.push({
        ...edge,
        rule: 'explicit-service-entry',
        chain: [edge.source, edge.target],
        message: `${edge.source}:${edge.line} imports ${edge.specifier}. Import the named domain service, interface or container entry instead of src/services/index.ts.`,
      });
    }
    if (
      dependencyLayer(edge.target ?? '') === 'repositories' &&
      !['repositories', 'container'].includes(dependencyLayer(edge.source)) &&
      edge.source !== 'src/services/index.ts'
    ) {
      violations.push({
        ...edge,
        rule: 'repository-container-boundary',
        chain: [edge.source, edge.target],
        message: `${edge.source}:${edge.line} imports ${edge.specifier}. Use @/services/container/applicationRepositories for application access or a type-only @/services/interfaces contract; concrete repository adapters belong to RepositoryContainer.`,
      });
    }
  }
  const gameRoots = graph.nodes.filter((node) => node.startsWith('src/game/'));
  for (const { edge, reason, chain } of findReachableImports(graph, gameRoots, forbiddenTarget)) {
    violations.push({
      ...edge,
      rule: 'deterministic-game-boundary',
      chain,
      message: `${edge.source}:${edge.line} imports ${edge.specifier ?? '<computed import>'}, forbidden from src/game (${chain.join(' → ')}). ${replacementFor(reason)}`,
    });
  }
  const serviceRoots = graph.nodes.filter((node) => node.startsWith('src/services/'));
  const isStore = (edge) =>
    dependencyLayer(edge.target ?? '') === 'stores' ||
    /^zustand(?:\/|$)/.test(edge.specifier ?? '');
  for (const { edge, chain } of findReachableImports(graph, serviceRoots, isStore, {
    includeTypes: false,
  })) {
    violations.push({
      ...edge,
      rule: 'service-store-boundary',
      chain,
      message: `${edge.source}:${edge.line} imports ${edge.specifier}, coupling a service to a store (${chain.join(' → ')}). Inject state readers and effects through services/runLifecycle/contracts.ts or a repository interface; compose the concrete ports in stores/runLifecycleDependencies.ts.`,
    });
  }
  for (const cycle of findImportCycles(graph)) {
    if (cycle.members.every((member) => EXISTING_STORE_CYCLE.has(member))) continue;
    const edge = cycle.evidence[0];
    violations.push({
      ...edge,
      rule: 'value-import-cycle',
      chain: cycle.members,
      message: `${edge.source}:${edge.line} participates in a value import cycle outside the existing store wiring: ${cycle.members.join(', ')}. Break the return import by injecting a port or extracting a shared contract into src/types or src/services/interfaces.`,
    });
  }
  return violations;
}

/** Strongly connected components, with the exact import lines that prove each cycle. */
export function findImportCycles(graph, { includeTypes = false } = {}) {
  const outgoing = new Map(graph.nodes.map((node) => [node, []]));
  const edges = graph.edges.filter((edge) => edge.internal && (includeTypes || !edge.typeOnly));
  for (const edge of edges) outgoing.get(edge.source)?.push(edge.target);
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const active = new Set();
  const cycles = [];
  function visit(node) {
    const index = indices.size;
    indices.set(node, index);
    low.set(node, index);
    stack.push(node);
    active.add(node);
    for (const target of outgoing.get(node) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node), low.get(target)));
      } else if (active.has(target)) low.set(node, Math.min(low.get(node), indices.get(target)));
    }
    if (low.get(node) !== indices.get(node)) return;
    const members = [];
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      members.push(member);
    } while (member !== node);
    if (members.length > 1 || outgoing.get(node)?.includes(node)) {
      const set = new Set(members);
      cycles.push({
        members: members.sort(),
        evidence: edges.filter((edge) => set.has(edge.source) && set.has(edge.target)),
      });
    }
  }
  for (const node of graph.nodes) if (!indices.has(node)) visit(node);
  return cycles.sort((a, b) => a.members[0].localeCompare(b.members[0]));
}

export function summarizeImportGraph(graph) {
  const layers = {};
  for (const edge of graph.edges) {
    if (!edge.internal) continue;
    const pair = `${dependencyLayer(edge.source)} → ${dependencyLayer(edge.target)}`;
    layers[pair] = (layers[pair] ?? 0) + 1;
  }
  return {
    sourceFiles: graph.nodes.length,
    imports: graph.edges.length,
    internalImports: graph.edges.filter((edge) => edge.internal).length,
    typeImports: graph.edges.filter((edge) => edge.typeOnly).length,
    serviceBarrelConsumers: graph.edges.filter((edge) => edge.target === 'src/services/index.ts')
      .length,
    valueSyntaxCycles: findImportCycles(graph),
    allImportCycles: findImportCycles(graph, { includeTypes: true }),
    layers: Object.fromEntries(Object.entries(layers).sort(([a], [b]) => a.localeCompare(b))),
    violations: checkBusinessBoundaries(graph),
  };
}
