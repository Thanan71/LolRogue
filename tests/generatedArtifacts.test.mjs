// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runGeneratedArtifactCheck } from '../scripts/check-generated-artifacts.mjs';
import { parseCommand } from '../scripts/cli.mjs';
import {
  renderAuthorityResolver,
  renderClientCapabilities,
  renderClientReplay,
} from '../scripts/generate-authority-resolver.mjs';
import { createArtifactSnapshot, sha256 } from '../scripts/lib/artifact-snapshot.mjs';
import {
  checkGeneratedArtifacts,
  validateArtifactContract,
} from '../scripts/lib/generated-artifacts.mjs';
import { checkAuthorityArtifacts } from '../scripts/lib/generated-authority-artifacts.mjs';
import { checkRiotArtifacts } from '../scripts/lib/generated-riot-artifacts.mjs';

const root = path.resolve(import.meta.dirname, '..');
const contractPath = 'config/generated-artifacts.json';
const registryPath = 'config/authority-versions.json';
const archivePath = 'supabase/authority-archive/run-authority-v1.bundle.ts';

async function snapshotWith(transform) {
  return createArtifactSnapshot(root, {
    readBytes: async (absolute) =>
      transform(path.relative(root, absolute).split(path.sep).join('/'), await readFile(absolute)),
  });
}

describe('generated artifact contract', () => {
  let originalArchive;
  let temporaryGit;
  let runGit;
  beforeAll(async () => {
    originalArchive = sha256(await readFile(path.join(root, archivePath)));
    temporaryGit = await mkdtemp(path.join(tmpdir(), 'lolrogue-artifact-git-'));
    const initialized = spawnSync('git', ['init', '--quiet', temporaryGit], { encoding: 'utf8' });
    expect(initialized.status).toBe(0);
    runGit = (command, args, options) =>
      spawnSync(
        command,
        ['--git-dir', path.join(temporaryGit, '.git'), '--work-tree', root, ...args],
        options,
      );
    const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .stdout.split('\0')
      .filter(Boolean);
    const outputs = tracked.filter(
      (file) =>
        /^(?:config\/|src\/data\/generated\/|public\/assets\/|supabase\/authority-archive\/)/.test(
          file,
        ) ||
        /\.(?:generated|bundle)\.(?:ts|js)$/.test(file) ||
        file === 'src/types/database.ts' ||
        /^docs\/audits\/enhancement-trees\.(?:json|md)$/.test(file),
    );
    const added = runGit('git', ['add', '-f', '--', ...outputs, contractPath], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(added.status).toBe(0);
  });
  afterAll(async () => {
    expect(sha256(await readFile(path.join(root, archivePath)))).toBe(originalArchive);
    await rm(temporaryGit, { recursive: true, force: true });
  });

  it('reproduces the current bundle and projections offline without changing archive bytes', async () => {
    const result = await checkGeneratedArtifacts({ root });
    expect(result).toMatchObject({
      families: 18,
      // 0.3.0 adds three cohort JSONs, the frozen 0.2.5 JS bundle and
      // the generated client replay resolver. Golden fixtures are outside the scopes.
      artifacts: 310,
      authorityVersions: 25,
      riotAssets: 231,
    });
    expect(result.conditionalReproduction.map(({ id }) => id)).toContain('database-types');
  });

  it.each([registryPath, archivePath])(
    'rejects removal from Git tracking without deleting %s',
    async (file) => {
      expect(
        runGit('git', ['rm', '--cached', '--', file], { cwd: root, encoding: 'utf8' }).status,
      ).toBe(0);
      try {
        await expect(checkGeneratedArtifacts({ root, runGit })).rejects.toThrow(
          `not tracked by Git: ${file}`,
        );
        expect(await readFile(path.join(root, file))).toBeTruthy();
      } finally {
        expect(
          runGit('git', ['add', '-f', '--', file], { cwd: root, encoding: 'utf8' }).status,
        ).toBe(0);
      }
    },
  );

  it('rejects a missing release asset without writing a replacement', async () => {
    const target = 'public/assets/riot/16.6.1/champions/Aatrox.png';
    const snapshot = await snapshotWith((file, bytes) => {
      if (file === target) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return bytes;
    });
    await expect(checkGeneratedArtifacts({ root, snapshot })).rejects.toThrow(
      `cannot read ${target} (ENOENT)`,
    );
    expect(await readFile(path.join(root, target))).toBeTruthy();
  });

  it('detects a stale deterministic projection rather than regenerating it', async () => {
    const target = 'src/data/generated/champions-client.json';
    const before = sha256(await readFile(path.join(root, target)));
    const snapshot = await snapshotWith((file, bytes) =>
      file === target ? Buffer.concat([bytes, Buffer.from(' ')]) : bytes,
    );
    await expect(checkGeneratedArtifacts({ root, snapshot })).rejects.toThrow(
      `deterministic projection is stale: ${target}`,
    );
    expect(sha256(await readFile(path.join(root, target)))).toBe(before);
  });

  it('detects upstream identity drift even when output bytes are unchanged', async () => {
    const snapshot = await snapshotWith((file, bytes) => {
      if (file !== 'scripts/ddragon-version.json') return bytes;
      const version = JSON.parse(bytes.toString('utf8'));
      return Buffer.from(JSON.stringify({ ...version, dataDragon: '16.6.2' }));
    });
    await expect(checkGeneratedArtifacts({ root, snapshot })).rejects.toThrow(
      'pinned Riot source versions differ',
    );
  });

  it('rejects a manifest hashing a different file instead of the parsed input', async () => {
    const replacement = await readFile(path.join(root, 'package.json'));
    const snapshot = await snapshotWith((file, bytes) => {
      if (file !== 'src/data/generated/riot-assets-manifest.json') return bytes;
      const manifest = JSON.parse(bytes.toString('utf8'));
      manifest.championCatalog = {
        path: 'package.json',
        bytes: replacement.length,
        sha256: sha256(replacement),
      };
      return Buffer.from(JSON.stringify(manifest));
    });
    await expect(checkRiotArtifacts(snapshot)).rejects.toThrow('canonical parsed input');
    await snapshot.assertUnchanged();
  });

  it('rejects a self-consistent compact projection pointing to an unmanifested spell', async () => {
    const snapshot = await snapshotWith((file, bytes) => {
      if (
        ![
          'src/data/generated/riot-spell-assets-manifest.json',
          'src/data/generated/riot-spell-assets-client.json',
        ].includes(file)
      )
        return bytes;
      const manifest = JSON.parse(bytes.toString('utf8'));
      manifest.spells.Annie[0] = 'UnmanifestedSpell.png';
      return Buffer.from(`${JSON.stringify(manifest)}\n`);
    });
    await expect(checkRiotArtifacts(snapshot)).rejects.toThrow(
      'spell source differs from manifest',
    );
    await snapshot.assertUnchanged();
  });

  it('protects historical byte hashes even when a line-ending change retains the gameplay hash', async () => {
    const snapshot = await snapshotWith((file, bytes) =>
      file === archivePath
        ? Buffer.from(bytes.toString('utf8').replace(/^\/\/ @ts-nocheck\n/, '// @ts-nocheck\r\n'))
        : bytes,
    );
    await expect(checkGeneratedArtifacts({ root, snapshot })).rejects.toThrow(
      'frozen authority bytes changed',
    );
  });

  it('detects a concurrent source mutation and asks for a retry', async () => {
    const target = 'scripts/ddragon-version.json';
    let reads = 0;
    const snapshot = await snapshotWith((file, bytes) =>
      file === target && ++reads > 1 ? Buffer.concat([bytes, Buffer.from('\n')]) : bytes,
    );
    await expect(checkGeneratedArtifacts({ root, snapshot })).rejects.toThrow(
      `concurrent change detected: ${target}`,
    );
    expect(reads).toBe(2);
  });

  it('captures RNG dependencies before compilation and detects changes during the build', async () => {
    const target = 'src/utils/seededRandom.ts';
    const current = await readFile(
      path.join(root, 'supabase/functions/verify-run/run-authority.bundle.js'),
    );
    let compiling = false;
    const snapshot = await snapshotWith((file, bytes) =>
      file === target && compiling ? Buffer.concat([bytes, Buffer.from('\n')]) : bytes,
    );
    const buildSource = vi.fn(async (options) => {
      expect(options.write).toBe(false);
      compiling = true;
      return { outputFiles: [{ contents: current }], metafile: { inputs: { [target]: {} } } };
    });
    await expect(
      checkGeneratedArtifacts({ root, snapshot, authorityDependencies: { buildSource } }),
    ).rejects.toThrow(`concurrent change detected: ${target}`);
    expect(buildSource).toHaveBeenCalledOnce();
  });

  it('refuses an authority bundle that is not declared in the registry', async () => {
    const snapshot = createArtifactSnapshot(root);
    const list = snapshot.list.bind(snapshot);
    snapshot.list = async (scope) =>
      scope === 'supabase/functions/verify-run'
        ? [...(await list(scope)), 'supabase/functions/verify-run/run-authority-9.9.9.bundle.js']
        : list(scope);
    await expect(checkAuthorityArtifacts(snapshot, root)).rejects.toThrow(
      'bundle inventory differs from the registry',
    );
    await snapshot.assertUnchanged();
  });

  it('refuses coherent removal of a published engine, its archive and both projections', async () => {
    const registry = JSON.parse(await readFile(path.join(root, registryPath), 'utf8'));
    const pruned = {
      ...registry,
      versions: registry.versions.filter(({ engine }) => engine !== 'run-engine-v1'),
    };
    const snapshot = await snapshotWith((file, bytes) => {
      if (file === registryPath) return Buffer.from(JSON.stringify(pruned));
      if (file === 'supabase/functions/verify-run/authority-version-resolver.generated.ts')
        return Buffer.from(renderAuthorityResolver(pruned));
      if (file === 'src/game/authority/versionCapabilities.generated.ts')
        return Buffer.from(renderClientCapabilities(pruned));
      if (file === 'src/game/authority/versionClientReplay.generated.ts')
        return Buffer.from(renderClientReplay(pruned));
      return bytes;
    });
    const list = snapshot.list.bind(snapshot);
    snapshot.list = async (scope) => (await list(scope)).filter((file) => file !== archivePath);
    await expect(checkAuthorityArtifacts(snapshot, root)).rejects.toThrow(
      'published historical engine is missing from the registry: run-engine-v1',
    );
    await snapshot.assertUnchanged();
  });

  it('checks concurrent directory membership on exit, including when a comparison fails', async () => {
    let enumerations = 0;
    const snapshot = createArtifactSnapshot(root, {
      enumerate: async () => (++enumerations === 1 ? ['one.json'] : ['one.json', 'two.json']),
      readBytes: async () => Buffer.from('{}'),
    });
    await snapshot.list('config');
    await expect(snapshot.assertUnchanged()).rejects.toThrow(
      'concurrent directory change detected',
    );
  });

  it('fails closed on invalid JSON without rewriting the contract', async () => {
    const snapshot = await snapshotWith((file, bytes) =>
      file === contractPath ? Buffer.from('{') : bytes,
    );
    await expect(checkGeneratedArtifacts({ root, snapshot })).rejects.toThrow(
      `invalid JSON: ${contractPath}`,
    );
  });

  it('rejects unsafe paths and ambiguous or missing family contracts', async () => {
    const contract = JSON.parse(await readFile(path.join(root, contractPath), 'utf8'));
    expect(() => validateArtifactContract({ ...contract, scopes: ['../outside'] })).toThrow(
      'unsafe repository path',
    );
    expect(() =>
      validateArtifactContract({
        ...contract,
        families: [...contract.families, contract.families[0]],
      }),
    ).toThrow('invalid family');
    const snapshot = await snapshotWith((file, bytes) =>
      file === contractPath
        ? Buffer.from(
            JSON.stringify({
              ...contract,
              families: contract.families.filter(({ id }) => id !== 'riot-client'),
            }),
          )
        : bytes,
    );
    await expect(checkGeneratedArtifacts({ root, snapshot })).rejects.toThrow(
      'unclassified artifact',
    );
  });

  it('provides CLI help and refuses options without invoking a generator', async () => {
    const check = vi.fn();
    const stdout = { write: vi.fn() };
    await runGeneratedArtifactCheck(['--help'], { check, stdout });
    expect(stdout.write).toHaveBeenCalledWith(expect.stringContaining('without writing'));
    await expect(runGeneratedArtifactCheck(['--write'], { check, stdout })).rejects.toThrow(
      'Unknown artifact check option',
    );
    expect(check).not.toHaveBeenCalled();
  });

  it('publishes valid canonical recipes and a read-only CLI plan without a new npm alias', async () => {
    const contract = JSON.parse(await readFile(path.join(root, contractPath), 'utf8'));
    const recipes = contract.families
      .flatMap(({ generator, integrity }) => [generator, ...integrity])
      .filter((entry) => typeof entry === 'string' && entry.startsWith('npm run '));
    for (const recipe of recipes) {
      for (const invocation of recipe.split(' && ')) {
        if (invocation === 'npm run authority:generate') continue;
        const [, group, args] = invocation.match(/^npm run ([a-z]+) -- (.+)$/) ?? [];
        expect(group, invocation).toBeTruthy();
        expect(() => parseCommand([group, ...args.split(' ')])).not.toThrow();
      }
    }
    const { command } = parseCommand(['release', 'artifacts', 'check']);
    expect(command).toMatchObject({
      risk: 'read-only',
      aliases: [],
      target: { script: 'scripts/check-generated-artifacts.mjs' },
    });
  });
});
