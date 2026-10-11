import { describe, expect, it, vi } from 'vitest';
import {
  createBackendDeployPlan,
  deployBackend,
  resolveBackendDeployTarget,
} from './deploy-backend.mjs';

describe('backend deploy branch routing', () => {
  it('routes main to LolRogue', () => {
    expect(resolveBackendDeployTarget('main')).toEqual({
      projectName: 'LolRogue',
      projectRef: 'mmpvmclqdgfnpfgcqnyu',
      vercelProject: 'lol-rogue',
      vercelTarget: 'production',
    });
  });

  it('routes dev to LolRogueDev', () => {
    expect(resolveBackendDeployTarget('dev')).toEqual({
      projectName: 'LolRogueDev',
      projectRef: 'misdmtpfcbxbhheacehm',
      vercelProject: 'lol-rogue',
      vercelTarget: 'preview',
    });
  });

  it('blocks every other branch', () => {
    expect(resolveBackendDeployTarget('feature/test')).toBeNull();
    expect(resolveBackendDeployTarget('fix/example')).toBeNull();
    expect(resolveBackendDeployTarget('')).toBeNull();
    expect(createBackendDeployPlan('feature/test')).toBeNull();
  });

  it.each([
    ['dev', 'misdmtpfcbxbhheacehm', 'preview'],
    ['main', 'mmpvmclqdgfnpfgcqnyu', 'production'],
  ])('deploys %s in the safe full-release order', (branch, projectRef, vercelTarget) => {
    const plan = createBackendDeployPlan(branch);

    const expectedPhases = [
      'validate-edge',
      'link-database',
      'preview-migrations',
      'deploy-edge',
      'deploy-frontend',
      'migrate-database',
      'verify-migrations',
      ...(branch === 'main' ? ['promote-frontend'] : []),
    ];
    expect(plan?.map(({ phase }) => phase)).toEqual(expectedPhases);
    expect(plan?.find(({ phase }) => phase === 'link-database')?.args).toContain(projectRef);
    expect(plan?.find(({ phase }) => phase === 'deploy-edge')?.args).toContain(projectRef);
    expect(plan?.find(({ phase }) => phase === 'preview-migrations')?.args).toEqual([
      'run',
      'database',
      '--',
      'migrate',
      '--project-ref',
      projectRef,
      '--preview',
    ]);
    expect(plan?.find(({ phase }) => phase === 'deploy-frontend')).toMatchObject({
      command: 'npx',
      captureStdout: true,
      args: expect.arrayContaining([
        '--offline',
        '--package=vercel@59.11.7',
        '--project',
        'lol-rogue',
        '--target',
        vercelTarget,
        '--build-env',
        `LOLROGUE_DEPLOY_BRANCH=${branch}`,
      ]),
    });
    const frontendArgs = plan?.find(({ phase }) => phase === 'deploy-frontend')?.args ?? [];
    expect(frontendArgs.includes('--skip-domain')).toBe(branch === 'main');
    expect(plan?.find(({ phase }) => phase === 'migrate-database')?.args).toEqual([
      'run',
      'database',
      '--',
      'migrate',
      '--project-ref',
      projectRef,
      '--yes',
    ]);
    if (branch === 'main') {
      expect(plan?.find(({ phase }) => phase === 'promote-frontend')?.args).toEqual([
        '--offline',
        '--yes',
        '--package=vercel@59.11.7',
        'vercel',
        'promote',
        '<frontend-deployment-url>',
        '--yes',
      ]);
    }
  });
});

function deploymentHarness(branch = 'dev') {
  const output = [];
  return {
    output,
    options: {
      root: '/repository',
      readBranch: vi.fn(() => branch),
      requireTool: vi.fn((name) => `/repository/node_modules/.bin/${name}`),
      assertNode: vi.fn(),
      runCommand: vi.fn(
        /** @type {import('./lib/critical-command.mjs').CommandRunner} */ (
          (_command, args, _spawnOptions) => ({
            status: 0,
            stdout: args.includes('--version')
              ? '59.11.7\n'
              : args[0] === 'projects'
                ? JSON.stringify([{ id: 'misdmtpfcbxbhheacehm' }, { id: 'mmpvmclqdgfnpfgcqnyu' }])
                : args.includes('deploy') && args.includes('vercel')
                  ? 'https://lol-rogue-test.vercel.app\n'
                  : '',
          })
        ),
      ),
      stdout: { write: (text) => output.push(text) },
    },
  };
}

describe('backend deploy preflight and subprocess contracts', () => {
  it.each(['feature/example', '', 'fix/maintenance'])(
    'cannot override forbidden Git branch %s with --branch dev',
    (branch) => {
      const { options } = deploymentHarness(branch);
      expect(() => deployBackend(['--branch', 'dev', '--dry-run'], options)).toThrow('BLOCKED');
      expect(options.requireTool).not.toHaveBeenCalled();
      expect(options.runCommand).not.toHaveBeenCalled();
    },
  );

  it('refuses a production override from the effective dev branch', () => {
    const { options } = deploymentHarness();
    expect(() => deployBackend(['--branch', 'main'], options)).toThrow('must match');
    expect(options.runCommand).not.toHaveBeenCalled();
  });

  it.each(['--unknown', '--project-ref', '--token'])(
    'refuses unsupported option %s before any subprocess',
    (argument) => {
      const { options } = deploymentHarness();
      expect(() => deployBackend([argument], options)).toThrow('Unknown');
      expect(options.readBranch).not.toHaveBeenCalled();
      expect(options.runCommand).not.toHaveBeenCalled();
    },
  );

  it('rejects a missing branch argument', () => {
    const { options } = deploymentHarness();
    expect(() => deployBackend(['--branch'], options)).toThrow('requires main or dev');
    expect(options.runCommand).not.toHaveBeenCalled();
  });

  it('reports a dry-run plan without building, linking, deploying, or spawning a provider', () => {
    const { options, output } = deploymentHarness('main');
    deployBackend(['--dry-run', '--branch', 'main'], options);
    expect(options.runCommand).not.toHaveBeenCalled();
    expect(options.requireTool.mock.calls.map(([name]) => name)).toEqual(['supabase']);
    expect(output.join('')).toContain('dry-run promote-frontend');
    expect(output.join('')).toContain('mmpvmclqdgfnpfgcqnyu');
  });

  it('checks every required CLI before the first local build or remote effect', () => {
    const { options } = deploymentHarness();
    options.runCommand.mockReturnValue({ status: 1, stderr: 'Not present in offline cache.' });
    expect(() => deployBackend([], options)).toThrow('Install it explicitly');
    expect(options.runCommand).toHaveBeenCalledTimes(1);
    expect(options.runCommand.mock.calls[0]?.[1]).toEqual([
      '--offline',
      '--yes',
      '--package=vercel@59.11.7',
      'vercel',
      '--version',
    ]);
  });

  it('refuses a missing repository Supabase CLI without executing even the offline Vercel probe', () => {
    const { options } = deploymentHarness();
    options.requireTool.mockImplementation(() => {
      throw new Error('Missing Supabase CLI; run npm ci.');
    });
    expect(() => deployBackend([], options)).toThrow('Missing Supabase');
    expect(options.runCommand).not.toHaveBeenCalled();
  });

  it('rejects an incompatible Vercel cache entry before any deployment step', () => {
    const { options } = deploymentHarness();
    options.runCommand.mockReturnValue({ status: 0, stdout: '63.1.2\n' });
    expect(() => deployBackend([], options)).toThrow('incompatible version');
    expect(options.runCommand).toHaveBeenCalledTimes(1);
  });

  it('uses the pinned binaries from the repository and preserves production promotion order', () => {
    const { options, output } = deploymentHarness('main');
    deployBackend(['--yes'], options);
    expect(options.runCommand.mock.calls[4]?.[0]).toBe('/repository/node_modules/.bin/supabase');
    expect(options.runCommand.mock.calls[7]?.[0]).toBe('npx');
    expect(options.runCommand.mock.calls.at(-1)?.slice(0, 2)).toEqual([
      'npx',
      [
        '--offline',
        '--yes',
        '--package=vercel@59.11.7',
        'vercel',
        'promote',
        'https://lol-rogue-test.vercel.app',
        '--yes',
      ],
    ]);
    expect(
      options.runCommand.mock.calls.every(
        ([, , spawnOptions]) => spawnOptions.cwd === '/repository',
      ),
    ).toBe(true);
    expect(options.runCommand.mock.calls[7]?.[2].stdio).toEqual(['inherit', 'pipe', 'inherit']);
    expect(output.join('')).toContain('https://lol-rogue-test.vercel.app\n');
  });

  it.each([
    [{ status: 17 }, 17],
    [{ status: null, signal: 'SIGINT' }, 130],
    [{ status: null, signal: 'SIGTERM' }, 143],
  ])('stops the sequence and preserves a failed child status %j', (result, expectedCode) => {
    const { options } = deploymentHarness();
    const implementation = options.runCommand.getMockImplementation();
    if (!implementation) throw new Error('Missing mock implementation.');
    options.runCommand.mockImplementation((command, args, spawnOptions) =>
      args.includes('bundle')
        ? /** @type {import('./lib/critical-command.mjs').CommandResult} */ (result)
        : implementation(command, args, spawnOptions),
    );
    /** @type {import('./lib/critical-command.mjs').CommandFailure | undefined} */
    let failure;
    try {
      deployBackend([], options);
    } catch (error) {
      failure = /** @type {import('./lib/critical-command.mjs').CommandFailure} */ (error);
    }
    expect(failure?.exitCode).toBe(expectedCode);
    expect(options.runCommand).toHaveBeenCalledTimes(4);
  });

  it('does not migrate or promote when Vercel returns an invalid deployment URL', () => {
    const { options } = deploymentHarness('main');
    const implementation = options.runCommand.getMockImplementation();
    if (!implementation) throw new Error('Missing mock implementation.');
    options.runCommand.mockImplementation((command, args, spawnOptions) =>
      args.includes('deploy') && args.includes('vercel')
        ? { status: 0, stdout: 'invalid' }
        : implementation(command, args, spawnOptions),
    );
    expect(() => deployBackend([], options)).toThrow('valid frontend deployment URL');
    expect(options.runCommand).toHaveBeenCalledTimes(8);
  });

  it('refuses absent Supabase project access before building or changing a provider', () => {
    const { options } = deploymentHarness();
    options.runCommand
      .mockReturnValueOnce({ status: 0, stdout: '59.11.7\n' })
      .mockReturnValueOnce({ status: 0, stdout: '[]' });
    expect(() => deployBackend([], options)).toThrow('cannot access LolRogueDev');
    expect(options.runCommand).toHaveBeenCalledTimes(2);
  });

  it.each(['not json', '{}'])(
    'rejects invalid project access response %s before changes',
    (stdout) => {
      const { options } = deploymentHarness();
      options.runCommand
        .mockReturnValueOnce({ status: 0, stdout: '59.11.7\n' })
        .mockReturnValueOnce({ status: 0, stdout });
      expect(() => deployBackend([], options)).toThrow('Deployment did not start');
      expect(options.runCommand).toHaveBeenCalledTimes(2);
    },
  );

  it('refuses missing Vercel authentication or project rights before building or linking', () => {
    const { options } = deploymentHarness();
    options.runCommand
      .mockReturnValueOnce({ status: 0, stdout: '59.11.7\n' })
      .mockReturnValueOnce({ status: 0, stdout: JSON.stringify([{ id: 'misdmtpfcbxbhheacehm' }]) })
      .mockReturnValueOnce({ status: 9, stderr: 'Not authorized' });
    expect(() => deployBackend([], options)).toThrow('Vercel project access preflight');
    expect(options.runCommand).toHaveBeenCalledTimes(3);
  });
});
