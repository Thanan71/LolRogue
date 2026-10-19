import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertDeployableMigrationHistory } from '../scripts/lib/migration-manifest.mjs';
import { resolveDeploymentTarget } from '../scripts/lib/environment-config.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const candidate = ['20260101000000', '20260102000000', '20260103000000'];
const projectRef = resolveDeploymentTarget('dev').projectRef;
const directories = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function deploymentFixture({
  branch = 'dev',
  linkedRef = projectRef,
  applied = candidate.slice(0, 2),
  output,
  exitCode = 0,
  stderr = '',
} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-deploy-preflight-'));
  directories.push(root);
  for (const directory of [
    'scripts/lib',
    'supabase/migrations',
    'supabase/.temp',
    'node_modules/.bin',
    'node_modules/supabase',
  ])
    mkdirSync(path.join(root, directory), { recursive: true });
  for (const file of [
    'scripts/check-database-deploy-plan.mjs',
    'scripts/lib/critical-command.mjs',
    'scripts/lib/environment-config.mjs',
    'scripts/lib/migration-manifest.mjs',
    'scripts/lib/remote-operation.mjs',
  ])
    copyFileSync(path.join(repositoryRoot, file), path.join(root, file));

  const supabaseVersion = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'),
  ).devDependencies.supabase;
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ type: 'module', devDependencies: { supabase: supabaseVersion } }),
  );
  writeFileSync(
    path.join(root, 'node_modules/supabase/package.json'),
    JSON.stringify({ version: supabaseVersion }),
  );
  for (const version of candidate)
    writeFileSync(path.join(root, `supabase/migrations/${version}_fixture.sql`), 'select 1;\n');
  writeFileSync(path.join(root, 'supabase/.temp/project-ref'), linkedRef);

  const table =
    output ??
    [
      'Local | Remote | Time (UTC)',
      ...[...new Set([...candidate, ...applied])]
        .sort()
        .map(
          (version) =>
            `${candidate.includes(version) ? version : ''} | ${applied.includes(version) ? version : ''} | fixture`,
        ),
    ].join('\n');
  const invocation = path.join(root, 'invocation.json');
  const stub = path.join(root, 'node_modules/supabase/stub.mjs');
  writeFileSync(
    stub,
    `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(invocation)}, JSON.stringify({
  arguments: process.argv.slice(2),
  profile: process.env.SUPABASE_PROFILE,
}));
process.stdout.write(${JSON.stringify(table)});
process.stderr.write(${JSON.stringify(stderr)});
process.exit(${exitCode});
`,
  );
  const executable = path.join(
    root,
    'node_modules/.bin',
    process.platform === 'win32' ? 'supabase.cmd' : 'supabase',
  );
  writeFileSync(
    executable,
    process.platform === 'win32'
      ? `@"${process.execPath}" "${stub}" %*\r\n`
      : `#!${process.execPath}\nimport ${JSON.stringify(stub)};\n`,
    { mode: 0o755 },
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^(GIT_|SUPABASE_|PG)/.test(name)),
  );
  execFileSync('git', ['init', '-b', branch], { cwd: root, env, stdio: 'ignore' });
  return {
    invocation,
    run() {
      return spawnSync(
        process.execPath,
        ['scripts/check-database-deploy-plan.mjs', '--linked', '--project-ref', projectRef],
        { cwd: root, env, encoding: 'utf8', timeout: 10_000 },
      );
    },
  };
}

describe('remote migration deployment preflight', () => {
  it('accepts only an already-applied prefix and lists pending migrations', () => {
    expect(assertDeployableMigrationHistory(candidate, [])).toEqual({
      applied: 0,
      pending: candidate,
    });
    expect(assertDeployableMigrationHistory(candidate, candidate.slice(0, 2))).toEqual({
      applied: 2,
      pending: ['20260103000000'],
    });
    expect(assertDeployableMigrationHistory(candidate, candidate)).toEqual({
      applied: 3,
      pending: [],
    });
  });

  it.each([
    [['20260102000000'], 'skipped first migration'],
    [['20260101000000', '20260103000000'], 'gap inside deployed history'],
    [['20260102000000', '20260101000000'], 'unexpected ordering'],
    [['20260101000000', '20260101000000'], 'duplicate history entry'],
    [['20260101000000', '20260104000000'], 'migration unknown to this candidate'],
  ])('rejects %s (%s)', (applied) => {
    expect(() => assertDeployableMigrationHistory(candidate, applied)).toThrow(
      'Remote migrations do not form a known prefix',
    );
  });
});

describe('deployment preflight executable', () => {
  it('reads only the approved linked project and reports pending migrations', () => {
    const fixture = deploymentFixture();
    const result = fixture.run();

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Safe migration prefix: 2 applied; 1 pending; latest candidate 20260103000000.',
    );
    expect(result.stderr).toContain(`dev -> LolRogueDev (${projectRef})`);
    expect(JSON.parse(readFileSync(fixture.invocation, 'utf8'))).toEqual({
      arguments: ['migration', 'list', '--linked'],
      profile: 'supabase',
    });
  });

  it.each([
    ['a gap in applied history', [candidate[0], candidate[2]]],
    ['a remote-only migration', [candidate[0], '20260104000000']],
  ])('rejects %s returned by the CLI', (_, applied) => {
    const fixture = deploymentFixture({ applied });
    const result = fixture.run();

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Remote migrations do not form a known prefix');
    expect(existsSync(fixture.invocation)).toBe(true);
  });

  it.each([
    {
      branch: 'dev',
      linkedRef: resolveDeploymentTarget('main').projectRef,
      error: 'The linked Supabase project does not match the explicit approved target',
    },
    {
      branch: 'feature/not-approved',
      linkedRef: projectRef,
      error: 'Remote operations require the effective main or dev Git branch',
    },
  ])('rejects $branch / $linkedRef before invoking Supabase', ({ branch, linkedRef, error }) => {
    const fixture = deploymentFixture({ branch, linkedRef });
    const result = fixture.run();

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(error);
    expect(existsSync(fixture.invocation)).toBe(false);
  });

  it('fails closed when the CLI output is unrecognized', () => {
    const fixture = deploymentFixture({ output: 'No recognizable migration table' });
    const result = fixture.run();

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Supabase returned an empty or unrecognized migration table');
  });

  it('propagates a failed migration list command without accepting its output', () => {
    const fixture = deploymentFixture({ exitCode: 17, stderr: 'fixture connection failed' });
    const result = fixture.run();

    expect(result.status).toBe(17);
    expect(result.stderr).toContain('fixture connection failed');
    expect(result.stdout).not.toContain('Safe migration prefix');
  });
});
