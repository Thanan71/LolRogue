import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild-authority';
import { artifactPath, createArtifactSnapshot, sha256 } from './lib/artifact-snapshot.mjs';
import { isDirectExecution } from './lib/critical-command.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
export const ENHANCEMENT_AUDIT_OUTPUTS = [
  'docs/audits/enhancement-trees.json',
  'docs/audits/enhancement-trees.md',
];
const staticInputs = [
  'scripts/audit-enhancement-trees.mjs',
  'scripts/lib/artifact-snapshot.mjs',
  'scripts/lib/critical-command.mjs',
  'src/components/EnhancementTree.tsx',
  'src/services/enhancementService.ts',
  'src/services/interfaces/IEnhancementRepository.ts',
  'src/services/repositories/SupabaseEnhancementRepository.ts',
  'src/stores/enhancementStore.ts',
  'src/types/enhancementTree.ts',
  'src/types/mastery.ts',
  'config/authority-versions.json',
  'package.json',
  'package-lock.json',
  'biome.json',
  'tsconfig.json',
];

export function parseEnhancementAuditArgs(argv) {
  const seen = new Set();
  for (const argument of argv) {
    if (!['--check', '--help'].includes(argument)) {
      throw new Error(`Enhancement audit: unknown option ${JSON.stringify(argument)}.`);
    }
    if (seen.has(argument)) throw new Error(`Enhancement audit: duplicate option ${argument}.`);
    seen.add(argument);
  }
  if (seen.has('--help') && argv.length !== 1) {
    throw new Error('Enhancement audit: --help cannot be combined with other options.');
  }
  return { check: seen.has('--check'), help: seen.has('--help') };
}

async function formatJson(root, source) {
  return new Promise((resolve, reject) => {
    const formatter = spawn(
      process.execPath,
      [
        path.join(root, 'node_modules/@biomejs/biome/bin/biome'),
        'format',
        '--stdin-file-path=docs/audits/enhancement-trees.json',
      ],
      { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const output = [];
    const errors = [];
    let outputBytes = 0;
    const timeout = setTimeout(() => {
      formatter.kill('SIGKILL');
      reject(new Error('Enhancement audit: pinned Biome formatting timed out.'));
    }, 30_000);
    formatter.stdout.on('data', (bytes) => {
      outputBytes += bytes.length;
      if (outputBytes > 16 * 1024 * 1024) {
        formatter.kill('SIGKILL');
        reject(new Error('Enhancement audit: formatted JSON exceeds the output limit.'));
      } else output.push(bytes);
    });
    formatter.stderr.on('data', (bytes) => errors.push(bytes));
    formatter.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Enhancement audit: pinned Biome could not start (${error.message}).`));
    });
    formatter.on('close', (code) => {
      clearTimeout(timeout);
      const formatted = Buffer.concat(output).toString('utf8');
      if (code !== 0 || !formatted.trim()) {
        reject(
          new Error(
            `Enhancement audit: pinned Biome formatting failed (${Buffer.concat(errors).toString('utf8').trim() || code}).`,
          ),
        );
      } else resolve(formatted);
    });
    formatter.stdin.on('error', (error) => {
      if (!('code' in error) || error.code !== 'EPIPE') reject(error);
    });
    formatter.stdin.end(source);
  });
}

/** All compiler inputs and physically cited effect consumers are read from one snapshot. */
export async function generateEnhancementAudit({
  root = repositoryRoot,
  snapshot = createArtifactSnapshot(root),
} = {}) {
  const inputs = new Set(staticInputs);
  const toolingFiles = (await snapshot.list('tooling/enhancements')).filter((file) =>
    file.endsWith('.ts'),
  );
  for (const file of toolingFiles) inputs.add(file);
  const migrations = (await snapshot.list('supabase/migrations')).filter((file) =>
    file.endsWith('.sql'),
  );
  for (const file of migrations) inputs.add(file);
  // These paths are evidence, not necessarily imported by the offline report. Capture them
  // before compilation so a combat implementation cannot change unnoticed during the audit.
  for (const file of toolingFiles) {
    const source = (await snapshot.read(file)).toString('utf8');
    for (const match of source.matchAll(
      /['"]((?:src|supabase)\/[^'"\r\n]+\.(?:ts|tsx|sql))['"]/g,
    )) {
      inputs.add(artifactPath(match[1]));
    }
  }
  for (const file of [...inputs].sort()) await snapshot.read(file);
  const compiled = await build({
    absWorkingDir: root,
    stdin: {
      contents: `
        export { createEnhancementAuditReport, renderEnhancementAuditMarkdown } from './tooling/enhancements/report.ts';
        export { extractEnhancementServerCatalog, ENHANCEMENT_SERVER_CONTRACT } from './tooling/enhancements/serverEvidence.ts';
      `,
      resolveDir: root,
      sourcefile: 'enhancement-audit-entry.ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    write: false,
    legalComments: 'none',
    logLevel: 'silent',
    tsconfig: path.join(root, 'tsconfig.json'),
    plugins: [
      {
        name: 'enhancement-audit-snapshot',
        setup(builder) {
          builder.onLoad({ filter: /\.(?:[cm]?js|tsx?|json)$/ }, async ({ path: absolute }) => {
            const relative = path.relative(root, absolute).split(path.sep).join('/');
            if (relative.split('/').includes('node_modules')) {
              return undefined;
            }
            if (relative.startsWith('../') || path.isAbsolute(relative)) {
              throw new Error(
                'Enhancement audit: source outside the repository cannot be snapshotted.',
              );
            }
            artifactPath(relative);
            inputs.add(relative);
            const extension = path.extname(relative).slice(1);
            return {
              contents: await snapshot.read(relative),
              loader: /** @type {import('esbuild-authority').Loader} */ (
                extension === 'mjs' || extension === 'cjs' ? 'js' : extension
              ),
              resolveDir: path.dirname(absolute),
            };
          });
        },
      },
    ],
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`;
  const generator = await import(moduleUrl);
  const migrationSources = await Promise.all(
    migrations.map(async (file) => ({
      path: file,
      sql: (await snapshot.read(file)).toString('utf8'),
    })),
  );
  const report = generator.createEnhancementAuditReport({
    catalog: generator.extractEnhancementServerCatalog(migrationSources),
    contract: generator.ENHANCEMENT_SERVER_CONTRACT,
  });
  const sourceHashes = await Promise.all(
    [...inputs].sort().map(async (file) => ({
      path: file,
      sha256: sha256(await snapshot.read(file)),
    })),
  );
  const inputsSha256 = sha256(JSON.stringify({ inputs: sourceHashes, migrations }));
  const withProvenance = {
    ...report,
    provenance: { algorithm: 'sha256', inputsSha256, inputs: sourceHashes, migrations },
  };
  const json = await formatJson(root, `${JSON.stringify(withProvenance, null, 2)}\n`);
  const markdown = `${generator.renderEnhancementAuditMarkdown(report).trimEnd()}\n\n## Provenance reproductible\n\nSHA-256 des ${sourceHashes.length} entrées et de la liste des ${migrations.length} migrations : \`${inputsSha256}\`. Les chemins et empreintes individuels figurent dans le JSON voisin. Aucun horodatage ni SHA de commit auto-référencé.\n`;
  await snapshot.assertUnchanged();
  return {
    json,
    markdown,
    inputsSha256,
    inputCount: sourceHashes.length,
    migrationCount: migrations.length,
  };
}

async function readExisting(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function publishReports(root, snapshot, contents) {
  const outputDirectory = path.join(root, 'docs/audits');
  await mkdir(outputDirectory, { recursive: true });
  const staging = await mkdtemp(path.join(outputDirectory, '.enhancement-audit-'));
  const previous = new Map();
  const published = [];
  let retainBackups = false;
  try {
    for (let index = 0; index < ENHANCEMENT_AUDIT_OUTPUTS.length; index++) {
      const relative = ENHANCEMENT_AUDIT_OUTPUTS[index];
      await writeFile(path.join(staging, `next-${index}`), contents[index]);
      const absolute = path.join(root, relative);
      const exists = (await readExisting(absolute)) !== null;
      previous.set(relative, exists);
      if (exists) await copyFile(absolute, path.join(staging, `previous-${index}`));
    }
    await snapshot.assertUnchanged();
    for (let index = 0; index < ENHANCEMENT_AUDIT_OUTPUTS.length; index++) {
      const relative = ENHANCEMENT_AUDIT_OUTPUTS[index];
      await rename(path.join(staging, `next-${index}`), path.join(root, relative));
      published.push({ relative, index });
    }
    await snapshot.assertUnchanged();
  } catch (error) {
    const rollbackErrors = [];
    for (const { relative, index } of published.reverse()) {
      try {
        if (previous.get(relative)) {
          await rename(path.join(staging, `previous-${index}`), path.join(root, relative));
        } else {
          await rm(path.join(root, relative), { force: true });
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      retainBackups = true;
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Enhancement audit: publication and rollback failed; backups retained in ${staging}.`,
      );
    }
    throw error;
  } finally {
    if (!retainBackups) await rm(staging, { recursive: true, force: true });
  }
}

export async function runEnhancementAudit(
  argv = process.argv.slice(2),
  {
    root = repositoryRoot,
    outputRoot = root,
    snapshot = createArtifactSnapshot(root),
    stdout = process.stdout,
  } = {},
) {
  const options = parseEnhancementAuditArgs(argv);
  if (options.help) {
    stdout.write(
      'Usage: npm run testing -- enhancements audit [--check]\nGenerate the offline JSON/Markdown enhancement audit, or verify both files without writing.\n',
    );
    return;
  }
  const result = await generateEnhancementAudit({ root, snapshot });
  const expected = [result.json, result.markdown];
  if (options.check) {
    for (let index = 0; index < ENHANCEMENT_AUDIT_OUTPUTS.length; index++) {
      const relative = ENHANCEMENT_AUDIT_OUTPUTS[index];
      const committed = await readExisting(path.join(outputRoot, relative));
      if (committed === null)
        throw new Error(
          `Enhancement audit: missing ${relative}. Run npm run testing -- enhancements audit.`,
        );
      if (committed !== expected[index])
        throw new Error(
          `Enhancement audit: stale ${relative}. Run npm run testing -- enhancements audit.`,
        );
    }
    await snapshot.assertUnchanged();
    stdout.write(
      `Enhancement audit is reproducible (${result.inputCount} inputs, ${result.migrationCount} migrations).\n`,
    );
  } else {
    await publishReports(outputRoot, snapshot, expected);
    stdout.write(`Enhancement audit generated: ${ENHANCEMENT_AUDIT_OUTPUTS.join(', ')}.\n`);
  }
  return result;
}

if (isDirectExecution(import.meta.url)) {
  try {
    await runEnhancementAudit();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
