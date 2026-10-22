// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ENHANCEMENT_AUDIT_OUTPUTS,
  generateEnhancementAudit,
  parseEnhancementAuditArgs,
  runEnhancementAudit,
} from '../scripts/audit-enhancement-trees.mjs';
import { createArtifactSnapshot } from '../scripts/lib/artifact-snapshot.mjs';

const root = path.resolve(import.meta.dirname, '..');
const temporaryDirectories = [];
const stdout = { write() {} };

async function outputDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'lolrogue-enhancement-audit-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function outputContents(directory) {
  return Promise.all(
    ENHANCEMENT_AUDIT_OUTPUTS.map((file) => readFile(path.join(directory, file), 'utf8')),
  );
}

async function enumerate(base, relative) {
  const entries = await readdir(path.join(base, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = `${relative}/${entry.name}`;
    files.push(...(entry.isDirectory() ? await enumerate(base, next) : [next]));
  }
  return files.sort();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('enhancement audit CLI', () => {
  it('reproduces both reports, complete node evidence and stable source provenance', async () => {
    const first = await generateEnhancementAudit({ root });
    const second = await generateEnhancementAudit({ root });
    expect(second).toEqual(first);
    const report = JSON.parse(first.json);
    expect(report.summary).toMatchObject({
      treeCount: 6,
      nodeCount: 88,
      roleNodeCount: 72,
      specializationNodeCount: 16,
      blockedNodes: 31,
    });
    expect(report.provenance.inputsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(report.provenance.migrations).toContain(
      'supabase/migrations/20261022161216_enhancement_contract_v4_purchases.sql',
    );
    expect(report.provenance.migrations).toContain(
      'supabase/migrations/20261022162313_enhancement_atomic_resets.sql',
    );
    expect(report.provenance.migrations).toEqual([...report.provenance.migrations].sort());
    const inputPaths = report.provenance.inputs.map(({ path: file }) => file);
    expect(inputPaths).toContain('src/game/rules/CombatRuleRuntime.ts');
    expect(inputPaths).toContain('src/components/EnhancementTree.tsx');
    expect(inputPaths).toContain('src/stores/enhancementStore.ts');
    expect(inputPaths).toContain('src/game/enhancements/bonuses.ts');
    expect(inputPaths).toContain('src/features/enhancements/ui/EnhancementNodeCard.tsx');
    expect(inputPaths).toContain('src/features/enhancements/ui/enhancements.css');
    expect(inputPaths).toContain('src/data/enhancementSpecializations.ts');
    expect(inputPaths).toContain('tooling/enhancements/economySimulation.ts');
    expect(inputPaths).toContain('tests/enhancementBattleParity.test.ts');
    expect(inputPaths).toContain('src/data/generated/champions-parsed.json');
    expect(inputPaths).toContain('tooling/enhancements/effectEvidence.ts');
    expect(inputPaths).toEqual([...inputPaths].sort());
    expect(first.markdown).toContain(report.provenance.inputsSha256);
    expect(report.provenance).not.toHaveProperty('generatedAt');
    expect(report.provenance).not.toHaveProperty('commit');
  });

  it('publishes exactly the JSON/Markdown pair, then checks without rewriting either file', async () => {
    const outputRoot = await outputDirectory();
    const result = await runEnhancementAudit([], { root, outputRoot, stdout });
    expect(await outputContents(outputRoot)).toEqual([result.json, result.markdown]);
    const before = await Promise.all(
      ENHANCEMENT_AUDIT_OUTPUTS.map((file) => stat(path.join(outputRoot, file))),
    );
    await runEnhancementAudit(['--check'], { root, outputRoot, stdout });
    const after = await Promise.all(
      ENHANCEMENT_AUDIT_OUTPUTS.map((file) => stat(path.join(outputRoot, file))),
    );
    expect(after.map(({ mtimeMs }) => mtimeMs)).toEqual(before.map(({ mtimeMs }) => mtimeMs));
    expect((await readdir(path.join(outputRoot, 'docs/audits'))).sort()).toEqual([
      'enhancement-trees.json',
      'enhancement-trees.md',
    ]);
  });

  it('rejects missing reports in --check without creating an output directory', async () => {
    const outputRoot = await outputDirectory();
    await expect(runEnhancementAudit(['--check'], { root, outputRoot, stdout })).rejects.toThrow(
      'missing docs/audits/enhancement-trees.json',
    );
    expect(await readdir(outputRoot)).toEqual([]);
  });

  it.each([0, 1])(
    'rejects a stale output %i without changing either committed byte sequence',
    async (staleIndex) => {
      const outputRoot = await outputDirectory();
      const result = await generateEnhancementAudit({ root });
      const contents = [result.json, result.markdown];
      contents[staleIndex] += '\nintentional stale content\n';
      await mkdir(path.join(outputRoot, 'docs/audits'), { recursive: true });
      await Promise.all(
        ENHANCEMENT_AUDIT_OUTPUTS.map((file, index) =>
          writeFile(path.join(outputRoot, file), contents[index]),
        ),
      );
      await expect(runEnhancementAudit(['--check'], { root, outputRoot, stdout })).rejects.toThrow(
        `stale ${ENHANCEMENT_AUDIT_OUTPUTS[staleIndex]}`,
      );
      expect(await outputContents(outputRoot)).toEqual(contents);
    },
  );

  it('rejects a concurrent physical combat source change before publishing any report', async () => {
    const outputRoot = await outputDirectory();
    let reads = 0;
    const snapshot = createArtifactSnapshot(root, {
      readBytes: async (absolute) => {
        const bytes = await readFile(absolute);
        if (absolute.endsWith('/src/game/rules/CombatRuleRuntime.ts') && ++reads > 1)
          return Buffer.concat([bytes, Buffer.from('\n// concurrent edit\n')]);
        return bytes;
      },
    });
    await expect(runEnhancementAudit([], { root, outputRoot, snapshot, stdout })).rejects.toThrow(
      'concurrent change detected: src/game/rules/CombatRuleRuntime.ts',
    );
    expect(await readdir(outputRoot)).toEqual([]);
  });

  it('tracks UI styles even when the offline report does not import them', async () => {
    const outputRoot = await outputDirectory();
    let reads = 0;
    const snapshot = createArtifactSnapshot(root, {
      readBytes: async (absolute) => {
        const bytes = await readFile(absolute);
        if (absolute.endsWith('/src/features/enhancements/ui/enhancements.css') && ++reads > 1)
          return Buffer.concat([bytes, Buffer.from('\n/* concurrent style edit */\n')]);
        return bytes;
      },
    });
    await expect(runEnhancementAudit([], { root, outputRoot, snapshot, stdout })).rejects.toThrow(
      'concurrent change detected: src/features/enhancements/ui/enhancements.css',
    );
    expect(await readdir(outputRoot)).toEqual([]);
  });

  it('rejects a concurrent migration addition even when the original SQL bytes are unchanged', async () => {
    const outputRoot = await outputDirectory();
    let listings = 0;
    const snapshot = createArtifactSnapshot(root, {
      enumerate: async (base, relative) => {
        const files = await enumerate(base, relative);
        if (relative === 'supabase/migrations' && ++listings > 1)
          files.push('supabase/migrations/20990101000000_concurrent.sql');
        return files;
      },
    });
    await expect(runEnhancementAudit([], { root, outputRoot, snapshot, stdout })).rejects.toThrow(
      'concurrent directory change detected: supabase/migrations',
    );
    expect(await readdir(outputRoot)).toEqual([]);
  });

  it('restores both previous reports if a source changes while the new pair is being published', async () => {
    const outputRoot = await outputDirectory();
    await mkdir(path.join(outputRoot, 'docs/audits'), { recursive: true });
    const previous = ['previous JSON bytes\n', 'previous Markdown bytes\n'];
    await Promise.all(
      ENHANCEMENT_AUDIT_OUTPUTS.map((file, index) =>
        writeFile(path.join(outputRoot, file), previous[index]),
      ),
    );
    let changeDetected = false;
    const snapshot = createArtifactSnapshot(root, {
      readBytes: async (absolute) => {
        const bytes = await readFile(absolute);
        return changeDetected && absolute.endsWith('/src/components/EnhancementTree.tsx')
          ? Buffer.concat([bytes, Buffer.from('\n// concurrent edit\n')])
          : bytes;
      },
    });
    const assertUnchanged = snapshot.assertUnchanged.bind(snapshot);
    let checks = 0;
    snapshot.assertUnchanged = async () => {
      if (++checks === 3) changeDetected = true;
      await assertUnchanged();
    };
    await expect(runEnhancementAudit([], { root, outputRoot, snapshot, stdout })).rejects.toThrow(
      'concurrent change detected: src/components/EnhancementTree.tsx',
    );
    expect(await outputContents(outputRoot)).toEqual(previous);
    expect((await readdir(path.join(outputRoot, 'docs/audits'))).sort()).toEqual([
      'enhancement-trees.json',
      'enhancement-trees.md',
    ]);
  });

  it.each([
    ['--unknown'],
    ['--check', '--check'],
    ['--help', '--help'],
    ['--help', '--check'],
    ['output.json'],
  ])('rejects unsupported or duplicated arguments: %j', (...argv) => {
    expect(() => parseEnhancementAuditArgs(argv)).toThrow('Enhancement audit:');
  });

  it('shows help without reading repository data and rejects invalid direct invocations', async () => {
    const outputRoot = await outputDirectory();
    const messages = [];
    await runEnhancementAudit(['--help'], {
      root: path.join(outputRoot, 'absent'),
      stdout: { write: (message) => messages.push(message) },
    });
    expect(messages.join('')).toContain('npm run testing -- enhancements audit [--check]');
    expect(await readdir(outputRoot)).toEqual([]);
    const invalid = spawnSync(
      process.execPath,
      ['scripts/audit-enhancement-trees.mjs', '--check', '--check'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain('duplicate option --check');
  });
});
