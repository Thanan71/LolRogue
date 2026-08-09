import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { assertNodeVersionContract } from '../scripts/lib/node-version-contract.mjs';

const coherentContract = {
  nvmrc: '24',
  nodeEngine: '24.x',
  nodeTypes: '24.13.3',
  lockedNodeTypes: '24.13.3',
  workflows: [
    {
      path: '.github/workflows/ci.yml',
      content: 'uses: actions/setup-node@sha\nwith:\n  node-version: 24\n',
    },
  ],
};

describe('Node version contract', () => {
  it('accepts a single major across runtime, types, lockfile and workflows', () => {
    expect(assertNodeVersionContract(coherentContract)).toEqual({
      runtimeMajor: 24,
      workflowCount: 1,
    });
  });

  it.each([
    ['package engine', { nodeEngine: '26.x' }, 'engines.node targets Node 26'],
    ['Node types', { nodeTypes: '26.2.0' }, '@types/node targets Node 26'],
    [
      'workflow runtime',
      {
        workflows: [
          {
            path: '.github/workflows/ci.yml',
            content: 'uses: actions/setup-node@sha\nwith:\n  node-version: 26\n',
          },
        ],
      },
      '.github/workflows/ci.yml targets Node 26',
    ],
  ])('rejects a divergent %s', (_label, override, expectedMessage) => {
    expect(() => assertNodeVersionContract({ ...coherentContract, ...override })).toThrow(
      expectedMessage,
    );
  });

  it('checks the repository declarations through the executable guard', () => {
    const output = execFileSync(process.execPath, ['scripts/check-node-version-contract.mjs'], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
    });

    expect(output).toContain('Node version contract verified on major 24');
  });
});
