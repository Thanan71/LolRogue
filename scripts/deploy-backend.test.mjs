import { describe, expect, it } from 'vitest';
import { createBackendDeployPlan, resolveBackendDeployTarget } from './deploy-backend.mjs';

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
      'migrate',
      '--',
      '--project-ref',
      projectRef,
      '--dry-run',
    ]);
    expect(plan?.find(({ phase }) => phase === 'deploy-frontend')).toMatchObject({
      command: 'npx',
      captureStdout: true,
      args: expect.arrayContaining([
        'vercel@59.11.7',
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
      'migrate',
      '--',
      '--project-ref',
      projectRef,
      '--yes',
    ]);
    if (branch === 'main') {
      expect(plan?.find(({ phase }) => phase === 'promote-frontend')?.args).toEqual([
        '--yes',
        'vercel@59.11.7',
        'promote',
        '<frontend-deployment-url>',
        '--yes',
      ]);
    }
  });
});
