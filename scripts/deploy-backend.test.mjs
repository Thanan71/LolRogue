import { describe, expect, it } from 'vitest';
import { resolveBackendDeployTarget } from './deploy-backend.mjs';

describe('backend deploy branch routing', () => {
  it('routes main to LolRogue', () => {
    expect(resolveBackendDeployTarget('main')).toEqual({
      projectName: 'LolRogue',
      projectRef: 'mmpvmclqdgfnpfgcqnyu',
    });
  });

  it('routes dev to LolRogueDev', () => {
    expect(resolveBackendDeployTarget('dev')).toEqual({
      projectName: 'LolRogueDev',
      projectRef: 'misdmtpfcbxbhheacehm',
    });
  });

  it('blocks every other branch', () => {
    expect(resolveBackendDeployTarget('feature/test')).toBeNull();
    expect(resolveBackendDeployTarget('fix/example')).toBeNull();
    expect(resolveBackendDeployTarget('')).toBeNull();
  });
});
