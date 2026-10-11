import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { commandCatalog } from '../scripts/lib/command-catalog.mjs';
import { RETIREMENT_PATH } from '../scripts/lib/script-alias-retirement.mjs';
import {
  BASELINE_PATH,
  buildScriptInventory,
  checkScriptInventory,
  EQUIVALENCE_PATH,
  extractNpmReferences,
  generateScriptInventory,
  INVENTORY_PATH,
  loadScriptInventoryBaseline,
  renderScriptInventory,
  writeScriptInventory,
} from '../scripts/lib/script-inventory.mjs';

const roots = [];
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executable = resolve(repositoryRoot, 'scripts/generate-scripts-inventory.mjs');

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function write(root, path, content) {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), content);
}

function retirementConfiguration(root, retiredAliases = [], extra = {}) {
  const configuration = {
    schemaVersion: 1,
    baselineSha256: createHash('sha256')
      .update(readFileSync(resolve(root, BASELINE_PATH)))
      .digest('hex'),
    retiredAliases,
    historicalSources: [
      { path: 'docs/archive/', prefix: true, reason: 'Frozen evidence for fixture history tests.' },
    ],
    migrationEvidence: retiredAliases.length
      ? {
          pullRequestUrl: 'https://github.com/example/game/pull/123',
          headSha: 'a'.repeat(40),
          checks: ['validate', 'e2e', 'database', 'clean-room'].map((name) => ({
            name,
            state: 'SUCCESS',
            link: `https://github.com/example/game/actions/runs/123/job/${name}`,
          })),
        }
      : null,
    ...extra,
  };
  write(root, RETIREMENT_PATH, JSON.stringify(configuration));
  return configuration;
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), 'lolrogue-script-inventory-'));
  roots.push(root);
  const scripts = {
    postinstall: 'node scripts/patch.mjs',
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    build: 'npm run compile', // script-inventory-fixture: intentional isolated test input, never a repository command.
    prebuild: 'npm run prepare', // script-inventory-fixture: intentional isolated test input, never a repository command.
    postbuild: 'npm run audit', // script-inventory-fixture: intentional isolated test input, never a repository command.
    compile: 'node scripts/compile.mjs',
    prepare: 'node scripts/prepare.mjs',
    audit: 'node scripts/audit.mjs',
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    check: 'npm run build && npm run audit', // script-inventory-fixture: intentional isolated test input, never a repository command.
    useful: 'node scripts/useful.mjs',
  };
  write(root, 'package.json', JSON.stringify({ scripts }, null, 2));
  write(root, BASELINE_PATH, JSON.stringify({ schemaVersion: 1, scripts }));
  retirementConfiguration(root);
  write(root, 'README.md', 'Build validation: npm run check.\n');
  write(root, '.github/workflows/ci.yml', 'steps:\n  - run: npm ci\n  - run: npm run check\n');
  write(
    root,
    'scripts/runner.mjs',
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    "spawnSync('npm', ['run', 'compile']);\nrun('gh', ['run', 'view']);\n", // script-inventory-fixture: intentional isolated test input, never a repository command.
  );
  return root;
}

describe('public npm script inventory', () => {
  it('freezes all 105 initial names and includes every current alias with operational metadata', () => {
    const baseline = loadScriptInventoryBaseline(repositoryRoot);
    const inventory = buildScriptInventory(repositoryRoot, { catalog: commandCatalog });
    expect(Object.keys(baseline.scripts)).toHaveLength(105);
    expect(inventory.initialCount).toBe(105);
    expect(
      inventory.scripts
        .filter(({ initial }) => initial)
        .map(({ name }) => name)
        .sort(),
    ).toEqual(Object.keys(baseline.scripts).sort());
    expect(inventory.currentCount).toBe(
      Object.keys(JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')).scripts)
        .length,
    );
    expect(inventory.scripts.filter(({ public: active }) => active)).toHaveLength(
      inventory.currentCount,
    );
    for (const entry of inventory.scripts) {
      expect(entry.owner).toBeTruthy();
      expect(entry.inputs.length).toBeGreaterThan(0);
      expect(entry.preconditions.length).toBeGreaterThan(0);
      expect(entry.classifications.length).toBeGreaterThan(0);
      expect(entry.replacement).toBeTruthy();
      expect(entry.public).toBe(!entry.retired);
      expect(['read-only', 'generate', 'destructive-local', 'remote']).toContain(entry.risk);
    }
    for (const hook of ['prebuild', 'postbuild', 'postinstall']) {
      expect(
        inventory.scripts
          .find(({ name }) => name === hook)
          .callers.some(({ kind }) => kind.startsWith('implicit-')),
      ).toBe(true);
    }
    expect(inventory.scripts.find(({ name }) => name === 'db:types:check')).toMatchObject({
      risk: 'read-only',
      executionScope: 'database; local unless explicit linked read is supported',
    });
    const databaseGroup = inventory.scripts.find(({ name }) => name === 'database');
    if (databaseGroup) {
      expect(databaseGroup.kind).toBe('canonical-group');
      expect(databaseGroup.executionScope).toBe('dispatch; scope depends on selected subcommand');
      expect(databaseGroup.subcommandRisks).toContain('destructive-local');
    }
  });

  it('records exact callers, implicit build/install hooks and transitive CI/documentation consumers', () => {
    const inventory = buildScriptInventory(fixture());
    const prepare = inventory.scripts.find(({ name }) => name === 'prepare');
    expect(prepare.dependencies).toEqual([]);
    expect(prepare.callers).toContainEqual(
      expect.objectContaining({ file: 'package.json', parent: 'prebuild' }),
    );
    expect(prepare.indirectCallers).toContainEqual(
      expect.objectContaining({
        file: '.github/workflows/ci.yml',
        line: 3,
        via: ['check', 'build', 'prebuild'],
      }),
    );
    expect(prepare.contract).toBe('external');
    expect(prepare.classifications).toContain('CI');
    const patch = inventory.scripts.find(({ name }) => name === 'postinstall');
    expect(patch.callers).toContainEqual(
      expect.objectContaining({
        file: '.github/workflows/ci.yml',
        line: 2,
        kind: 'implicit-install-hook',
      }),
    );
    const compile = inventory.scripts.find(({ name }) => name === 'compile');
    expect(compile.callers).toContainEqual(
      expect.objectContaining({ file: 'scripts/runner.mjs', line: 1, kind: 'process-arguments' }),
    );
    expect(inventory.unknownReferences).toEqual([]);
    expect(inventory.unresolvedReferences).toEqual([]);
  });

  it('keeps unreferenced public scripts without calling them unused or deprecating them', () => {
    const entry = buildScriptInventory(fixture()).scripts.find(({ name }) => name === 'useful');
    expect(entry.referenceStatus).toBe(
      'unreferenced; utility review required, not evidence of disuse',
    );
    expect(entry.compatibility).toMatch(/^retained/);
    expect(entry.public).toBe(true);
    expect(entry.contract).toBe('internal');
  });

  it('does not invent project hooks for global installation or explicitly skipped lifecycle scripts', () => {
    const root = fixture();
    write(
      root,
      'docs/install-tools.md',
      'npm install -g graphify\nnpm ci --ignore-scripts\nnpm install\n',
    );
    const patch = buildScriptInventory(root).scripts.find(({ name }) => name === 'postinstall');
    expect(patch.callers.filter(({ file }) => file === 'docs/install-tools.md')).toEqual([
      expect.objectContaining({ line: 3, kind: 'implicit-install-hook' }),
    ]);
  });

  it('extracts multiline npm calls and resolved conditional subprocess names while ignoring other executables', () => {
    const references = extractNpmReferences(
      [
        'npm run\n check.',
        "const npmCommand = 'npm';",
        "const testScript = process.argv.includes('--rollback') ? 'test:db:rollback' : 'test:db';",
        "spawnSync(npmCommand, ['run', testScript]);",
        "spawnSync('gh', ['run', 'view']);",
        "const step = { command: 'npm', args: ['run', 'build'] };",
        // script-inventory-fixture: intentional isolated test input, never a repository command.
        "spawnSync(npmCommand, ['run', selectedFromUser]);", // script-inventory-fixture: intentional isolated test input, never a repository command.
      ].join('\n'),
      'scripts/example.mjs',
    );
    expect(references.map(({ name }) => name)).toEqual([
      'check',
      'test:db',
      'test:db:rollback',
      'build',
      null,
    ]);
    expect(references.at(-1)).toMatchObject({
      variable: 'selectedFromUser',
      kind: 'dynamic-process-arguments',
    });
  });

  it('derives per-alias engine/all options from the canonical catalog, including new aliases', () => {
    const root = fixture();
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    packageJson.scripts['balance:baseline:generate:v22'] = 'node old-generator.mjs --engine v22';
    write(root, 'package.json', JSON.stringify(packageJson));
    const catalog = [
      {
        aliases: ['balance:baseline:generate:v22'],
        replacement: 'npm run balance -- baseline generate',
        aliasOptions: { 'balance:baseline:generate:v22': ['--engine', 'v22'] },
        owner: 'balance-team',
        risk: 'generate',
        options: { engine: { type: 'string' } },
        inputs: ['frozen v22 bundle'],
        preconditions: ['bundle must exist'],
      },
    ];
    const entry = buildScriptInventory(root, { catalog }).scripts.find(
      ({ name }) => name === 'balance:baseline:generate:v22',
    );
    expect(entry.replacement).toBe('npm run balance -- baseline generate --engine v22');
    expect(entry.initial).toBe(false);
    expect(entry.owner).toBe('balance-team');
    expect(entry.arguments.supported).toEqual(['--engine']);
    expect(entry.classifications).toEqual(['generation', 'historical']);
    expect(() => buildScriptInventory(root, { catalog: [...catalog, ...catalog] })).toThrow(
      'duplicate alias',
    );
  });

  it('rejects removed initial aliases, empty commands and unknown executable references with source locations', () => {
    const root = fixture();
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    write(root, '.github/workflows/broken.yml', 'run: npm run missing-script\n'); // script-inventory-fixture: intentional isolated test input, never a repository command.
    expect(() => buildScriptInventory(root)).toThrow(
      'unknown npm reference missing-script at .github/workflows/broken.yml:1',
    );
    rmSync(resolve(root, '.github/workflows/broken.yml'));
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    delete packageJson.scripts.useful;
    write(root, 'package.json', JSON.stringify(packageJson));
    expect(() => buildScriptInventory(root)).toThrow('initial public alias useful was removed');
    packageJson.scripts.useful = '';
    write(root, 'package.json', JSON.stringify(packageJson));
    expect(() => buildScriptInventory(root)).toThrow('script useful has an empty command');
  });

  it('requires recorded green migration CI and canonical equivalence before retaining retired history', () => {
    const root = fixture();
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    delete packageJson.scripts.useful;
    packageJson.scripts.testing = 'node scripts/cli.mjs testing';
    write(root, 'package.json', JSON.stringify(packageJson));
    const catalog = [
      {
        aliases: ['useful'],
        group: 'testing',
        path: ['useful'],
        replacement: 'npm run testing -- useful',
        owner: 'developer-tooling',
        risk: 'read-only',
        inputs: ['source'],
        preconditions: ['Node 24'],
      },
    ];
    retirementConfiguration(root, ['useful'], { migrationEvidence: null });
    expect(() => buildScriptInventory(root, { catalog })).toThrow('completed green CI evidence');
    const retirement = retirementConfiguration(root, ['useful']);
    retirement.migrationEvidence.checks[0].state = 'FAILURE';
    write(root, RETIREMENT_PATH, JSON.stringify(retirement));
    expect(() => buildScriptInventory(root, { catalog })).toThrow('unsuccessful check');
    retirementConfiguration(root, ['useful']);
    expect(() => buildScriptInventory(root)).toThrow('canonical catalog replacement');
    const inventory = buildScriptInventory(root, { catalog });
    expect(inventory.initialCount).toBe(9);
    expect(inventory.currentCount).toBe(9);
    expect(inventory.retiredCount).toBe(1);
    expect(inventory.scripts.find(({ name }) => name === 'useful')).toMatchObject({
      initial: true,
      initialCommand: 'node scripts/useful.mjs',
      command: null,
      public: false,
      retired: true,
      replacement: 'npm run testing -- useful',
    });
    expect(inventory.migrationEvidence.headSha).toBe('a'.repeat(40));
    expect(inventory.scripts.find(({ name }) => name === 'build')).toMatchObject({
      public: true,
      retired: false,
      compatibility: 'retained public contract after caller migration; remains available',
    });
    expect(inventory.scripts.find(({ name }) => name === 'testing')).toMatchObject({
      public: true,
      retired: false,
      compatibility: 'added public entry; retired aliases require their canonical replacement',
    });
    expect(renderScriptInventory(inventory)[EQUIVALENCE_PATH]).toContain('alias retiré');
  });

  it('rejects malformed, incomplete or unrelated retirement evidence and baseline changes', () => {
    const root = fixture();
    const catalog = [
      { aliases: ['useful'], path: ['useful'], replacement: 'npm run testing -- useful' },
    ];
    const configuration = retirementConfiguration(root, ['useful']);
    const evidence = configuration.migrationEvidence;
    for (const checks of [
      [],
      evidence.checks.slice(1),
      [...evidence.checks, evidence.checks[0]],
      evidence.checks.map((check, index) => (index ? check : { ...check, state: 'PENDING' })),
    ]) {
      retirementConfiguration(root, ['useful'], { migrationEvidence: { ...evidence, checks } });
      expect(() => buildScriptInventory(root, { catalog })).toThrow(/CI evidence/);
    }
    for (const patch of [
      { headSha: 'short-sha' },
      { pullRequestUrl: 'https://example.com/pull/1' },
    ]) {
      retirementConfiguration(root, ['useful'], { migrationEvidence: { ...evidence, ...patch } });
      expect(() => buildScriptInventory(root, { catalog })).toThrow('exact head SHA');
    }
    const unrelatedChecks = evidence.checks.map((check) => ({
      ...check,
      link: 'https://github.com/another/game/actions/runs/123',
    }));
    retirementConfiguration(root, ['useful'], {
      migrationEvidence: { ...evidence, checks: unrelatedChecks },
    });
    expect(() => buildScriptInventory(root, { catalog })).toThrow('different repository');
    for (const names of [['unknown'], ['useful', 'useful']]) {
      retirementConfiguration(root, names);
      expect(() => buildScriptInventory(root, { catalog })).toThrow('invalid or duplicate');
    }
    retirementConfiguration(root, ['useful']);
    expect(() => buildScriptInventory(root, { catalog })).toThrow('still public');
    write(root, BASELINE_PATH, `${readFileSync(resolve(root, BASELINE_PATH), 'utf8')}\n`);
    expect(() => buildScriptInventory(root, { catalog })).toThrow('baseline differs');
  });

  it('detects active retired or unknown consumers across workflows, scripts, tests, e2e, configuration, sources and tool config', () => {
    const root = fixture();
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    delete packageJson.scripts.useful;
    write(root, 'package.json', JSON.stringify(packageJson));
    retirementConfiguration(root, ['useful']);
    const catalog = [
      { aliases: ['useful'], path: ['useful'], replacement: 'npm run testing -- useful' },
    ];
    for (const file of [
      '.github/workflows/broken.yml',
      'scripts/broken.mjs',
      'tests/broken.test.ts',
      'e2e/broken.spec.ts',
      'src/broken.ts',
      'config/commands.json',
      'vite.config.ts',
      'vitest.config.ts',
      'tooling/vite/plugins/broken.ts',
      'AGENTS.md',
      'docs/current.md',
    ]) {
      // script-inventory-fixture: intentional isolated test input, never a repository command.
      write(root, file, 'npm run useful\n'); // script-inventory-fixture: stale consumer injected into isolated repository fixture.
      expect(() => buildScriptInventory(root, { catalog })).toThrow(
        `active caller of retired alias useful at ${file}:1`,
      );
      // script-inventory-fixture: intentional isolated test input, never a repository command.
      write(root, file, 'npm run unknown\n'); // script-inventory-fixture: unknown consumer injected into isolated repository fixture.
      expect(() => buildScriptInventory(root, { catalog })).toThrow(
        `unknown npm reference unknown at ${file}:1`,
      );
      rmSync(resolve(root, file));
    }
    write(
      root,
      'scripts/child.mjs',
      // script-inventory-fixture: intentional isolated test input, never a repository command.
      "const childExecutable = 'npm';\nspawnSync(childExecutable, ['--silent', 'run-script', 'useful']);\n",
    ); // script-inventory-fixture: subprocess retirement case isolated from repository consumers.
    expect(() => buildScriptInventory(root, { catalog })).toThrow(
      'active caller of retired alias useful at scripts/child.mjs:2',
    );
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    write(root, 'scripts/child.mjs', "spawnSync('npm', ['run', userSelection]);\n"); // script-inventory-fixture: unresolved subprocess prevents unsafe retirement.
    expect(() => buildScriptInventory(root, { catalog })).toThrow('unresolved npm caller');
  });

  it('classifies bounded historical proofs and explicit fixture lines without exempting executable callers', () => {
    const root = fixture();
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    delete packageJson.scripts.useful;
    write(root, 'package.json', JSON.stringify(packageJson));
    retirementConfiguration(root, ['useful']);
    const catalog = [
      { aliases: ['useful'], path: ['useful'], replacement: 'npm run testing -- useful' },
    ];
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    write(root, 'docs/archive/past.md', 'Previously: npm run useful\n'); // script-inventory-fixture: intentional archived command evidence fixture.
    write(
      root,
      'tests/input.test.ts',
      // script-inventory-fixture: intentional isolated test input, never a repository command.
      'const input = "npm run useful"; // script-inventory-fixture: injected isolated legacy command input.\n',
    );
    const inventory = buildScriptInventory(root, { catalog });
    const retired = inventory.scripts.find(({ name }) => name === 'useful');
    expect(retired.activeCallers).toEqual([]);
    expect(retired.historicalCallers).toEqual([
      expect.objectContaining({ file: 'docs/archive/past.md', classification: 'historical' }),
    ]);
    expect(inventory.fixtureReferences).toContainEqual(
      expect.objectContaining({ file: 'tests/input.test.ts', classification: 'test-fixture' }),
    );
    write(
      root,
      'scripts/real.mjs',
      // script-inventory-fixture: intentional isolated test input, never a repository command.
      'npm run useful // script-inventory-fixture: cannot exempt a real operational source.\n',
    );
    expect(() => buildScriptInventory(root, { catalog })).toThrow('active caller of retired alias');
    rmSync(resolve(root, 'scripts/real.mjs'));
    retirementConfiguration(root, ['useful'], {
      historicalSources: [
        { path: 'docs/', prefix: true, reason: 'Overly broad exemption must fail.' },
      ],
    });
    expect(() => buildScriptInventory(root, { catalog })).toThrow('bounded documentation paths');
  });

  it('shows frozen transitive history while active chains remain guarded', () => {
    const root = fixture();
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    packageJson.scripts.build = 'node scripts/build.mjs';
    delete packageJson.scripts.compile;
    write(root, 'package.json', JSON.stringify(packageJson));
    write(root, 'scripts/runner.mjs', '/* caller migrated to the canonical CLI */\n');
    retirementConfiguration(root, ['compile']);
    const catalog = [
      { aliases: ['compile'], path: ['compile'], replacement: 'npm run testing -- compile' },
    ];
    write(root, 'docs/archive/previous-validation.md', 'Validated: npm run check\n');
    const compile = buildScriptInventory(root, { catalog }).scripts.find(
      ({ name }) => name === 'compile',
    );
    expect(compile.indirectCallers).toContainEqual(
      expect.objectContaining({
        file: 'docs/archive/previous-validation.md',
        classification: 'historical',
        dependencySource: BASELINE_PATH,
        via: ['check', 'build'],
      }),
    );
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    packageJson.scripts.check = 'npm run compile'; // script-inventory-fixture: active package chain must fail after historical alias retirement.
    write(root, 'package.json', JSON.stringify(packageJson));
    expect(() => buildScriptInventory(root, { catalog })).toThrow(
      'active caller of retired alias compile at package.json',
    );
  });

  it('reports historical/documentary unknown names without inventing a known consumer', () => {
    const root = fixture();
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    write(root, 'docs/archive/past.md', 'Previously: npm run removed-historical-alias.\n'); // script-inventory-fixture: intentional isolated test input, never a repository command.
    const inventory = buildScriptInventory(root);
    expect(inventory.unknownReferences).toEqual([
      expect.objectContaining({
        name: 'removed-historical-alias',
        source: 'documentation',
        line: 1,
      }),
    ]);
  });

  it('is deterministic in script ordering, ignores generated self references and terminates on npm cycles', () => {
    const root = fixture();
    const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    packageJson.scripts.compile = 'npm run build';
    write(root, 'package.json', JSON.stringify(packageJson));
    const first = buildScriptInventory(root);
    const outputs = renderScriptInventory(first);
    writeScriptInventory(root, outputs);
    const second = buildScriptInventory(root);
    expect(second).toEqual(first);
    expect(second.scripts.map(({ name }) => name)).toEqual(
      second.scripts.map(({ name }) => name).sort(),
    );
    expect(checkScriptInventory(root, outputs)).toEqual([]);
    expect(
      second.scripts
        .flatMap(({ callers }) => callers)
        .some(({ file }) => [INVENTORY_PATH, EQUIVALENCE_PATH].includes(file)),
    ).toBe(false);
  });

  it('keeps inventory stable after generated build, performance, balance, test and CLI outputs appear', () => {
    const root = fixture();
    const first = generateScriptInventory(root);
    writeScriptInventory(root, first.outputs);
    for (const path of [
      'dist/assets/bundle.js',
      'build/output.json',
      'ci-build/bundle-report.json',
      'performance-report/bundle-report.json',
      'balance-report/cohort-report.json',
      'coverage/coverage-final.json',
      'test-seed-results/results.json',
      'strict-typecheck-results/report.json',
      'test-results/results.json',
      'playwright-report/results.json',
      'blob-report/results.json',
      'public/lol/data/champion.json',
      'supabase/.branches/project.json',
      'supabase/.temp/project.json',
    ]) {
      // script-inventory-fixture: generated output deliberately includes invalid npm caller text.
      write(root, path, 'npm run unknown-output-command\n');
    }
    const afterBuild = generateScriptInventory(root);
    expect(afterBuild.inventory).toEqual(first.inventory);
    expect(afterBuild.fingerprint).toBe(first.fingerprint);
    expect(checkScriptInventory(root, afterBuild.outputs)).toEqual([]);
    write(root, 'src/new-uncommitted.ts', '/* new source stays inside the scan */\n');
    expect(buildScriptInventory(root).scannedPaths).toContain('src/new-uncommitted.ts');
    write(root, 'AGENTS.md', '/* local instructions are scanned despite being gitignored */\n');
    expect(buildScriptInventory(root).scannedPaths).toContain('AGENTS.md');
  });

  it('keeps --check read-only both when current and stale; missing or unknown arguments fail usefully', () => {
    const root = fixture();
    const generation = spawnSync(process.execPath, [executable], { cwd: root, encoding: 'utf8' });
    expect(generation.status, generation.stderr).toBe(0);
    const before = [INVENTORY_PATH, EQUIVALENCE_PATH].map((path) => ({
      path,
      bytes: readFileSync(resolve(root, path)),
      mtime: statSync(resolve(root, path)).mtimeMs,
    }));
    const check = spawnSync(process.execPath, [executable, '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(check.status, check.stderr).toBe(0);
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    write(root, 'README.md', 'Additional caller: npm run useful.\n'); // script-inventory-fixture: intentional isolated test input, never a repository command.
    const stale = spawnSync(process.execPath, [executable, '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('Script inventory is stale');
    for (const original of before) {
      expect(readFileSync(resolve(root, original.path))).toEqual(original.bytes);
      expect(statSync(resolve(root, original.path)).mtimeMs).toBe(original.mtime);
    }
    expect(existsSync(resolve(root, 'docs/.scripts-inventory.lock'))).toBe(false);
    expect(readdirSync(resolve(root, 'docs')).some((path) => path.endsWith('.tmp'))).toBe(false);
    const invalid = spawnSync(process.execPath, [executable, '--unknown'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toContain('unknown/duplicate option');
    rmSync(resolve(root, INVENTORY_PATH));
    expect(spawnSync(process.execPath, [executable, '--check'], { cwd: root }).status).toBe(1);
    expect(existsSync(resolve(root, INVENTORY_PATH))).toBe(false);
  });

  it('blocks concurrent writers and source changes before atomically replacing outputs', () => {
    const root = fixture();
    const first = generateScriptInventory(root);
    writeScriptInventory(root, first.outputs, { expectedFingerprint: first.fingerprint });
    const original = readFileSync(resolve(root, INVENTORY_PATH), 'utf8');
    write(root, 'docs/.scripts-inventory.lock', 'another process owns this lock');
    expect(() => writeScriptInventory(root, first.outputs)).toThrow('another generator');
    expect(readFileSync(resolve(root, 'docs/.scripts-inventory.lock'), 'utf8')).toBe(
      'another process owns this lock',
    );
    rmSync(resolve(root, 'docs/.scripts-inventory.lock'));
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    write(root, 'README.md', 'npm run useful\n'); // script-inventory-fixture: intentional isolated test input, never a repository command.
    expect(() =>
      writeScriptInventory(root, first.outputs, { expectedFingerprint: first.fingerprint }),
    ).toThrow('inputs changed during generation');
    expect(readFileSync(resolve(root, INVENTORY_PATH), 'utf8')).toBe(original);
    expect(existsSync(resolve(root, 'docs/.scripts-inventory.lock'))).toBe(false);
    expect(readdirSync(resolve(root, 'docs')).some((path) => path.endsWith('.tmp'))).toBe(false);
  });

  it('executes a symlinked entrypoint and keeps --help/--check scoped to the current fixture', () => {
    const root = fixture();
    const linkedExecutable = resolve(root, 'linked-inventory.mjs');
    symlinkSync(executable, linkedExecutable);
    const help = spawnSync(process.execPath, [linkedExecutable, '--help'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain('Usage: node scripts/generate-scripts-inventory.mjs');
    expect(existsSync(resolve(root, INVENTORY_PATH))).toBe(false);
    const generated = spawnSync(process.execPath, [linkedExecutable], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(generated.status, generated.stderr).toBe(0);
    const before = readFileSync(resolve(root, INVENTORY_PATH));
    const check = spawnSync(process.execPath, [linkedExecutable, '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(check.status, check.stderr).toBe(0);
    expect(check.stdout).toContain('Script inventory is current');
    // script-inventory-fixture: intentional isolated test input, never a repository command.
    write(root, 'README.md', 'Additional fixture caller: npm run useful.\n'); // script-inventory-fixture: intentional isolated test input, never a repository command.
    const stale = spawnSync(process.execPath, [linkedExecutable, '--check'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(stale.status).toBe(1);
    expect(stale.stderr).toContain('Script inventory is stale');
    expect(readFileSync(resolve(root, INVENTORY_PATH))).toEqual(before);
  });
});
