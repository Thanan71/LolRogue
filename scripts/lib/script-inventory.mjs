import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

export const INVENTORY_PATH = 'docs/scripts-inventory.json';
export const EQUIVALENCE_PATH = 'docs/script-inventory.md';
export const BASELINE_PATH = 'config/scripts-inventory-baseline.json';
const GENERATED_PATHS = new Set([INVENTORY_PATH, EQUIVALENCE_PATH]);
const TEXT_EXTENSIONS = /\.(?:md|mjs|cjs|js|jsx|ts|tsx|yml|yaml|sh)$/;
const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const sorted = (values) => [...new Set(values)].sort(compare);

function fail(message) {
  throw new Error(`Script inventory: ${message}`);
}

export function loadScriptInventoryBaseline(root = process.cwd()) {
  const baseline = JSON.parse(readFileSync(resolve(root, BASELINE_PATH), 'utf8'));
  if (baseline?.schemaVersion !== 1 || !baseline.scripts || Array.isArray(baseline.scripts)) {
    fail(`${BASELINE_PATH} must declare schemaVersion 1 and an initial scripts object.`);
  }
  for (const [name, command] of Object.entries(baseline.scripts)) {
    if (!name || typeof command !== 'string' || !command.trim()) {
      fail(`invalid initial script ${JSON.stringify(name)}.`);
    }
  }
  return baseline;
}

function collectSourcePaths(root) {
  const paths = [];
  function visit(path) {
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const next = `${path}/${entry.name}`;
      if (entry.isDirectory()) visit(next);
      else if (TEXT_EXTENSIONS.test(next) && !GENERATED_PATHS.has(next)) paths.push(next);
    }
  }
  for (const directory of ['.github/workflows', 'docs', 'tests', 'scripts']) visit(directory);
  if (existsSync(resolve(root, 'README.md'))) paths.push('README.md');
  return sorted(paths);
}

function sourceKind(path) {
  if (path.startsWith('.github/workflows/')) return 'workflow';
  if (path === 'README.md' || path.startsWith('docs/')) return 'documentation';
  if (path.startsWith('tests/')) return 'test';
  return 'script';
}

/** Literal npm calls and subprocess argument arrays; dynamic calls remain explicit evidence. */
export function extractNpmReferences(text, file) {
  const references = [];
  function isNpmArgumentArray(index) {
    const prefix = text.slice(Math.max(0, index - 350), index);
    if (
      /(?:spawn(?:Sync)?|execFile(?:Sync)?|run)\s*\(\s*(?:['"]npm(?:\.cmd)?['"]|npmCommand|npmExecutable)\s*,\s*$/.test(
        prefix,
      )
    )
      return true;
    return (
      /args:\s*$/.test(prefix) &&
      /command:\s*['"]npm(?:\.cmd)?['"]/.test(prefix.slice(prefix.lastIndexOf('{')))
    );
  }
  const patterns = [
    {
      kind: 'npm-run',
      expression:
        /\bnpm(?:[ \t]+--[a-z-]+(?:=[^\s"'`]+)?)*\s+(?:run|run-script)(?:[ \t]+--[a-z-]+)*\s+['"]?([A-Za-z0-9][A-Za-z0-9:._-]*)/g,
    },
    {
      kind: 'process-arguments',
      expression: /\[\s*['"]run['"]\s*,\s*['"]([A-Za-z0-9][A-Za-z0-9:._-]*)['"]/g,
    },
    { kind: 'npm-lifecycle', expression: /\bnpm\s+(test|start)(?=\s|[;`'"\)]|$)/g },
  ];
  for (const { kind, expression } of patterns) {
    for (const match of text.matchAll(expression)) {
      const index = match.index;
      if (kind === 'process-arguments' && !isNpmArgumentArray(index)) continue;
      const line = text.slice(0, index).split('\n').length;
      references.push({
        name: match[1].replace(/[.:]+$/, ''),
        file,
        line,
        kind,
        source: sourceKind(file),
        excerpt: text.split('\n')[line - 1].trim().slice(0, 220),
      });
    }
  }
  // Repository runners use named literal variables to select their npm child command.
  for (const match of text.matchAll(/\[\s*['"]run['"]\s*,\s*([A-Za-z_$][\w$]*)\s*[,\]]/g)) {
    if (!isNpmArgumentArray(match.index)) continue;
    const declaration = new RegExp(`\\b(?:const|let)\\s+${match[1]}\\s*=\\s*([^;]+);`);
    const value = declaration.exec(text)?.[1];
    const resolved = value
      ? [...value.matchAll(/['"]([A-Za-z0-9][A-Za-z0-9:._-]*)['"]/g)].map((item) => item[1])
      : [];
    const line = text.slice(0, match.index).split('\n').length;
    for (const name of resolved.length ? sorted(resolved) : [null])
      references.push({
        name,
        variable: match[1],
        file,
        line,
        kind: 'dynamic-process-arguments',
        source: sourceKind(file),
        excerpt: text.split('\n')[line - 1].trim().slice(0, 220),
      });
  }
  return references.sort(
    (a, b) => compare(a.file, b.file) || a.line - b.line || compare(a.kind, b.kind),
  );
}

const DOMAINS = [
  {
    pattern: /^balance(?:$|:)/,
    owner: 'game-balance',
    inputs: ['Authority registry, frozen engine bundles and balance fixtures in config/'],
    preconditions: [
      'Node 24 and installed dependencies; bundle the requested authority engine first',
    ],
  },
  {
    pattern: /^(?:authority:|edge:)/,
    owner: 'run-authority',
    inputs: [
      'config/authority-versions.json, deterministic game source and historical authority bundles',
    ],
    preconditions: [
      'Node 24; preserve registered historical hashes; Supabase CLI for serve/deploy',
    ],
  },
  {
    pattern: /^(?:database$|db:|check:db$|migrate$|economy:audit$|test:db)/,
    owner: 'database',
    inputs: ['supabase/migrations, database contracts, local Supabase configuration'],
    preconditions: [
      'Supabase CLI; Docker for local stack; explicit target and credentials for linked operations',
    ],
  },
  {
    pattern: /^(?:assets(?:$|:)|ddragon:|test:(?:assets|deployed-assets|production-build))/,
    owner: 'asset-pipeline',
    inputs: [
      'Riot source assets, champion data, config asset manifests and dist/ where applicable',
    ],
    preconditions: [
      'Node 24; download/parse before packaging; build before dist/deployed verification',
    ],
  },
  {
    pattern: /^(?:backend:|release(?:$|:)|backup:|ops:)/,
    owner: 'release-operations',
    inputs: ['Release policy, Git identity, environment target and backup/restore configuration'],
    preconditions: [
      'Node 24; main targets production and dev targets LolRogueDev; never expose service-role keys',
    ],
  },
  {
    pattern: /^(?:content:|i18n:)/,
    owner: 'content-localization',
    inputs: ['FR/EN catalogues and champion/content admission contracts'],
    preconditions: ['Node 24 and installed dependencies'],
  },
];

function metadata(name, command, descriptor) {
  const domain = DOMAINS.find(({ pattern }) => pattern.test(name)) ?? {
    owner: 'developer-tooling',
    inputs: ['Repository source, tooling configuration and the selected tests or build output'],
    preconditions: ['Run from the repository root with Node 24 and npm ci dependencies'],
  };
  let risk = 'read-only';
  let effects = ['Reads repository inputs; may write disposable tooling reports or caches'];
  if (/^(?:migrate$|edge:deploy$|backend:deploy$)/.test(name)) {
    risk = 'remote';
    effects = ['Can mutate a remote database, Edge function or frontend deployment'];
  } else if (
    /^(?:db:reset$|db:validate$|check:db$|ops:restore-drill$|test:db:rollback$)/.test(name)
  ) {
    risk = 'destructive-local';
    effects = [
      'Resets/recreates a disposable local database; requires explicit confirmation in the canonical CLI',
    ];
  } else if (
    /(?:generate|package|download|parse)$/.test(name) ||
    (/scripts\/generate-scripts-inventory\.mjs/.test(command) && !/--check/.test(command)) ||
    /^(?:postinstall|format|build|prebuild|postbuild|db:types|db:types:check|assets:update|authority:generate|edge:bundle|edge:serve|backup:database|check:build|check|test:assets-clean)$/.test(
      name,
    )
  ) {
    risk = 'generate';
    effects = [
      'Writes generated files, build/dependency outputs or local reports; review the resulting diff',
    ];
  }
  if (descriptor?.risk && descriptor.risk !== risk) {
    risk = descriptor.risk;
    effects =
      risk === 'read-only'
        ? [
            'Reads inputs without changing tracked files; may write disposable reports or tooling caches',
          ]
        : ['Writes generated files, local tooling state or reports; review the resulting diff'];
  }
  // A verification command can generate first: expose that effect rather than infer safety from its name.
  if (name === 'db:types:check' && /supabase gen/.test(command))
    effects = ['Regenerates tracked src/types/database.ts, then rejects Git differences'];
  if (name === 'db:start' || name === 'db:stop')
    effects = ['Starts or stops the configured local Docker/Supabase stack'];
  if (name === 'postinstall')
    effects = ['Patches installed Supabase Auth dependency; npm ci fails if the contract changes'];
  if (name === 'migrate')
    effects = [
      'Pushes migrations to the explicitly selected or linked remote Supabase project; preserve native Supabase CLI confirmation',
    ];
  if (name === 'edge:deploy')
    effects = [
      'Bundles authority locally, then deploys verify-run to the explicitly selected or linked Supabase project',
    ];
  if (name === 'backend:deploy')
    effects = [
      'Deploys Edge, migrations and frontend to dev/LolRogueDev or main/production; requires effective branch and explicit confirmation',
    ];
  const flags = sorted(command.match(/--[a-z][a-z0-9-]*(?:=[^\s]+)?/g) ?? []);
  return {
    owner: descriptor?.owner ?? domain.owner,
    risk: descriptor?.risk ?? risk,
    inputs: sorted([...domain.inputs, ...(descriptor?.inputs ?? [])]),
    preconditions: sorted([...domain.preconditions, ...(descriptor?.preconditions ?? [])]),
    effects,
    executionScope: descriptor?.dispatcher
      ? 'dispatch; scope depends on selected subcommand'
      : risk === 'remote'
        ? 'remote-target'
        : domain.owner === 'database'
          ? 'database; local unless explicit linked read is supported'
          : 'local-files-or-tooling',
    privileges: descriptor?.dispatcher
      ? [
          'Selected subcommand determines Docker, database or remote project privileges; help does not authorize an operation',
        ]
      : risk === 'remote'
        ? [
            'Authorized project/deployment credentials in the CLI environment; never print or commit secrets',
          ]
        : domain.owner === 'database'
          ? [
              'Configured local Supabase roles; explicit linked audits require project read credentials',
            ]
          : [
              'Repository/dependency/output filesystem access; network access where the selected tool requires it',
            ],
    arguments: {
      fixed: flags,
      supported: descriptor
        ? sorted(Object.keys(descriptor.options ?? {}).map((flag) => `--${flag}`))
        : [],
      forwarding: command.includes('scripts/cli.mjs')
        ? 'npm run <name> -- <arguments>; CLI validates documented options strictly; use the canonical command to override fixed alias options'
        : 'npm run <name> -- <arguments>; underlying tool validates legacy flags',
    },
  };
}

function classifications(name, command, callers, risk) {
  const kinds = new Set();
  if (callers.some(({ source }) => source === 'workflow')) kinds.add('CI');
  if (
    /^(?:check|test|typecheck|lint|node:contract|audit:security|content:check|i18n:check|csp:)/.test(
      name,
    )
  )
    kinds.add('CI');
  if (/^(?:backend:deploy|edge:deploy|migrate|release:)/.test(name)) kinds.add('deployment');
  if (risk === 'generate' || /generate/.test(name)) kinds.add('generation');
  if (/^(?:db:|ops:|backup:|postinstall|format$|authority:)/.test(name)) kinds.add('maintenance');
  if (/(?:audit|measure|stats|repro|cohort|preview|list|watch|strict)/.test(name))
    kinds.add('diagnostic');
  if (/:(?:v\d+)$/.test(name) || /--engine v\d+/.test(command)) kinds.add('historical');
  if (!kinds.size || /^(?:dev|build|prebuild|postbuild|preview|test$|check$)$/.test(name))
    kinds.add('current');
  return sorted(kinds);
}

function replacementFor(name, descriptor) {
  if (!descriptor) return `npm run ${name}`;
  const options = descriptor.aliasOptions?.[name] ?? [];
  return [descriptor.replacement, ...options].join(' ');
}

export function buildScriptInventory(root = process.cwd(), { catalog = [] } = {}) {
  const packageText = readFileSync(resolve(root, 'package.json'), 'utf8');
  const packageJson = JSON.parse(packageText);
  const scripts = packageJson.scripts;
  if (!scripts || Array.isArray(scripts)) fail('package.json has no scripts object.');
  if (!Array.isArray(catalog)) fail('canonical command catalog must be an array.');
  const baseline = loadScriptInventoryBaseline(root);
  for (const name of Object.keys(baseline.scripts)) {
    if (!Object.hasOwn(scripts, name))
      fail(`initial public alias ${name} was removed before consumer migration.`);
  }
  const descriptors = new Map();
  for (const descriptor of catalog) {
    for (const alias of descriptor.aliases ?? []) {
      if (descriptors.has(alias)) fail(`canonical CLI declares duplicate alias ${alias}.`);
      descriptors.set(alias, descriptor);
    }
  }

  const sourcePaths = collectSourcePaths(root);
  const references = sourcePaths.flatMap((path) =>
    extractNpmReferences(readFileSync(resolve(root, path), 'utf8'), path),
  );
  /** @type {Map<string, string[]>} */
  const dependencies = new Map(Object.keys(scripts).map((name) => [name, []]));
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== 'string' || !command.trim())
      fail(`script ${name} has an empty command.`);
    const line =
      packageText.split('\n').findIndex((value) => value.includes(`${JSON.stringify(name)}:`)) + 1;
    for (const reference of extractNpmReferences(command, 'package.json')) {
      references.push({ ...reference, line, source: 'npm-chain', parent: name, excerpt: command });
      if (reference.name && Object.hasOwn(scripts, reference.name))
        dependencies.get(name)?.push(reference.name);
    }
    for (const prefix of ['pre', 'post']) {
      const hook = `${prefix}${name}`;
      if (Object.hasOwn(scripts, hook)) {
        dependencies.get(name)?.push(hook);
        references.push({
          name: hook,
          file: 'package.json',
          line,
          source: 'npm-lifecycle',
          kind: 'implicit-hook',
          parent: name,
          excerpt: `npm automatically runs ${hook} ${prefix === 'pre' ? 'before' : 'after'} ${name}`,
        });
      }
    }
  }
  if (Object.hasOwn(scripts, 'postinstall')) {
    for (const path of sourcePaths) {
      const text = readFileSync(resolve(root, path), 'utf8');
      for (const match of text.matchAll(/\bnpm\s+(?:ci|install)(?=\s|[;`'"\)]|$)/g)) {
        const line = text.slice(0, match.index).split('\n').length;
        const commandLine = text.split('\n')[line - 1];
        if (/(?:^|\s)(?:-g|--global|--ignore-scripts)(?:\s|[;`'"\)]|$)/.test(commandLine)) continue;
        references.push({
          name: 'postinstall',
          file: path,
          line,
          source: sourceKind(path),
          kind: 'implicit-install-hook',
          excerpt: text.split('\n')[line - 1].trim().slice(0, 220),
        });
      }
    }
  }
  const unknownReferences = references.filter(({ name }) => name && !Object.hasOwn(scripts, name));
  const unresolvedReferences = references.filter(({ name }) => !name);
  const executableUnknowns = unknownReferences.filter(({ source }) =>
    ['workflow', 'script', 'npm-chain'].includes(source),
  );
  if (executableUnknowns.length) {
    fail(
      `unknown npm reference ${executableUnknowns[0].name} at ${executableUnknowns[0].file}:${executableUnknowns[0].line}.`,
    );
  }

  const entries = sorted(Object.keys(scripts)).map((name) => {
    const callers = references
      .filter((reference) => reference.name === name)
      .map(({ name: _, ...reference }) => reference);
    const indirectCallers = [];
    const visited = new Set([name]);
    /** @type {{name: string, via: string[]}[]} */
    const queue = [{ name, via: [] }];
    while (queue.length) {
      const current = queue.shift();
      if (!current) continue;
      for (const [parent, targets] of dependencies) {
        if (!targets.includes(current.name) || visited.has(parent)) continue;
        visited.add(parent);
        const via = [parent, ...current.via];
        for (const reference of references.filter((ref) => ref.name === parent && !ref.parent)) {
          const { name: _, ...caller } = reference;
          indirectCallers.push({ ...caller, via });
        }
        queue.push({ name: parent, via });
      }
    }
    const groupCommands = catalog.filter((command) => command.group === name);
    const descriptor =
      descriptors.get(name) ??
      (groupCommands.length
        ? {
            owner: groupCommands[0].owner,
            risk: 'read-only',
            dispatcher: true,
            replacement: `npm run ${name}`,
            inputs: sorted(groupCommands.flatMap((command) => command.inputs ?? [])),
            preconditions: [
              'Select an explicit subcommand; --help lists its risk, arguments and requirements',
            ],
          }
        : undefined);
    const details = metadata(name, scripts[name], descriptor);
    const allCallers = [...callers, ...indirectCallers];
    const external = allCallers.some(({ source }) =>
      ['workflow', 'documentation', 'npm-lifecycle'].includes(source),
    );
    return {
      name,
      command: scripts[name],
      initial: Object.hasOwn(baseline.scripts, name),
      initialCommand: baseline.scripts[name] ?? null,
      commandChanged:
        Object.hasOwn(baseline.scripts, name) && baseline.scripts[name] !== scripts[name],
      public: true,
      contract: external ? 'external' : 'internal',
      kind: groupCommands.length ? 'canonical-group' : 'script',
      ...(groupCommands.length
        ? { subcommandRisks: sorted(groupCommands.map(({ risk }) => risk)) }
        : {}),
      classifications: classifications(name, scripts[name], allCallers, details.risk),
      ...details,
      replacement: replacementFor(name, descriptor),
      compatibility: Object.hasOwn(baseline.scripts, name)
        ? 'retained; migrate consumers in a separate PR before removal or deprecation'
        : 'added public entry; initial aliases remain compatible',
      referenceStatus:
        callers.length || indirectCallers.length
          ? 'referenced'
          : 'unreferenced; utility review required, not evidence of disuse',
      dependencies: sorted(dependencies.get(name)),
      callers: callers.sort(
        (a, b) => compare(a.file, b.file) || a.line - b.line || compare(a.kind, b.kind),
      ),
      indirectCallers: indirectCallers.sort(
        (a, b) =>
          compare(a.file, b.file) || a.line - b.line || compare(a.via.join(':'), b.via.join(':')),
      ),
    };
  });
  return {
    schemaVersion: 1,
    baseline: BASELINE_PATH,
    initialCount: Object.keys(baseline.scripts).length,
    currentCount: entries.length,
    canonicalGroups: sorted(
      catalog
        .map(({ group }) => group)
        .filter((group) => typeof group === 'string' && Object.hasOwn(scripts, group)),
    ),
    scanRoots: [
      '.github/workflows',
      'README.md',
      'docs',
      'tests',
      'scripts',
      'package.json#scripts',
    ],
    scanPolicy:
      'Literal npm commands, literal/resolved subprocess arrays, npm chains and implicit hooks; excerpts are references, not proof of execution. Generated inventory files excluded to avoid self-references.',
    compatibilityPolicy:
      'Every initial alias remains public. Unreferenced does not mean unused. External CI/documentation/hook consumers and transitive calls must migrate before removal.',
    unknownReferences,
    unresolvedReferences,
    scripts: entries,
  };
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderScriptInventory(inventory) {
  const lines = [
    '# Inventaire des scripts npm',
    '',
    'Fichier généré par `node scripts/generate-scripts-inventory.mjs`. Source machine : [scripts-inventory.json](scripts-inventory.json).',
    '',
    `${inventory.initialCount} alias initiaux conservés, ${inventory.currentCount} entrées actuelles. Les catégories, propriétaires, entrées, préconditions, arguments et risques détaillés figurent dans le JSON.`,
    '',
    `Entrées publiques canoniques : ${inventory.canonicalGroups.map((group) => `\`npm run ${group} -- <sous-commande>\``).join(', ') || 'aucun groupe déclaré'}. Les raccourcis initiaux restent disponibles.`,
    '',
    'Les consommateurs sont des références textuelles exactes (fichier et ligne), des chaînes npm et des hooks implicites. Une référence dans un test ou un document ne prouve pas une exécution. « Non référencé » impose une revue d’utilité avant toute suppression. Aucun alias n’est déprécié dans ARCH-S1 ; leur retrait exige une PR de migration distincte et une CI verte.',
    '',
    '| Nom npm initial ou ajouté | Appel canonique | Consommateurs directs et indirects | Contrat / compatibilité |',
    '| --- | --- | --- | --- |',
  ];
  for (const entry of inventory.scripts) {
    const consumerFiles = sorted(
      [...entry.callers, ...entry.indirectCallers].map(({ file }) => file),
    );
    const consumers = consumerFiles.map((file) => {
      const direct = entry.callers.filter((caller) => caller.file === file).length;
      const indirect = entry.indirectCallers.filter((caller) => caller.file === file).length;
      return `${file} (${direct} direct, ${indirect} indirect)`;
    });
    lines.push(
      `| \`${markdownCell(entry.name)}\` | \`${markdownCell(entry.replacement)}\` | ${markdownCell(consumers.join('; ') || 'Non référencé ; revue d’utilité requise')} | ${entry.contract} ; ${entry.initial ? 'alias conservé' : 'nouvelle entrée'} |`,
    );
  }
  lines.push(
    '',
    'Les sources à commande dynamique non résolue et les références documentaires inconnues sont listées séparément dans le JSON. Une référence inconnue dans un workflow, un script exécutable ou une chaîne npm fait échouer la génération.',
    '',
  );
  return {
    [INVENTORY_PATH]: `${JSON.stringify(inventory, null, 2)}\n`,
    [EQUIVALENCE_PATH]: lines.join('\n'),
  };
}

export function checkScriptInventory(root, outputs) {
  return Object.entries(outputs)
    .filter(
      ([path, expected]) =>
        !existsSync(resolve(root, path)) || readFileSync(resolve(root, path), 'utf8') !== expected,
    )
    .map(([path]) => path);
}

function sourceFingerprint(root) {
  const hash = createHash('sha256');
  for (const path of ['package.json', BASELINE_PATH, ...collectSourcePaths(root)]) {
    hash
      .update(path)
      .update('\0')
      .update(readFileSync(resolve(root, path)))
      .update('\0');
  }
  return hash.digest('hex');
}

/** Serialize generators and atomically replace each output; check mode never calls this writer. */
/** @param {{expectedFingerprint?: string}} options */
export function writeScriptInventory(root, outputs, options = {}) {
  const { expectedFingerprint } = options;
  const lockPath = resolve(root, 'docs/.scripts-inventory.lock');
  mkdirSync(dirname(lockPath), { recursive: true });
  let lock;
  try {
    lock = openSync(lockPath, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST')
      fail('another generator owns docs/.scripts-inventory.lock; retry after it finishes.');
    throw error;
  }
  const temporaryPaths = [];
  try {
    for (const [path, contents] of Object.entries(outputs)) {
      const target = resolve(root, path);
      mkdirSync(dirname(target), { recursive: true });
      const temporaryPath = `${target}.${process.pid}.tmp`;
      writeFileSync(temporaryPath, contents, { flag: 'wx' });
      temporaryPaths.push([temporaryPath, target]);
    }
    if (expectedFingerprint && sourceFingerprint(root) !== expectedFingerprint) {
      fail(
        'inputs changed during generation; no output was replaced. Retry with a stable checkout.',
      );
    }
    for (const [temporaryPath, target] of temporaryPaths) renameSync(temporaryPath, target);
  } finally {
    for (const [temporaryPath] of temporaryPaths) rmSync(temporaryPath, { force: true });
    closeSync(lock);
    rmSync(lockPath, { force: true });
  }
}

export function generateScriptInventory(root = process.cwd(), options = {}) {
  const fingerprint = sourceFingerprint(root);
  const inventory = buildScriptInventory(root, options);
  return { inventory, outputs: renderScriptInventory(inventory), fingerprint };
}
