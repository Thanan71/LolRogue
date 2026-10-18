import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCommandPlan, parseCommand, runCli } from '../scripts/cli.mjs';
import { runCommandPlan } from '../scripts/lib/command-runner.mjs';
import { resolveDeploymentTarget } from '../scripts/lib/environment-config.mjs';
import {
  assertLocalDatabaseEnvironment,
  parseDatabaseScopeArguments,
  readEffectiveBranch,
  resolveBackupSource,
  resolveRemoteOperation,
  supabaseEnvironment,
  validateDatabaseUrl,
} from '../scripts/lib/remote-operation.mjs';

const projectRef = resolveDeploymentTarget('dev').projectRef;
const productionRef = resolveDeploymentTarget('main').projectRef;
const directories = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function context(branch = 'dev', linked = resolveDeploymentTarget(branch)?.projectRef) {
  return {
    root: path.resolve(import.meta.dirname, '..'),
    env: {},
    readBranch: () => branch,
    readLinkedRef: () => linked,
  };
}

describe('approved remote operation boundary', () => {
  it.each(['dev', 'main'])(
    'requires the explicit approved target and confirmation for %s mutations',
    (branch) => {
      const target = resolveDeploymentTarget(branch);
      expect(
        resolveRemoteOperation(
          { projectRef: target.projectRef, linked: true, mutation: true, yes: true },
          context(branch),
        ),
      ).toEqual({ branch, ...target });
      expect(() =>
        resolveRemoteOperation({ projectRef: target.projectRef, mutation: true }, context(branch)),
      ).toThrow('confirmation');
      expect(() => resolveRemoteOperation({}, context(branch))).toThrow('explicit --project-ref');
    },
  );

  it.each(['feature/unsafe', 'fix/example', ''])(
    'rejects Git branch %s despite production branch environment variables',
    (branch) => {
      expect(() =>
        resolveRemoteOperation(
          { projectRef: productionRef, yes: true, mutation: true },
          {
            ...context(branch),
            env: {
              LOLROGUE_DEPLOY_BRANCH: 'main',
              VERCEL_GIT_COMMIT_REF: 'main',
              GITHUB_REF_NAME: 'main',
            },
          },
        ),
      ).toThrow('effective main or dev');
    },
  );

  it.each([undefined, '', productionRef, 'unknown-project'])(
    'rejects implicit or incorrect refs before a linked query: %s',
    (ref) =>
      expect(() => resolveRemoteOperation({ projectRef: ref, linked: true }, context())).toThrow(),
  );

  it('rejects an approved explicit ref when the linked project differs', () => {
    expect(() =>
      resolveRemoteOperation({ projectRef, linked: true }, context('dev', productionRef)),
    ).toThrow('linked Supabase project');
  });

  it.each([
    { SUPABASE_WORKDIR: '/elsewhere' },
    { SUPABASE_PROJECT_ID: productionRef },
    { SUPABASE_PROFILE: 'private-custom-provider' },
    { PGHOSTADDR: '203.0.113.10' },
    { PGSERVICE: 'other-database' },
    { PGSERVICEFILE: '/other-service' },
    { SUPABASE_DB_URL: `postgresql://postgres:PRIVATE@db.${productionRef}.supabase.co/postgres` },
  ])('rejects environment target overrides without exposing values', (env) => {
    expect(() =>
      resolveRemoteOperation({ projectRef, linked: true }, { ...context(), env }),
    ).toThrow('forbidden');
    try {
      resolveRemoteOperation({ projectRef }, { ...context(), env });
    } catch (error) {
      expect(error.message).not.toContain('PRIVATE');
    }
  });

  it('reads the worktree branch without trusting a redirected Git directory', () => {
    const featureRoot = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-feature-git-'));
    const approvedRoot = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-approved-git-'));
    directories.push(featureRoot, approvedRoot);
    execFileSync('git', ['init', '--quiet', '-b', 'feature/review', featureRoot]);
    execFileSync('git', ['init', '--quiet', '-b', 'dev', approvedRoot]);
    vi.stubEnv('GIT_DIR', path.join(approvedRoot, '.git'));
    expect(readEffectiveBranch(featureRoot)).toBe('feature/review');
    expect(() =>
      resolveRemoteOperation({ projectRef, mutation: true, yes: true }, { root: featureRoot }),
    ).toThrow('Git repository context overrides');
  });

  it.each(['GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_CONFIG_COUNT'])(
    'rejects Git context override %s before reading branch or linked state',
    (name) => {
      const readBranch = vi.fn(() => 'dev');
      expect(() =>
        resolveRemoteOperation(
          { projectRef, linked: true },
          { ...context(), readBranch, env: { [name]: '/other' } },
        ),
      ).toThrow('Git repository context overrides');
      expect(readBranch).not.toHaveBeenCalled();
    },
  );

  it('allows derived target only for an explicit backend dry-run', () => {
    expect(
      resolveRemoteOperation({ dryRun: true, allowDerived: true, mutation: true }, context())
        .projectRef,
    ).toBe(projectRef);
    expect(() =>
      resolveRemoteOperation({ allowDerived: true, mutation: true, yes: true }, context()),
    ).toThrow('--project-ref');
  });

  it.each([
    ['--linked', '--linked'],
    ['--local', '--linked'],
    ['--linked', '--project-ref'],
    ['--db-url', 'postgresql://private'],
    ['--workdir', '/elsewhere'],
    ['--project-ref=PRIVATE'],
    ['--project-ref', projectRef],
    ['--linked', '--project-ref', projectRef, '--project-ref', projectRef],
  ])('rejects ambiguous, repeated or unsupported database scope options: %j', (...args) => {
    expect(() => parseDatabaseScopeArguments(args)).toThrow();
  });
});

describe('database URL boundary', () => {
  it.each([
    ['desktop-local', 'unix:///var/run/docker.sock', true],
    ['colima-local', 'unix:///tmp/colima/docker.sock', true],
    ['remote', 'tcp://remote.example:2376', false],
    ['remote-ssh', 'ssh://docker@remote.example', false],
  ])(
    'validates the selected persisted Docker context %s without contacting Docker',
    (name, endpoint, local) => {
      const directory = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-docker-context-'));
      directories.push(directory);
      writeFileSync(
        path.join(directory, 'config.json'),
        JSON.stringify({ currentContext: name, auths: { private: 'PRIVATE' } }),
      );
      const metadata = path.join(
        directory,
        'contexts/meta',
        createHash('sha256').update(name).digest('hex'),
      );
      mkdirSync(metadata, { recursive: true });
      writeFileSync(
        path.join(metadata, 'meta.json'),
        JSON.stringify({ Endpoints: { docker: { Host: endpoint } } }),
      );
      const check = () => assertLocalDatabaseEnvironment({ DOCKER_CONFIG: directory });
      if (local) expect(check).not.toThrow();
      else {
        expect(check).toThrow('local Docker endpoint');
        expect(() =>
          assertLocalDatabaseEnvironment({
            DOCKER_CONFIG: directory,
            DOCKER_HOST: 'unix:///var/run/docker.sock',
            DOCKER_CONTEXT: name,
          }),
        ).toThrow('local Docker endpoint');
      }
    },
  );

  it.each(['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE'])(
    'rejects a backup target override %s from project dotenv files',
    (key) => {
      const root = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-backup-environment-'));
      directories.push(root);
      mkdirSync(path.join(root, 'supabase'));
      writeFileSync(
        path.join(root, 'supabase/.env.development.local'),
        `${key}:remote-target\nPRIVATE_KEY=PRIVATE\n`,
      );
      expect(() =>
        resolveBackupSource(
          { local: true },
          { root, env: { SUPABASE_DB_URL: 'postgresql://postgres:PRIVATE@127.0.0.1/postgres' } },
        ),
      ).toThrow('project environment files');
    },
  );

  it('rejects a local stack project override from project dotenv files', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-stack-environment-'));
    directories.push(root);
    mkdirSync(path.join(root, 'supabase'));
    writeFileSync(path.join(root, 'supabase/.env'), 'SUPABASE_PROJECT_ID=other-stack\n');
    expect(() => assertLocalDatabaseEnvironment({}, root)).toThrow('project environment files');
  });

  it.each([
    { SUPABASE_SERVICES_HOSTNAME: 'remote.example' },
    { DOCKER_HOST: 'tcp://remote.example:2376' },
    { DOCKER_HOST: 'ssh://docker@remote.example' },
    { DOCKER_HOST: 'npipe:////remote-server/pipe/docker_engine' },
    { DOCKER_HOST: 'unix://remote.example/var/run/docker.sock' },
    { CONTAINER_HOST: 'ssh://docker@remote.example' },
    { CONTAINER_CONNECTION: 'remote' },
    { PGHOSTADDR: '203.0.113.10' },
    { PGSERVICE: 'other-database' },
    { PGSERVICEFILE: '/other-service' },
    { SUPABASE_PROFILE: 'private-custom-provider' },
  ])(
    'rejects service, container and PostgreSQL endpoint overrides before a local operation',
    (env) => {
      expect(() => assertLocalDatabaseEnvironment(env)).toThrow(/forbidden|loopback|local Docker/);
    },
  );

  it.each([
    { SUPABASE_SERVICES_HOSTNAME: 'localhost' },
    { DOCKER_HOST: 'unix:///var/run/docker.sock' },
    { DOCKER_HOST: 'npipe:////./pipe/docker_engine' },
    { DOCKER_HOST: 'tcp://127.0.0.1:2375' },
  ])('preserves local Docker and service endpoints', (env) => {
    expect(() => assertLocalDatabaseEnvironment(env)).not.toThrow();
  });

  it('pins the built-in Supabase profile only in the execution environment', async () => {
    const execute = vi.fn(async () => 0);
    expect(
      await runCli(['database', 'start'], { ...context(), env: { SAFE_MARKER: 'value' }, execute }),
    ).toBe(0);
    const [plan, executionOptions] = execute.mock.calls[0];
    expect(executionOptions.env).toEqual({ SAFE_MARKER: 'value', SUPABASE_PROFILE: 'supabase' });
    expect(plan.every((step) => !Object.hasOwn(step, 'env'))).toBe(true);
    expect(supabaseEnvironment({ SUPABASE_PROFILE: 'supabase' })).toEqual({
      SUPABASE_PROFILE: 'supabase',
    });
  });
  it.each(['require', 'verify-ca', 'verify-full'])(
    'accepts only approved direct Supabase URL with safe TLS mode %s',
    (mode) => {
      expect(
        validateDatabaseUrl(
          `postgresql://postgres:PRIVATE@db.${projectRef}.supabase.co/postgres?sslmode=${mode}`,
          { projectRef },
        ).hostname,
      ).toBe(`db.${projectRef}.supabase.co`);
    },
  );

  it('accepts the approved account on Supabase pooler hosts', () => {
    expect(
      validateDatabaseUrl(
        `postgresql://postgres.${projectRef}:PRIVATE@aws-0-eu-west-3.pooler.supabase.com:6543/postgres?sslmode=require`,
        { projectRef },
      ).hostname,
    ).toBe('aws-0-eu-west-3.pooler.supabase.com');
  });

  it.each(['127.0.0.1', 'localhost', '[::1]'])(
    'keeps explicit local backup on loopback host %s',
    (host) => {
      expect(() =>
        validateDatabaseUrl(`postgresql://postgres:PRIVATE@${host}:55322/postgres?sslmode=prefer`, {
          local: true,
        }),
      ).not.toThrow();
    },
  );

  it.each([
    `postgresql://postgres:PRIVATE@db.${productionRef}.supabase.co/postgres`,
    `postgresql://postgres.${productionRef}:PRIVATE@aws-0-eu-west-3.pooler.supabase.com/postgres`,
    `postgresql://postgres:PRIVATE@db.${projectRef}.supabase.co.evil.example/postgres`,
    `postgresql://postgres:PRIVATE@db.${projectRef}.supabase.co/postgres?host=evil.example`,
    `postgresql://postgres:PRIVATE@db.${projectRef}.supabase.co/postgres?options=-c`,
    `postgresql://postgres:PRIVATE@db.${projectRef}.supabase.co/postgres?sslmode=require&sslmode=disable`,
    `postgresql://postgres:PRIVATE@db.${projectRef}.supabase.co/postgres?sslmode=disable`,
  ])('rejects wrong project, host and query overrides without printing credentials: %s', (url) => {
    expect(() => validateDatabaseUrl(url, { projectRef })).toThrow();
    try {
      validateDatabaseUrl(url, { projectRef });
    } catch (error) {
      expect(error.message).not.toContain('PRIVATE');
    }
  });

  it('prevents local test and reset commands from reaching a remote URL', () => {
    expect(() =>
      assertLocalDatabaseEnvironment({
        SUPABASE_DB_URL: `postgresql://postgres:PRIVATE@db.${productionRef}.supabase.co/postgres`,
      }),
    ).toThrow('loopback');
    expect(() =>
      assertLocalDatabaseEnvironment({
        VITE_PUBLIC_SUPABASE_URL: `https://${productionRef}.supabase.co`,
      }),
    ).toThrow('loopback');
    expect(() => assertLocalDatabaseEnvironment({ SUPABASE_WORKDIR: '/elsewhere' })).toThrow(
      'overrides',
    );
    expect(() =>
      assertLocalDatabaseEnvironment({
        SUPABASE_DB_URL: 'postgresql://postgres:PRIVATE@127.0.0.1/postgres?sslmode=prefer',
        VITE_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321',
      }),
    ).not.toThrow();
  });
});

describe('remote plan concurrency and read-only preview', () => {
  it.each([
    ['database', 'start'],
    ['database', 'stop'],
    ['release', 'edge', 'serve'],
  ])('rejects local workdir overrides before planning a child: %j', async (...invocation) => {
    const execute = vi.fn(async () => 0);
    const errors = [];
    expect(
      await runCli([...invocation, '--yes'], {
        ...context(),
        env: { SUPABASE_WORKDIR: '/other' },
        execute,
        stderr: { write: (text) => errors.push(text) },
      }),
    ).toBe(1);
    expect(JSON.parse(errors.join('')).error.code).toBe('CLI_TARGET_OVERRIDE');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    {
      branch: 'feature/review',
      ref: projectRef,
      url: `postgresql://postgres:PRIVATE@db.${projectRef}.supabase.co/postgres`,
    },
    {
      branch: 'dev',
      ref: productionRef,
      url: `postgresql://postgres:PRIVATE@db.${productionRef}.supabase.co/postgres`,
    },
    { branch: 'dev', ref: projectRef, url: 'postgresql://postgres:PRIVATE@evil.example/postgres' },
  ])(
    'validates backup scope before printing a dry-run plan: $branch',
    async ({ branch, ref, url }) => {
      const execute = vi.fn(async () => 0);
      const output = [];
      expect(
        await runCli(['release', 'backup', '--project-ref', ref, '--dry-run'], {
          ...context(branch),
          env: { SUPABASE_DB_URL: url },
          execute,
          stdout: { write: (text) => output.push(text) },
          stderr: { write: () => {} },
        }),
      ).toBe(1);
      expect(execute).not.toHaveBeenCalled();
      expect(output).toEqual([]);
    },
  );

  it('rejects changed linked state between plan creation and execution of a child', async () => {
    const readLinkedRef = vi.fn().mockReturnValueOnce(projectRef).mockReturnValue(productionRef);
    const execute = vi.fn(async (_plan, options) => {
      await options.beforeStep();
      return 0;
    });
    const errors = [];
    const status = await runCli(['database', 'migrate', '--project-ref', projectRef, '--yes'], {
      ...context(),
      readLinkedRef,
      execute,
      stderr: { write: (text) => errors.push(text) },
    });
    expect(status).toBe(1);
    expect(JSON.parse(errors.join('')).error.code).toBe('CLI_LINK_MISMATCH');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('checks the guard before every subprocess and stops before a later effect', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'lolrogue-remote-guard-'));
    directories.push(root);
    const marker = path.join(root, 'must-not-exist');
    const beforeStep = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementation(() => {
        throw new Error('Linked project changed');
      });
    await expect(
      runCommandPlan(
        [
          { command: process.execPath, args: ['-e', 'process.exit(0)'] },
          {
            command: process.execPath,
            args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'effect')`],
          },
        ],
        { cwd: root, beforeStep },
      ),
    ).rejects.toThrow('Linked project changed');
    expect(beforeStep).toHaveBeenCalledTimes(2);
    expect(existsSync(marker)).toBe(false);
  });

  it('consumes project-ref wrapper flag and previews the verified linked database', async () => {
    const plan = await createCommandPlan(
      parseCommand(['database', 'migrate', '--project-ref', projectRef, '--preview']),
      context(),
    );
    expect(plan[0].args).toEqual([
      'db',
      'push',
      '--linked',
      // Project ref was validated before constructing the native CLI command.
      // db push does not accept a project-ref option.
      '--dry-run',
    ]);
  });
});
