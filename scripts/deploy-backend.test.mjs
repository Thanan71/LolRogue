import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBackendDeployTarget } from './deploy-backend.mjs';

test('routes main to LolRogue', () => {
  assert.deepEqual(resolveBackendDeployTarget('main'), {
    projectName: 'LolRogue',
    projectRef: 'mmpvmclqdgfnpfgcqnyu',
  });
});

test('routes dev to LolRogueDev', () => {
  assert.deepEqual(resolveBackendDeployTarget('dev'), {
    projectName: 'LolRogueDev',
    projectRef: 'misdmtpfcbxbhheacehm',
  });
});

test('blocks every other branch', () => {
  assert.equal(resolveBackendDeployTarget('feature/test'), null);
  assert.equal(resolveBackendDeployTarget('fix/example'), null);
  assert.equal(resolveBackendDeployTarget(''), null);
});
